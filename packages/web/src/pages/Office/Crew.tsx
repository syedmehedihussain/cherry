import { useQuery } from '@tanstack/react-query';
import { Check, Circle, Sparkles } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { CrewSchema, suggest, type Stage } from '@cherry/shared';
import { useChat, useChatDraft } from '../../api/chat.ts';
import { api } from '../../api/client.ts';
import { stageInfo, useStageInfo } from '../../api/stages.ts';
import styles from './Crew.module.css';

/**
 * The room's crew (ADR-0062): the checks the stage needs before it is ready, the specialists and
 * skills the agent uses on its own, and which of them fit the current job. Matching is by words,
 * with no model call (ADR-0055). A click only puts a line in the message box; nothing runs
 * until the user sends it.
 */
export function CrewPanel({
  projectId,
  stage,
  onAsk,
}: {
  projectId: string;
  stage: Stage;
  /** Shows the chat after a click, where the chat shares the panel. */
  onAsk?: () => void;
}) {
  const info = stageInfo(useStageInfo().data, stage);
  const items = useChat(projectId, stage).data?.items;
  const putDraft = useChatDraft((s) => s.set);
  const setDraft = (id: string, text: string) => {
    putDraft(id, text);
    onAsk?.();
  };
  const crew = useQuery({
    queryKey: ['crew', projectId, stage],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/crew?stage=${stage}`,
        undefined,
        CrewSchema,
      ),
  });
  // A specialist may finish during a turn: look again when the chat moves on.
  const { refetch } = crew;
  const count = items?.length ?? 0;
  useEffect(() => {
    void refetch();
  }, [count, refetch]);

  // The job: the last message the user sent in this room.
  const job = useMemo(() => {
    const last = items?.findLast((i) => i.kind === 'user' && !!i.text.trim());
    return last?.kind === 'user' ? last.text : '';
  }, [items]);
  const specialists = info?.specialists ?? [];
  const skills = info?.skills ?? [];
  const fitSpecialists = new Set(suggest(job, specialists, 2, 3).map((s) => s.name));
  const fitSkills = new Set(suggest(job, skills, 3, 2).map((s) => s.name));
  const runs = crew.data?.runs ?? {};
  const checks = crew.data?.checks ?? [];
  const byFit = <T extends { name: string }>(list: T[], fit: Set<string>) =>
    [...list].sort((a, b) => Number(fit.has(b.name)) - Number(fit.has(a.name)));

  return (
    <div className={styles.crew}>
      <p className={styles.lead}>
        {info?.name ?? 'The agent'} uses these on its own. A click puts a line in the message box;
        nothing runs until you send it.
      </p>

      {checks.length > 0 && (
        <section aria-label="Before ready">
          <h3>Before ready</h3>
          <ul className={styles.checks}>
            {checks.map((c) => (
              <li key={c.any.join('|')} data-done={c.done || undefined}>
                {c.done ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Circle size={14} aria-hidden="true" />
                )}
                <span className="mono">{c.any.join(' or ')}</span>
                <span className={styles.note}>{c.done ? 'checked' : 'not yet'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {specialists.length > 0 && (
        <section aria-label="Specialists">
          <h3>Specialists</h3>
          <ul className={styles.rows}>
            {byFit(specialists, fitSpecialists).map((s) => (
              <li key={s.name}>
                <div className={styles.rowHead}>
                  <span className="mono">{s.name}</span>
                  {fitSpecialists.has(s.name) && <FitBadge />}
                  {s.model && <span className={styles.note}>{s.model}</span>}
                  {(runs[s.name] ?? 0) > 0 && (
                    <span className={styles.note}>ran {runs[s.name]}×</span>
                  )}
                  <span className={styles.grow} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title={`Put a request for ${s.name} in the message box`}
                    onClick={() => setDraft(projectId, `Hand this to your ${s.name} specialist: `)}
                  >
                    Ask
                  </button>
                </div>
                <p className={styles.desc}>{s.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {skills.length > 0 && (
        <section aria-label="Skills">
          <h3>Skills</h3>
          <ul className={styles.chips}>
            {byFit(skills, fitSkills).map((k) => (
              <li key={k.name}>
                <button
                  type="button"
                  title={k.description}
                  data-fit={fitSkills.has(k.name) || undefined}
                  onClick={() => setDraft(projectId, `/cherry-${stage}:${k.name} `)}
                >
                  {fitSkills.has(k.name) && <Sparkles size={12} aria-label="Fits this job" />}
                  {k.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FitBadge() {
  return (
    <span className={styles.fit} title="Fits the job in this room">
      fits this job
    </span>
  );
}
