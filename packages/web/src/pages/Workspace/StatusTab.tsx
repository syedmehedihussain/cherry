import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { relativeTime } from '@cherry/shared';
import { openInEditor, useFile } from '../../api/workspace.ts';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import { Pill, type PillTone } from '../../components/Pill/Pill.tsx';
import styles from './StatusTab.module.css';

const FILE = '_project/STATUS.md';

/** The prompt behind "Update status": STATUS.md in ASD-STE100, same format and front matter. */
export const UPDATE_STATUS_PROMPT = [
  'Update _project/STATUS.md from what we did in this session. Keep its front matter and its section format; set `updated` to today.',
  'Rewrite "Where we left off" and "Next steps". Add one line to "Done recently" if that section exists. Do not delete history.',
  'Write in ASD-STE100 Simplified Technical English, so the user can catch up fast:',
  '- "Where we left off": 2 to 5 short sentences. Say what we did, then the current state. Max 20 words per sentence, active voice, one idea per sentence.',
  '- "Next steps": a `- [ ]` list. Start each step with a verb ("Fix", "Add", "Run"). Put the most important step first.',
  '- Keep code, paths, commands and names exactly as they are.',
].join('\n');

interface Parsed {
  fields: Record<string, string>;
  sections: { title: string; body: string }[];
}

/** Front matter fields and `##` sections of STATUS.md. */
export function parseStatus(md: string): Parsed {
  let body = md;
  const fields: Record<string, string> = {};
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (fm) {
    body = md.slice(fm[0].length);
    for (const line of fm[1]!.split('\n')) {
      const m = /^(\w+):\s*(.*?)\s*(#.*)?$/.exec(line);
      if (m) fields[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  }
  const sections: Parsed['sections'] = [];
  for (const chunk of body.split(/^## /m).slice(1)) {
    const nl = chunk.indexOf('\n');
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const text = nl === -1 ? '' : chunk.slice(nl + 1).trim();
    sections.push({ title, body: text });
  }
  return { fields, sections };
}

/** A step line with its `code` spans shown as code. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code key={i} className="mono">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

const STATE_TONE: Record<string, PillTone> = {
  active: 'success',
  paused: 'warning',
  done: 'neutral',
  idea: 'accent',
};

const pick = (p: Parsed, ...names: string[]) =>
  p.sections.find((s) => names.includes(s.title.toLowerCase()));

/** STATUS.md as a report: what this is, where we left off, the next step, then the rest. */
export function StatusTab({
  projectId,
  mtime,
  now,
  onUpdate,
  updateDisabledReason,
}: {
  projectId: string;
  /** STATUS.md mtime; null when there is none, undefined while loading. */
  mtime: number | null | undefined;
  now: number;
  onUpdate?: () => void;
  updateDisabledReason?: string;
}) {
  const file = useFile(projectId, FILE);
  const { refetch } = file;
  useEffect(() => {
    if (mtime) void refetch();
  }, [mtime, refetch]);

  const missing = mtime === null || file.isError;
  const update = (
    <button
      type="button"
      className="btn btn-secondary btn-md"
      disabled={!onUpdate}
      title={onUpdate ? 'Ask Claude to rewrite STATUS.md from this session' : updateDisabledReason}
      onClick={onUpdate}
    >
      <RefreshCw size={13} aria-hidden="true" />
      Update status
    </button>
  );

  if (missing) {
    return (
      <div className={styles.scroll}>
        <article className={styles.page}>
          <h1>Status</h1>
          <p className={styles.muted}>
            This project has no <span className="mono">{FILE}</span> yet. Claude writes one after
            calibration, or when you click Update status.
          </p>
          {update}
        </article>
      </div>
    );
  }
  if (!file.data) {
    return (
      <div className={styles.scroll}>
        <article className={styles.page}>
          <span className="shimmer" style={{ height: 240 }} />
        </article>
      </div>
    );
  }

  const parsed = parseStatus(file.data.content);
  const { fields } = parsed;
  const building = pick(parsed, 'what we are building', 'what this is', 'about');
  const leftOff = pick(parsed, 'where we left off');
  const next = pick(parsed, 'next steps');
  const done = pick(parsed, 'done recently');
  const shown = new Set([building, leftOff, next, done]);
  const rest = parsed.sections.filter((s) => !shown.has(s) && s.body);

  const steps = (next?.body ?? '')
    .split('\n')
    .map((l) => /^\s*[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ text: m[2]!.trim(), done: !!m[1] && m[1] !== ' ' }));
  const open = steps.filter((s) => !s.done);
  const [first, ...later] = open;

  return (
    <div className={styles.scroll}>
      <article className={styles.page} aria-label="Status report">
        <header className={styles.head}>
          <div className={styles.meta}>
            <h1>Status</h1>
            <div className={styles.sub}>
              {fields.status && (
                <Pill tone={STATE_TONE[fields.status] ?? 'neutral'} dot>
                  {fields.status[0]?.toUpperCase() + fields.status.slice(1)}
                </Pill>
              )}
              <span>Updated {relativeTime(file.data.mtime, now)}</span>
              <span>·</span>
              <span className="mono">{FILE}</span>
            </div>
          </div>
          <div className={styles.actions}>
            {update}
            <button
              type="button"
              className="btn btn-ghost btn-md"
              onClick={() => void openInEditor(projectId, FILE)}
            >
              Open in editor
              <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className={styles.card} aria-labelledby="st-what">
          <h2 id="st-what">What we are doing</h2>
          {fields.summary && <p className={styles.lead}>{fields.summary}</p>}
          {building?.body && <Markdown source={building.body} />}
          {!fields.summary && !building?.body && <p className={styles.muted}>Not written yet.</p>}
        </section>

        <section className={styles.card} aria-labelledby="st-left">
          <h2 id="st-left">Where we left off</h2>
          {leftOff?.body ? (
            <Markdown source={leftOff.body} />
          ) : (
            <p className={styles.muted}>Not written yet.</p>
          )}
        </section>

        <section className={styles.card} data-tone="next" aria-labelledby="st-next">
          <h2 id="st-next">Next step</h2>
          {first ? (
            <>
              <p className={styles.nextStep}>
                <Inline text={first.text} />
              </p>
              {later.length > 0 && (
                <>
                  <div className={styles.label}>After that</div>
                  <ol className={styles.later}>
                    {later.map((s) => (
                      <li key={s.text}>
                        <Inline text={s.text} />
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          ) : (
            <p className={styles.muted}>No open steps.</p>
          )}
        </section>

        {rest.map((s) => (
          <section key={s.title} className={styles.plain}>
            <h2>{s.title}</h2>
            <Markdown source={s.body} />
          </section>
        ))}

        {done?.body && (
          <details className={styles.plain}>
            <summary>
              <h2>Done recently</h2>
            </summary>
            <Markdown source={done.body} />
          </details>
        )}
      </article>
    </div>
  );
}
