import { ArrowUpRight, FileText, Image as ImageIcon, Layers, Link2, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  BRIEF_COLOURS,
  BRIEF_FONTS,
  type Brief,
  type BriefColour,
  type BriefItem,
  type BriefList,
} from '@cherry/shared';
import { sendChat } from '../../../api/chat.ts';
import {
  designFileUrl,
  removeBriefItem,
  saveBrief,
  tokensFrom,
  uploadBriefFile,
  useBrief,
  useFonts,
} from '../../../api/design.ts';
import { useProjects } from '../../../api/queries.ts';
import { contrast, grade } from '../../../lib/contrast.ts';
import { readMode } from '../ChatTab.tsx';
import styles from './BriefPanel.module.css';

/** Where to look for references; Cherry links them and never fetches them (r8). */
const LOOK = [
  ['Pinterest', 'https://www.pinterest.com/search/pins/?q='],
  ['Dribbble', 'https://dribbble.com/search/'],
  ['Mobbin', 'https://mobbin.com/search/apps/ios?content_type=screens&q='],
  ['Godly', 'https://godly.website/?search='],
  ['Land-book', 'https://land-book.com/search?search='],
  ['Behance', 'https://www.behance.net/search/projects?search='],
] as const;

const COLOUR_LABEL: Record<BriefColour, string> = {
  primary: 'Primary',
  accent: 'Accent',
  surface: 'Surface',
  text: 'Text',
  muted: 'Muted',
};
const FONT_LABEL = { heading: 'Headings', body: 'Body', numbers: 'Numbers' } as const;
const WEIGHTS = [300, 400, 500, 600, 700, 800];
const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(p);
const fileName = (p: string) => p.split('/').pop() ?? p;

/**
 * The Brief (V3 r8, artboard 02): what the Designer works from. References, a design system,
 * components, images, colours and fonts, kept in design/brief.json and design/.
 */
export function BriefPanel({ projectId, idea }: { projectId: string; idea: string }) {
  const brief = useBrief(projectId).data;
  const [draft, setDraft] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [told, setTold] = useState(false);
  const shown = draft ?? brief;
  const timer = useRef<number | null>(null);

  // Colours and fonts save half a second after the last change.
  const change = (next: Brief) => {
    setDraft(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void saveBrief(projectId, next)
        .then(() => setDraft(null))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'));
    }, 500);
  };
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const upload = (list: BriefList, files: FileList | File[]) => {
    setError(null);
    for (const f of files)
      void uploadBriefFile(projectId, list, f).catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Upload failed.'),
      );
  };
  const remove = (list: BriefList, item: BriefItem) => {
    setError(null);
    void removeBriefItem(projectId, list, item.value).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not remove it.'),
    );
  };

  if (!shown) return <aside className={styles.panel} aria-label="Brief" />;
  const c = shown.colours;
  const ratio = c.text && c.surface ? contrast(c.text, c.surface) : null;

  return (
    <aside className={styles.panel} aria-label="Brief">
      <header className={styles.head}>
        <span className={styles.title}>Brief</span>
        <span className={styles.grow} />
        <FilePick
          label="Add references"
          accept="image/*"
          onFiles={(f) => upload('references', f)}
          icon={<Plus size={15} aria-hidden="true" />}
        />
      </header>
      <div className={styles.scroll}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <Section
          label="References"
          count={shown.references.length}
          onDrop={(f) => upload('references', f)}
        >
          <div className={styles.thumbs}>
            {shown.references
              .filter((r) => r.kind === 'file')
              .map((r) => (
                <figure key={r.value} className={styles.thumb}>
                  {isImage(r.value) ? (
                    <img src={designFileUrl(projectId, r.value)} alt={fileName(r.value)} />
                  ) : (
                    <FileText size={16} aria-hidden="true" />
                  )}
                  <RemoveBtn label={fileName(r.value)} onClick={() => remove('references', r)} />
                </figure>
              ))}
            <FilePick
              label="Add a reference image"
              accept="image/*"
              tile
              onFiles={(f) => upload('references', f)}
              icon={<Plus size={16} aria-hidden="true" />}
            />
          </div>
          {shown.references
            .filter((r) => r.kind === 'link')
            .map((r) => (
              <div key={r.value} className={styles.link}>
                <Link2 size={13} aria-hidden="true" />
                <a href={r.value} target="_blank" rel="noreferrer" title={r.value}>
                  {r.value.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
                <RemoveBtn label={r.value} onClick={() => remove('references', r)} />
              </div>
            ))}
          <LinkInput
            onAdd={(url) =>
              void saveBrief(projectId, {
                ...shown,
                references: [...shown.references, { kind: 'link', value: url, note: '' }],
              }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
            }
          />
          <div className={styles.look}>
            <span>Find more</span>
            {LOOK.map(([name, url]) => (
              <a
                key={name}
                href={`${url}${encodeURIComponent(idea)}`}
                target="_blank"
                rel="noreferrer"
              >
                {name}
                <ArrowUpRight size={11} aria-hidden="true" />
              </a>
            ))}
          </div>
        </Section>

        <Section label="Design system" onDrop={(f) => upload('system', f)}>
          {[...shown.system, ...shown.components].map((s) => {
            const list: BriefList = shown.system.includes(s) ? 'system' : 'components';
            return (
              <div key={s.value} className={styles.item}>
                <Layers size={14} aria-hidden="true" />
                <span className={styles.itemName} title={s.value}>
                  {fileName(s.value)}
                </span>
                <span className={styles.itemTag}>
                  {list === 'system' ? 'system' : 'components'}
                </span>
                <RemoveBtn label={fileName(s.value)} onClick={() => remove(list, s)} />
              </div>
            );
          })}
          <div className={styles.row2}>
            <FilePick
              label="Design system"
              text="Design system"
              accept=".css,.scss,.json,.md,.txt,.zip,.pdf,.yaml,.yml"
              onFiles={(f) => upload('system', f)}
              icon={<Plus size={13} aria-hidden="true" />}
            />
            <FilePick
              label="Components"
              text="Components"
              accept=".css,.json,.md,.txt,.zip,.pdf,.html,image/*"
              onFiles={(f) => upload('components', f)}
              icon={<Plus size={13} aria-hidden="true" />}
            />
          </div>
          <FromProject
            projectId={projectId}
            onPick={(from) =>
              void tokensFrom(projectId, from).catch((e: unknown) =>
                setError(e instanceof Error ? e.message : 'Could not copy the tokens.'),
              )
            }
          />
        </Section>

        <Section label="Images" count={shown.images.length} onDrop={(f) => upload('images', f)}>
          <div className={styles.chips}>
            {shown.images.map((i) => (
              <span key={i.value} className={styles.chip}>
                <ImageIcon size={13} aria-hidden="true" />
                <span title={i.value}>{fileName(i.value)}</span>
                <RemoveBtn label={fileName(i.value)} onClick={() => remove('images', i)} />
              </span>
            ))}
            <FilePick
              label="Add images (logos, photos, icons)"
              text="Image"
              accept="image/*"
              onFiles={(f) => upload('images', f)}
              icon={<Plus size={13} aria-hidden="true" />}
            />
          </div>
        </Section>

        <Section
          label="Colours"
          extra={
            ratio !== null && (
              <span
                className={styles.grade}
                data-grade={grade(ratio)}
                title="Text on surface, WCAG 2.1"
              >
                {grade(ratio)} {ratio}
              </span>
            )
          }
        >
          <div className={styles.swatches}>
            {BRIEF_COLOURS.map((k) => (
              <label key={k} className={styles.swatch}>
                <span
                  className={styles.colour}
                  data-empty={!c[k] || undefined}
                  style={c[k] ? { background: c[k] } : undefined}
                >
                  <input
                    type="color"
                    aria-label={`${COLOUR_LABEL[k]} colour`}
                    value={c[k] ?? '#888888'}
                    onChange={(e) =>
                      change({ ...shown, colours: { ...c, [k]: e.target.value.toUpperCase() } })
                    }
                  />
                </span>
                <span className={styles.swatchName}>{COLOUR_LABEL[k]}</span>
                <span className={styles.hex}>{c[k]?.slice(1) ?? '—'}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section label="Fonts">
          {BRIEF_FONTS.map((k) => (
            <FontRow
              key={k}
              label={FONT_LABEL[k]}
              sample={k === 'numbers' ? '12' : 'Aa'}
              value={shown.fonts[k]}
              onChange={(v) => change({ ...shown, fonts: { ...shown.fonts, [k]: v } })}
            />
          ))}
          <p className={styles.note}>
            Fonts on this computer and Cherry&apos;s Geist only; no web fonts (they send data off
            the machine).
          </p>
        </Section>
      </div>
      <footer className={styles.foot}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={told}
          onClick={() => {
            setTold(true);
            void sendChat(
              projectId,
              'design',
              'I updated the brief. Read design/brief.json and the files it lists (references, design system, components, images), then use its colours and fonts in design/tokens.css and the screens. Say in a few lines what you will change.',
              readMode(projectId, 'design'),
            ).finally(() => window.setTimeout(() => setTold(false), 3000));
          }}
        >
          {told ? 'Sent to the Designer' : 'Tell the Designer'}
        </button>
      </footer>
    </aside>
  );
}

function Section({
  label,
  count,
  extra,
  onDrop,
  children,
}: {
  label: string;
  count?: number;
  extra?: ReactNode;
  onDrop?(files: FileList): void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const drop = onDrop && {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setOver(false);
      onDrop(e.dataTransfer.files);
    },
  };
  return (
    <section className={styles.section} aria-label={label} data-over={over || undefined} {...drop}>
      <div className={styles.sectionHead}>
        <span className={styles.label}>{label}</span>
        {extra}
        {count !== undefined && count > 0 && <span className={styles.count}>{count}</span>}
      </div>
      {children}
    </section>
  );
}

function FilePick({
  label,
  text,
  accept,
  icon,
  tile,
  onFiles,
}: {
  label: string;
  text?: string;
  accept: string;
  icon: ReactNode;
  tile?: boolean;
  onFiles(files: FileList): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={tile ? styles.tile : text ? styles.add : styles.icon}
        aria-label={label}
        title={label}
        onClick={() => input.current?.click()}
      >
        {icon}
        {text}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={accept}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

function RemoveBtn({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      className={styles.remove}
      aria-label={`Remove ${label}`}
      onClick={onClick}
    >
      <X size={12} aria-hidden="true" />
    </button>
  );
}

function LinkInput({ onAdd }: { onAdd(url: string): void }) {
  const [v, setV] = useState('');
  const ok = /^https?:\/\/\S+\.\S+/.test(v.trim());
  return (
    <form
      className={styles.linkForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onAdd(v.trim());
        setV('');
      }}
    >
      <Link2 size={13} aria-hidden="true" />
      <input
        aria-label="Paste a reference link"
        placeholder="Paste a link (pinterest.com/pin/…)"
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      {ok && (
        <button type="submit" className={styles.linkAdd}>
          Add
        </button>
      )}
    </form>
  );
}

function FromProject({ projectId, onPick }: { projectId: string; onPick(id: string): void }) {
  const projects = (useProjects().data?.cards ?? []).filter(
    (c) => c.id !== projectId && !c.missing,
  );
  if (!projects.length) return null;
  return (
    <select
      className={styles.select}
      aria-label="Copy the design tokens of another project"
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
    >
      <option value="">Tokens from a project…</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function FontRow({
  label,
  sample,
  value,
  onChange,
}: {
  label: string;
  sample: string;
  value: Brief['fonts']['heading'];
  onChange(v: Brief['fonts']['heading']): void;
}) {
  const fonts = useFonts().data;
  const family = value?.family;
  return (
    <div className={styles.font}>
      <span
        className={styles.sample}
        style={{
          fontFamily: family ? `'${family}', system-ui` : undefined,
          fontWeight: value?.weight,
        }}
        aria-hidden="true"
      >
        {sample}
      </span>
      <div className={styles.fontPick}>
        <select
          aria-label={`${label} font`}
          className={styles.select}
          value={family ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value ? { family: e.target.value, weight: value?.weight ?? 400 } : null,
            )
          }
        >
          <option value="">{label}: not set</option>
          {fonts && (
            <>
              <optgroup label="Cherry">
                {fonts.bundled.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
              <optgroup label="This computer">
                {fonts.families.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
            </>
          )}
          {family && !fonts?.families.includes(family) && !fonts?.bundled.includes(family) && (
            <option value={family}>{family}</option>
          )}
        </select>
        <span className={styles.fontMeta}>
          {label}
          {value && (
            <select
              aria-label={`${label} weight`}
              className={styles.weight}
              value={value.weight}
              onChange={(e) => onChange({ ...value, weight: Number(e.target.value) })}
            >
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          )}
        </span>
      </div>
    </div>
  );
}
