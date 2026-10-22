import { ChevronRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import type { ChatItem } from '@cherry/shared';
import { api, ApiFailure } from '../../api/client.ts';
import { useStage } from '../../state/stage.ts';
import { Markdown } from '../Markdown/Markdown.tsx';
import styles from './ChangeSummary.module.css';

type Tool = Extract<ChatItem, { kind: 'tool' }>;
type End = Extract<ChatItem, { kind: 'turn-end' }>;

/**
 * What one Claude reply changed (ADR-0022). Closed by default; opening it costs no tokens.
 * Only the Explain button calls Claude (Haiku), and the daemon caches its answer.
 */
export function ChangeSummary({
  projectId,
  tools,
  end,
}: {
  projectId: string;
  tools: Tool[];
  end: End;
}) {
  // The chat on screen is the open stage's.
  const stage = useStage(projectId);
  const [open, setOpen] = useState(false);
  const [explain, setExplain] = useState<{ busy: boolean; text?: string; error?: string }>({
    busy: false,
  });

  const edits = tools.filter((t) => t.verb === 'edit' && t.status === 'ok');
  if (!edits.length) return null;
  const files = new Map<string, { added: number; removed: number }>();
  for (const e of edits) {
    const f = files.get(e.target) ?? { added: 0, removed: 0 };
    f.added += e.added ?? 0;
    f.removed += e.removed ?? 0;
    files.set(e.target, f);
  }
  const firstEdit = tools.indexOf(edits[0]!);
  const commands = tools.slice(firstEdit).filter((t) => t.verb === 'run');
  const added = [...files.values()].reduce((n, f) => n + f.added, 0);
  const removed = [...files.values()].reduce((n, f) => n + f.removed, 0);
  const outcome = end.stopped
    ? 'Stopped before the end.'
    : end.ok
      ? 'Finished.'
      : (end.error ?? 'Ended with an error.');

  const runExplain = async () => {
    setExplain({ busy: true });
    try {
      const res = await api(
        'POST',
        `/api/projects/${encodeURIComponent(projectId)}/chat/explain?stage=${stage}`,
        { turnId: end.turnId },
        z.object({ text: z.string() }),
      );
      setExplain({ busy: false, text: res.text });
    } catch (e) {
      setExplain({
        busy: false,
        error: e instanceof ApiFailure ? e.message : 'Could not explain.',
      });
    }
  };

  return (
    <div className={styles.box}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight size={14} className={styles.chevron} aria-hidden="true" />
        Changed {files.size} {files.size === 1 ? 'file' : 'files'}
        <span className={styles.add}>+{added}</span>
        <span className={styles.del}>−{removed}</span>
      </button>
      {open && (
        <div className={styles.body}>
          <h4>Files</h4>
          <ul className={styles.files}>
            {[...files].map(([file, f]) => (
              <li key={file}>
                <Link to={`/p/${encodeURIComponent(projectId)}/files/${file}`} className="mono">
                  {file}
                </Link>
                <span className={styles.add}>+{f.added}</span>
                <span className={styles.del}>−{f.removed}</span>
              </li>
            ))}
          </ul>
          <h4>After the change</h4>
          {commands.length ? (
            <ul className={styles.files}>
              {commands.map((c) => (
                <li key={c.id}>
                  <code>{c.target}</code>
                  <span className={c.status === 'ok' ? styles.ok : styles.bad}>
                    {c.status === 'ok' ? 'ok' : c.status === 'denied' ? 'denied by you' : c.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>No commands were run after the change.</p>
          )}
          <p className={styles.muted}>{outcome}</p>
          {explain.text ? (
            <div className={styles.explain}>
              <Markdown source={explain.text} variant="chat" />
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={explain.busy}
              onClick={() => void runExplain()}
              title="Asks Haiku for a short summary. Uses a few tokens."
            >
              <Sparkles size={12} aria-hidden="true" />
              {explain.busy ? 'Explaining…' : 'Explain with Claude'}
            </button>
          )}
          {explain.error && (
            <p className={styles.bad} role="alert">
              {explain.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
