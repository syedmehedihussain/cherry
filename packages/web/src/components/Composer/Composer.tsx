import {
  ArrowUp,
  ChevronDown,
  FileText,
  Gauge,
  Hand,
  Map as MapIcon,
  Paperclip,
  Square,
  X,
  Zap,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import {
  EFFORTS,
  MAX_ATTACHMENTS,
  MAX_UPLOAD_BYTES,
  MODELS,
  type ChatMode,
  type Effort,
  type UploadedFile,
} from '@cherry/shared';
import styles from './Composer.module.css';

/** The three chat modes (ADR-0025). */
const MODES: { id: ChatMode; label: string; detail: string; Icon: typeof Hand }[] = [
  { id: 'ask', label: 'Ask', detail: 'Every edit and command asks first', Icon: Hand },
  {
    id: 'auto',
    label: 'Auto',
    detail: 'Runs without asking; push, publish and rm -r still ask',
    Icon: Zap,
  },
  {
    id: 'plan',
    label: 'Plan',
    detail: 'Claude plans first and does not edit files',
    Icon: MapIcon,
  },
];

/**
 * A slash command in the composer menu (V2.1 w7.1). `run` acts at once in Cherry; `expand`
 * turns `/name args` into the prompt that is sent; neither: the text goes to Claude as typed
 * (/compact, skills, the project's own commands).
 */
export interface SlashCommand {
  name: string;
  description: string;
  group: 'Cherry' | 'Claude' | 'Skill' | 'Project';
  run?(args: string): void;
  expand?(args: string): string;
  /** Runs as soon as it is picked (no arguments). */
  instant?: boolean;
}

const SLASH = /^\/([\w:.-]*)$/;

interface ComposerProps {
  running: boolean;
  /** Claude waits for an approval or decision above. */
  paused: boolean;
  disabled?: string | null;
  model: string;
  /** Reasoning effort; null leaves it to the model's default. */
  effort: Effort | null;
  draft?: string;
  onDraftUsed?: () => void;
  mode: ChatMode;
  onMode(mode: ChatMode): void;
  onSend(text: string, mode: ChatMode, model: string, attachments: string[]): Promise<boolean>;
  /** Stores one file and returns its id; without it there is no paperclip. */
  onUpload?: (file: File) => Promise<UploadedFile>;
  /** Deletes an uploaded file whose chip was removed before sending. */
  onDiscard?: (id: string) => void;
  onStop(): void;
  onModel(model: string): void;
  onEffort(effort: Effort | null): void;
  commands?: SlashCommand[];
  /** Project files for @ mentions (V2.1 w7.2). */
  searchFiles?(q: string): Promise<string[]>;
}

export function Composer({
  running,
  paused,
  disabled,
  model,
  effort,
  mode,
  onMode,
  draft,
  onDraftUsed,
  onSend,
  onStop,
  onModel,
  onEffort,
  onUpload,
  onDiscard,
  commands = [],
  searchFiles,
}: ComposerProps) {
  const [text, setText] = useState('');
  // @ mentions: the "@query" just before the caret, and the files that match it.
  const [caret, setCaret] = useState(0);
  const mention = /(?:^|\s)@([\w./-]*)$/.exec(text.slice(0, caret));
  const mentionQuery = mention ? mention[1]! : null;
  const [found, setFound] = useState<{ q: string; files: string[] }>({ q: '', files: [] });
  const [mentionClosed, setMentionClosed] = useState<string | null>(null);
  useEffect(() => {
    if (mentionQuery === null || !searchFiles) return;
    const t = window.setTimeout(() => {
      searchFiles(mentionQuery).then(
        (files) => setFound({ q: mentionQuery, files }),
        () => setFound({ q: mentionQuery, files: [] }),
      );
    }, 120);
    return () => window.clearTimeout(t);
  }, [mentionQuery, searchFiles]);
  const mentions =
    mentionQuery !== null && mentionClosed !== text && found.q === mentionQuery
      ? found.files.slice(0, 10)
      : [];
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashClosed, setSlashClosed] = useState<string | null>(null);
  const query = SLASH.exec(text)?.[1]?.toLowerCase();
  const matches =
    query === undefined || slashClosed === text
      ? []
      : commands
          .filter((c) => c.name.toLowerCase().includes(query))
          .sort(
            (a, b) =>
              Number(!a.name.toLowerCase().startsWith(query)) -
              Number(!b.name.toLowerCase().startsWith(query)),
          )
          .slice(0, 12);
  const listLength = matches.length || mentions.length;
  const slashActive = Math.min(slashIndex, Math.max(0, listLength - 1));
  const pickFile = (file: string) => {
    const before = text.slice(0, caret).replace(/@[\w./-]*$/, `@${file} `);
    const next = before + text.slice(caret);
    setText(next);
    setSlashIndex(0);
    setCaret(before.length);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(before.length, before.length);
    });
  };
  const pick = (c: SlashCommand) => {
    setSlashIndex(0);
    if (c.instant && c.run) {
      c.run('');
      setText('');
      return;
    }
    setText(`/${c.name} `);
    area.current?.focus();
  };
  const [menu, setMenu] = useState<'mode' | 'model' | 'effort' | null>(null);
  const [sending, setSending] = useState(false);
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);

  // A new draft (from "Ask Claude about this doc") replaces the text once.
  const [seenDraft, setSeenDraft] = useState<string | undefined>(undefined);
  if (draft && draft !== seenDraft) {
    setSeenDraft(draft);
    setText(draft);
  }
  useEffect(() => {
    if (draft) {
      onDraftUsed?.();
      area.current?.focus();
    }
  }, [draft, onDraftUsed]);

  const [files, setFiles] = useState<Pending[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const uploading = files.some((f) => f.status === 'uploading');
  const ready = files.filter((f) => f.status === 'done');

  // Object URLs for image previews are freed when a chip goes away.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const addFiles = (list: FileList | File[]) => {
    if (!onUpload || disabled) return;
    setFileError(null);
    const incoming = [...list];
    const room = MAX_ATTACHMENTS - files.length;
    if (incoming.length > room) setFileError(`Up to ${MAX_ATTACHMENTS} files per message.`);
    for (const file of incoming.slice(0, Math.max(0, room))) {
      const key = `${file.name}-${(seq.current += 1)}`;
      if (file.size > MAX_UPLOAD_BYTES) {
        setFiles((f) => [...f, { key, name: file.name, status: 'error', error: 'Over 10 MB' }]);
        continue;
      }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      if (preview) urls.current.add(preview);
      setFiles((f) => [...f, { key, name: file.name, status: 'uploading', preview }]);
      onUpload(file).then(
        (up) => {
          // Removed while it was still uploading: delete it now that it exists.
          if (removed.current.delete(key)) {
            onDiscard?.(up.id);
            return;
          }
          setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: 'done', id: up.id } : x)));
        },
        (e: unknown) =>
          setFiles((f) =>
            f.map((x) =>
              x.key === key
                ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' }
                : x,
            ),
          ),
      );
    }
  };
  const removed = useRef(new Set<string>());
  const remove = (key: string) => {
    const f = files.find((x) => x.key === key);
    if (f?.status === 'uploading') removed.current.add(key);
    if (f?.status === 'done' && f.id) onDiscard?.(f.id);
    setFiles((list) => list.filter((x) => x.key !== key));
  };

  const hasContent = text.trim().length > 0 || ready.length > 0;
  const canSend = !disabled && !running && !sending && !uploading && hasContent;
  const send = async () => {
    // A Cherry command acts here, also while Claude works (/stop); an expanding one sends its
    // prompt (V2.1 w7.1).
    const cmdMatch = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
    const cmd = cmdMatch && commands.find((c) => c.name === cmdMatch[1]);
    if (cmd?.run && !disabled) {
      cmd.run((cmdMatch?.[2] ?? '').trim());
      setText('');
      return;
    }
    if (!canSend) return;
    setSending(true);
    const body =
      (cmd?.expand ? cmd.expand((cmdMatch?.[2] ?? '').trim()) : text.trim()) ||
      (ready.length === 1
        ? 'Have a look at the attached file.'
        : 'Have a look at the attached files.');
    const ok = await onSend(
      body,
      mode,
      model,
      ready.map((f) => f.id!),
    );
    setSending(false);
    if (ok) {
      setText('');
      setFiles([]);
      setFileError(null);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (listLength > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSlashIndex((slashActive + step + listLength) % listLength);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        if (matches.length) pick(matches[slashActive]!);
        else pickFile(mentions[slashActive]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (matches.length) setSlashClosed(text);
        else setMentionClosed(text);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  const effortLabel = EFFORTS.find((e) => e.id === effort)?.label ?? 'Default';
  const current = MODES.find((m) => m.id === mode) ?? MODES[0]!;

  return (
    <div className={styles.wrap}>
      <div className={styles.hint}>
        {paused ? (
          <span className={styles.paused}>Claude is paused until you answer above.</span>
        ) : (
          <>
            Claude reads <span className="mono">CLAUDE.md</span> and{' '}
            <span className="mono">STATUS.md</span> first.
          </>
        )}
      </div>
      <div
        className={styles.box}
        data-disabled={disabled ? true : undefined}
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          if (!onUpload || disabled || ![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {files.length > 0 && (
          <ul className={styles.files} aria-label="Attachments">
            {files.map((f) => (
              <li key={f.key} className={styles.file} data-status={f.status}>
                {f.preview ? (
                  <img src={f.preview} alt="" className={styles.thumb} />
                ) : (
                  <FileText size={14} aria-hidden="true" className={styles.fileIcon} />
                )}
                <span className={styles.fileName} title={f.error ?? f.name}>
                  {f.name}
                </span>
                {f.status === 'uploading' && (
                  <span
                    className="spinner"
                    style={{ width: 10, height: 10 }}
                    aria-label="Uploading"
                  />
                )}
                {f.status === 'error' && <span className={styles.fileErr}>{f.error}</span>}
                <button
                  type="button"
                  className={styles.fileRemove}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => remove(f.key)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {matches.length > 0 && (
          <div className={styles.slash} role="listbox" aria-label="Commands">
            {matches.map((c, i) => (
              <button
                key={`${c.group}-${c.name}`}
                type="button"
                role="option"
                aria-selected={i === slashActive}
                className={styles.slashItem}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setSlashIndex(i)}
              >
                <span className={styles.slashName}>/{c.name}</span>
                <span className={styles.slashDesc}>{c.description}</span>
                <span className={styles.slashGroup}>{c.group}</span>
              </button>
            ))}
          </div>
        )}
        {matches.length === 0 && mentions.length > 0 && (
          <div className={styles.slash} role="listbox" aria-label="Files">
            {mentions.map((f, i) => (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={i === slashActive}
                className={styles.slashItem}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickFile(f);
                }}
                onMouseEnter={() => setSlashIndex(i)}
              >
                <span className={styles.slashName}>{f.split('/').pop()}</span>
                <span className={styles.slashDesc}>{f}</span>
              </button>
            ))}
          </div>
        )}
        <label htmlFor={id} className="sr-only">
          Message Claude
        </label>
        <textarea
          id={id}
          ref={area}
          rows={2}
          className={styles.text}
          placeholder={
            disabled ??
            (running
              ? 'Claude is working… write your next message.'
              : 'Reply to Claude, or describe the next task…')
          }
          value={text}
          disabled={!!disabled}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setSlashIndex(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKey}
          onPaste={onPaste}
        />
        <div className={styles.row}>
          {onUpload && (
            <>
              <button
                type="button"
                className={styles.attach}
                aria-label="Attach files"
                title="Attach files or pictures (or drop or paste them here)"
                disabled={!!disabled || files.length >= MAX_ATTACHMENTS}
                onClick={() => picker.current?.click()}
              >
                <Paperclip size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
          <div className={styles.modelWrap}>
            <button
              type="button"
              className={styles.chip}
              data-mode={mode}
              aria-haspopup="menu"
              aria-expanded={menu === 'mode'}
              aria-label={`Mode: ${current.label}`}
              title={current.detail}
              onClick={() => setMenu(menu === 'mode' ? null : 'mode')}
            >
              <current.Icon size={12} strokeWidth={1.8} aria-hidden="true" />
              {current.label}
              <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
            </button>
            {menu === 'mode' && (
              <div className={`${styles.menu} ${styles.modeMenu}`} role="menu" aria-label="Mode">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={m.id === mode}
                    onClick={() => {
                      onMode(m.id);
                      setMenu(null);
                    }}
                  >
                    <span className={styles.modeLabel}>{m.label}</span>
                    <span className={styles.modeDetail}>{m.detail}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={styles.modelWrap}>
            <button
              type="button"
              className={styles.chip}
              aria-haspopup="menu"
              aria-expanded={menu === 'model'}
              aria-label={`Model: ${modelLabel}`}
              onClick={() => setMenu(menu === 'model' ? null : 'model')}
            >
              {modelLabel}
              <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
            </button>
            {menu === 'model' && (
              <div className={styles.menu} role="menu">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={m.id === model}
                    onClick={() => {
                      onModel(m.id);
                      setMenu(null);
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {model !== 'haiku' && (
            <div className={styles.modelWrap}>
              <button
                type="button"
                className={styles.chip}
                aria-haspopup="menu"
                aria-expanded={menu === 'effort'}
                aria-label={`Effort: ${effortLabel}`}
                title="How much Claude thinks before answering"
                onClick={() => setMenu(menu === 'effort' ? null : 'effort')}
              >
                <Gauge size={12} strokeWidth={1.8} aria-hidden="true" />
                {effort ? effortLabel : 'Effort'}
                <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
              </button>
              {menu === 'effort' && (
                <div className={styles.menu} role="menu" aria-label="Effort">
                  {[{ id: null, label: 'Default' }, ...EFFORTS].map((e) => (
                    <button
                      key={e.id ?? 'default'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={e.id === effort}
                      onClick={() => {
                        onEffort(e.id);
                        setMenu(null);
                      }}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className={styles.spacer} />
          {running ? (
            <button type="button" className={styles.stop} onClick={onStop}>
              <Square size={10} fill="currentColor" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              className={styles.send}
              aria-label="Send"
              disabled={!canSend}
              onClick={() => void send()}
            >
              <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {fileError && <p className={styles.fileError}>{fileError}</p>}
    </div>
  );
}

interface Pending {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  id?: string;
  preview?: string;
  error?: string;
}
