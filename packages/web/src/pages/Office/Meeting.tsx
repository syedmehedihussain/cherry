import { useQueries } from '@tanstack/react-query';
import { AtSign, FileText, MessageCircle, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import {
  OFFICE_AGENT,
  OFFICE_AGENT_MONO,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  OfficeStageSchema,
  StageDocsSchema,
  type OfficeFile,
  type OfficeStage,
  type StageDocs,
} from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { api, ApiFailure } from '../../api/client.ts';
import { addAction, removeAction, setAction } from '../../api/office.ts';
import { useUi } from '../../state/ui.ts';
import { useProjectUsage } from './Usage.tsx';
import styles from './Meeting.module.css';

interface Seat {
  stage: OfficeStage;
  off: boolean;
  done: string;
  now: string;
  needs: string;
}

/** What each agent has done, is on, and needs from the user: from the files and the state. */
export function seatReports(office: OfficeFile, docs: (StageDocs | undefined)[]): Seat[] {
  const cycle = office.cycles[office.cycles.length - 1]!;
  const personal = office.kind === 'personal';
  return OFFICE_STAGES.map((stage, i) => {
    const r = cycle.stages[stage];
    const d = docs[i];
    const titles = d ? [...d.client, ...d.technical].map((x) => x.title) : [];
    const done = titles.length ? titles.join(', ') : 'Nothing yet';
    const prev = OFFICE_STAGE_LABEL[OFFICE_STAGES[i - 1] ?? 'idea'];
    switch (r.state) {
      case 'locked':
        return {
          stage,
          off: true,
          done: '-',
          now: `Not started. Opens when ${prev} is signed off.`,
          needs: '-',
        };
      case 'signed':
      case 'carried':
        return { stage, off: false, done, now: 'Signed off. Nothing open.', needs: 'Nothing' };
      case 'update':
        return {
          stage,
          off: false,
          done,
          now: r.ready
            ? 'Synced with the change; ready to sign off again.'
            : 'Needs an update for an approved change.',
          needs: r.ready ? 'Your sign-off' : 'A job: sync the documents with the change',
        };
      case 'waiting':
        return {
          stage,
          off: false,
          done,
          now: 'Sent to the client.',
          needs: 'The client approval',
        };
      default:
        return r.ready
          ? {
              stage,
              off: false,
              done,
              now: 'The stage is ready.',
              needs: personal ? 'Your sign-off' : 'Show the client, then sign off',
            }
          : {
              stage,
              off: false,
              done,
              now: titles.length ? 'Working on it.' : 'Waiting for a job.',
              needs: titles.length ? 'Nothing right now' : 'A job',
            };
    }
  });
}

/**
 * The Meeting tab (V4 o16): every agent at one table with its work, an agenda, action items and
 * the notes. Built from the files and the office state, so opening it costs no tokens; asking
 * an agent or Magnet puts the question in their box for you to send.
 */
export function Meeting({
  projectId,
  office,
  name,
}: {
  projectId: string;
  office: OfficeFile;
  name: string;
}) {
  const navigate = useNavigate();
  const setDraft = useChatDraft((s) => s.set);
  const openMagnet = useUi((s) => s.openMagnet);
  const usage = useProjectUsage(projectId).data;
  const docs = useQueries({
    queries: OFFICE_STAGES.map((s) => ({
      queryKey: ['office-docs', projectId, s],
      queryFn: () =>
        api(
          'GET',
          `/api/projects/${encodeURIComponent(projectId)}/office/docs?stage=${s}`,
          undefined,
          StageDocsSchema,
        ),
    })),
  }).map((q) => q.data);
  const seats = seatReports(office, docs);
  const cycle = office.cycles[office.cycles.length - 1]!;
  const signed = OFFICE_STAGES.filter((s) =>
    ['signed', 'carried'].includes(cycle.stages[s].state),
  ).length;

  const agenda: string[] = [];
  for (const s of OFFICE_STAGES) {
    const r = cycle.stages[s];
    if (r.state === 'active' && r.ready)
      agenda.push(`${OFFICE_STAGE_LABEL[s]} is ready to sign off`);
    if (r.state === 'waiting') agenda.push(`${OFFICE_STAGE_LABEL[s]} waits for the client`);
    if (r.state === 'update') agenda.push(`${OFFICE_STAGE_LABEL[s]} needs an update`);
  }
  for (const c of office.changes.filter((c) => c.status === 'proposed'))
    agenda.push(`Decide on change request ${c.id} ${c.title}`);
  const used = usage?.total.tokens ?? 0;
  if (used / office.budgetTokens > 0.8)
    agenda.push(`Token budget ${Math.round((used / office.budgetTokens) * 100)}% used`);
  const open = office.actions.filter((a) => !a.done).length;
  if (open) agenda.push(`${open} open action item${open === 1 ? '' : 's'}`);

  const ask = (s: OfficeStage) => {
    setDraft(projectId, `Where are we on ${OFFICE_STAGE_LABEL[s]}? What do you need from me?`);
    void navigate(`/p/${encodeURIComponent(projectId)}/s/${s}`);
  };
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveNotes = async () => {
    const md = [
      `# Meeting, ${name}, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      `${signed} of 7 stages signed off.`,
      '',
      '## Agenda',
      '',
      ...(agenda.length ? agenda.map((a) => `- ${a}`) : ['- Nothing waits.']),
      '',
      '## The staff',
      '',
      ...seats
        .filter((s) => !s.off)
        .flatMap((s) => [
          `### ${OFFICE_AGENT[s.stage]} (${OFFICE_STAGE_LABEL[s.stage]})`,
          '',
          `- Done: ${s.done}`,
          `- Now: ${s.now}`,
          `- Needs: ${s.needs}`,
          '',
        ]),
      '## Action items',
      '',
      ...(office.actions.length
        ? office.actions.map(
            (a) =>
              `- [${a.done ? 'x' : ' '}] ${a.text} (${a.owner === 'you' ? 'you' : OFFICE_AGENT[a.owner]})`,
          )
        : ['- None.']),
      '',
    ].join('\n');
    try {
      const r = await api(
        'POST',
        `/api/projects/${encodeURIComponent(projectId)}/office/meeting-notes`,
        { text: md },
        z.object({ path: z.string() }),
      );
      setSaved(r.path);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save the notes.');
    }
  };

  return (
    <div className={styles.meet}>
      <div className={styles.left}>
        <div className={styles.head}>
          <h2>Meeting</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void saveNotes()}
          >
            <FileText size={13} aria-hidden="true" />
            Save notes
          </button>
        </div>
        <p className={styles.sub}>
          Every agent and its work, at one table. Built from the project files, so no agent ran to
          make it. Asking puts your question in the agent's box; you send it.
        </p>
        {saved && (
          <p className={styles.saved}>
            Saved to{' '}
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => void navigate(`/p/${encodeURIComponent(projectId)}/docs/${saved}`)}
            >
              {saved}
            </button>
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <ol className={styles.seats} aria-label="Staff">
          {seats.map((s) => (
            <li
              key={s.stage}
              className={styles.seat}
              data-off={s.off || undefined}
              aria-label={OFFICE_AGENT[s.stage]}
            >
              <span className={styles.av}>{OFFICE_AGENT_MONO[s.stage]}</span>
              <div className={styles.rep}>
                <div className={styles.who}>
                  <b>{OFFICE_AGENT[s.stage]}</b>
                  <span>{OFFICE_STAGE_LABEL[s.stage]}</span>
                </div>
                <dl>
                  <dt>Done</dt>
                  <dd>{s.done}</dd>
                  <dt>Now</dt>
                  <dd>{s.now}</dd>
                  <dt>Needs</dt>
                  <dd>{s.needs}</dd>
                </dl>
              </div>
              {!s.off && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => ask(s.stage)}>
                  <AtSign size={13} aria-hidden="true" />
                  Ask
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
      <aside className={styles.right}>
        <section aria-label="Agenda">
          <h3>Agenda</h3>
          <p className={styles.dim}>Magnet: {signed} of 7 stages are signed off.</p>
          {agenda.length ? (
            <ol className={styles.agenda}>
              {agenda.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
          ) : (
            <p className={styles.dim}>Nothing waits on you.</p>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              openMagnet(`About ${name}: how is the project going, and what should I do next?`)
            }
          >
            <MessageCircle size={13} aria-hidden="true" />
            Ask Magnet
          </button>
        </section>
        <section aria-label="Action items">
          <h3>Action items</h3>
          <ul className={styles.actions}>
            {office.actions.map((a) => (
              <li key={a.id} data-done={a.done || undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={a.done}
                    onChange={(e) =>
                      void setAction(projectId, a.id, e.target.checked).catch(() => undefined)
                    }
                  />
                  <span>{a.text}</span>
                </label>
                <span className={styles.owner}>
                  {a.owner === 'you' ? 'you' : OFFICE_AGENT_MONO[a.owner]}
                </span>
                <button
                  type="button"
                  className={styles.x}
                  aria-label={`Remove ${a.text}`}
                  onClick={() => void removeAction(projectId, a.id)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <AddAction projectId={projectId} onError={setError} />
        </section>
      </aside>
    </div>
  );
}

function AddAction({ projectId, onError }: { projectId: string; onError(m: string | null): void }) {
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('you');
  return (
    <form
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const o = OfficeStageSchema.safeParse(owner);
        void addAction(projectId, text.trim(), o.success ? o.data : 'you')
          .then(() => {
            setText('');
            onError(null);
          })
          .catch((err: unknown) =>
            onError(err instanceof ApiFailure ? err.message : 'Could not add it.'),
          );
      }}
    >
      <input
        aria-label="New action item"
        placeholder="New action item"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <select aria-label="Who" value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="you">you</option>
        {OFFICE_STAGES.map((s) => (
          <option key={s} value={s}>
            {OFFICE_AGENT[s]}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-secondary btn-sm" aria-label="Add action item">
        <Plus size={13} aria-hidden="true" />
      </button>
    </form>
  );
}
