import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isAllowedStatus, type Approval, type ApprovalFile } from '@cherry/shared';
import { tildify } from '../../lib/paths.ts';
import { cliCall, cliResult, elapsed, SPINNER_FRAMES, spinnerVerb, type ToolItem } from './cli.ts';
import styles from './ClaudeCode.module.css';

/**
 * The Claude Code look for every chat (V3, ADR-0045): `>` for the user, `●` for Claude's text
 * and each tool call, `⎿` for its result, a turning star while Claude works, and permission
 * prompts inline, answered with 1, 2, 3 or Esc.
 */

/** The user's message: a quiet band with the prompt sign. */
export function CcUser({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className={styles.userRow}>
      <div className={styles.user}>{children}</div>
      {actions}
    </div>
  );
}

/** Claude's text, after a dot. */
export function CcText({ children }: { children: ReactNode }) {
  return <div className={styles.msg}>{children}</div>;
}

/** One tool call and its result line; an allowed edit shows its diff under it. */
export function CcTool({
  item,
  diff,
  extra,
}: {
  item: ToolItem;
  /** The files of the approval that let this edit through. */
  diff?: ApprovalFile[];
  /** Under the result: a file chip with Open, a prompt. */
  extra?: ReactNode;
}) {
  const { name, arg } = cliCall(item);
  const result = cliResult(item);
  const state =
    item.status === 'running'
      ? 'run'
      : item.status === 'waiting'
        ? 'ask'
        : item.status === 'ok'
          ? 'ok'
          : 'err';
  return (
    <div className={styles.step} data-tool={item.tool}>
      <div className={styles.msg} data-tool-state={state}>
        <span className={styles.call}>
          <span className={styles.tool}>{name}</span>
          <span className={styles.arg} title={arg}>
            ({arg})
          </span>
        </span>
      </div>
      {result && (
        <div className={styles.res} data-tone={result.tone}>
          <span>
            {result.added !== undefined && result.removed !== undefined ? (
              <>
                Updated {item.target} with{' '}
                <span className={styles.add}>
                  {result.added} addition{result.added === 1 ? '' : 's'}
                </span>{' '}
                and{' '}
                <span className={styles.del}>
                  {result.removed} removal{result.removed === 1 ? '' : 's'}
                </span>
              </>
            ) : (
              result.text
            )}
          </span>
        </div>
      )}
      {diff && diff.length > 0 && item.status === 'ok' && <CcDiff files={diff} compact />}
      {extra}
    </div>
  );
}

/** Finished steps folded into one line, like the CLI; a click opens them (V2.1 w6). */
export function CcFold({
  summary,
  failed,
  children,
}: {
  summary: string;
  failed?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.foldWrap}>
      <button
        type="button"
        className={styles.fold}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.foldText}>{summary}</span>
        {!!failed && <span className={styles.foldFailed}> · {failed} failed</span>}
      </button>
      {open && <div className={styles.foldBody}>{children}</div>}
    </div>
  );
}

/** "✻ Thought for 12s", dim; a click shows the thinking. */
export function CcThinking({
  label,
  busy,
  children,
}: {
  label: string;
  busy: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.thinkWrap}>
      <button
        type="button"
        className={styles.think}
        data-busy={busy || undefined}
        aria-expanded={children ? open : undefined}
        disabled={!children}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && children && <div className={styles.thinkBody}>{children}</div>}
    </div>
  );
}

/** The turning star with a verb, the time, and the way out. */
export function CcSpinner({
  since,
  seed,
  verb,
  hint = 'esc to interrupt',
}: {
  since: number;
  seed: string;
  /** A fixed verb ("Drafting"); otherwise one is picked for the turn. */
  verb?: string;
  hint?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(t);
  }, []);
  const frame = SPINNER_FRAMES[Math.floor(now / 120) % SPINNER_FRAMES.length];
  // The verb changes every 6 s, as the CLI's does.
  const word = verb ?? spinnerVerb(seed, Math.floor((now - since) / 6000));
  return (
    <div className={styles.spin} role="status" aria-label="Claude is working">
      <span className={styles.star} aria-hidden="true">
        {frame}
      </span>
      <span className={styles.verb}>{word}…</span>
      <span className={styles.spinMeta}>
        ({elapsed(now - since)} · {hint})
      </span>
    </div>
  );
}

const PREVIEW = 12;

/** Diff lines with numbers, red and green, as the CLI shows an edit. */
export function CcDiff({ files, compact }: { files: ApprovalFile[]; compact?: boolean }) {
  const [all, setAll] = useState(false);
  return (
    <div className={styles.diffs} data-compact={compact || undefined}>
      {files
        .filter((f) => f.lines.length > 0)
        .map((f) => {
          const lines = all ? f.lines : f.lines.slice(0, compact ? 8 : PREVIEW);
          return (
            <div key={f.path} className={styles.diffFile}>
              {!compact && (
                <div className={styles.diffHead}>
                  {f.path}
                  {f.isNew && <span className={styles.newTag}> (new file)</span>}
                  <span className={styles.add}> +{f.added}</span>
                  <span className={styles.del}> -{f.removed}</span>
                </div>
              )}
              <div className={styles.diff}>
                {lines.map((l, i) => (
                  <div key={i} data-kind={l.kind}>
                    <span className={styles.ln}>{l.b ?? l.a}</span>
                    <span>{l.kind === ' ' ? '' : l.kind}</span>
                    <span>{l.text || ' '}</span>
                  </div>
                ))}
              </div>
              {!all && f.lines.length > lines.length && (
                <button type="button" className={styles.more} onClick={() => setAll(true)}>
                  … {f.lines.length - lines.length} more lines
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}

type Answer = 'allow' | 'allow_session' | 'allow_always' | 'deny';

/** "Bash command", "Edit file": the prompt's heading, as the CLI words it. */
function promptHead(a: Approval): string {
  if (a.kind === 'command') return a.detail ? 'Serious command' : 'Bash command';
  if (a.kind === 'push') return 'Push';
  if (a.kind === 'edit') return a.files.length > 1 ? `Edit ${a.files.length} files` : 'Edit file';
  return a.tool;
}

/** The first word or two of a command, for "don't ask again for pnpm vitest". */
const commandKey = (cmd: string) => cmd.trim().split(/\s+/).slice(0, 3).join(' ');

/**
 * A permission prompt inline, like the CLI (artboard 07): what Claude wants, then numbered
 * answers. 1, 2, 3 pick; ↑ ↓ and Enter work; Esc or the last option says No.
 */
export function CcPrompt({
  approval,
  onAnswer,
  autoFocus,
}: {
  approval: Approval;
  onAnswer(answer: Answer, reason?: string): Promise<void>;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');
  const serious = approval.kind === 'command' && !!approval.detail;
  const options: { label: string; answer: Answer }[] = [{ label: 'Yes', answer: 'allow' }];
  if (approval.kind !== 'push' && !serious)
    options.push({
      label:
        approval.kind === 'edit'
          ? 'Yes, allow all edits during this session'
          : 'Yes, for this session',
      answer: 'allow_session',
    });
  if (approval.remember)
    options.push({
      label: approval.command
        ? `Yes, and don't ask again for ${commandKey(approval.command)} in this project`
        : `Yes, and don't ask again for ${approval.tool} in this project`,
      answer: 'allow_always',
    });
  const no = options.length;
  const all = [
    ...options,
    { label: 'No, and tell Claude what to do differently', answer: 'deny' as const },
  ];

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const answer = async (a: Answer, r?: string) => {
    setBusy(true);
    try {
      await onAnswer(a, r);
    } finally {
      setBusy(false);
    }
  };
  const choose = (i: number) => {
    const o = all[i];
    if (!o || busy) return;
    if (o.answer === 'deny') setDenying(true);
    else void answer(o.answer);
  };

  return (
    <div
      ref={ref}
      className={styles.ask}
      role="group"
      aria-label={approval.title}
      tabIndex={-1}
      data-approval={approval.id}
      onKeyDown={(e) => {
        if (denying || e.target !== e.currentTarget) return;
        const n = Number(e.key);
        if (n >= 1 && n <= all.length) {
          e.preventDefault();
          choose(n - 1);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setSel((sel + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          choose(sel);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setDenying(true);
        }
      }}
    >
      <div className={styles.askHead}>{promptHead(approval)}</div>
      {(approval.kind === 'command' || approval.kind === 'push') && (
        <div className={styles.askCmd}>
          <code>{approval.command}</code>
          <span className={styles.askIn}>in {tildify(approval.cwd)}</span>
        </div>
      )}
      {serious && <p className={styles.askWarn}>{approval.detail} Cherry asks every time.</p>}
      {approval.kind === 'edit' && <CcDiff files={approval.files} />}
      {(approval.kind === 'other' || approval.kind === 'push') && approval.detail && (
        <pre className={styles.askDetail}>{approval.detail}</pre>
      )}
      <div className={styles.askQ}>Do you want to proceed?</div>
      {denying ? (
        <div className={styles.reason}>
          <label htmlFor={reasonId}>Tell Claude why (optional)</label>
          <div className={styles.reasonRow}>
            <input
              id={reasonId}
              className="input"
              value={reason}
              placeholder="e.g. use the existing helper instead"
              autoFocus
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void answer('deny', reason);
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  void answer('deny', reason);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => void answer('deny', reason)}
            >
              Deny
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setDenying(false);
                ref.current?.focus();
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.opts}>
          {all.map((o, i) => (
            <button
              key={o.answer}
              type="button"
              className={styles.opt}
              data-sel={i === sel || undefined}
              data-no={i === no || undefined}
              disabled={busy}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(i)}
            >
              <span className={styles.optN} aria-hidden="true">
                {i + 1}.
              </span>
              <span>
                {o.label}
                {i === no && <span className={styles.optKey}> (esc)</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** An answered prompt, one dim line. */
export function CcAnswered({ approval }: { approval: Approval }) {
  const allowed = isAllowedStatus(approval.status);
  const label = allowed
    ? approval.status === 'allowed_session'
      ? 'Allowed for session'
      : approval.status === 'allowed_always'
        ? 'Always allowed here'
        : 'Allowed'
    : approval.status === 'cancelled'
      ? 'Cancelled'
      : 'Denied';
  return (
    <div className={styles.res} data-tone={allowed ? 'dim' : 'bad'} data-status={approval.status}>
      <span>
        <span>{label}</span>
        {approval.reason && approval.status === 'denied' && (
          <span className={styles.reasonText}> “{approval.reason}”</span>
        )}
      </span>
    </div>
  );
}
