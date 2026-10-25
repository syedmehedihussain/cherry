import { ArrowRight, RefreshCw } from 'lucide-react';
import { STAGE_LABEL, type WorkspaceStage } from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { nextStage, stageInfo, useStageInfo, useStageProgress } from '../../api/stages.ts';
import { useMoveStage } from './stageMoves.ts';
import styles from './StageProgress.module.css';

const SHOWN = 4;

function Bar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * The Overview's stage card (V2.1 w5): how far the open stage is, what is left, Recheck, and
 * Move to the next stage once everything is finished. The stage agent keeps the checklist
 * current through stage_checklist while you talk.
 */
export function StageProgressCard({
  projectId,
  stage,
  onOpenChat,
  onOpenNotes,
}: {
  projectId: string;
  stage: WorkspaceStage;
  onOpenChat(): void;
  onOpenNotes(): void;
}) {
  const progress = useStageProgress(projectId, stage);
  const setDraft = useChatDraft((s) => s.set);
  const { move, moving } = useMoveStage(projectId);
  const agent = stageInfo(useStageInfo().data, stage)?.name ?? 'stage agent';
  const label = STAGE_LABEL[stage];
  const next = nextStage(stage);
  const ask = (text: string) => {
    setDraft(projectId, text);
    onOpenChat();
  };

  if (!progress) return null;
  const { done, total, percent, open } = progress;
  const ready = total > 0 && open.length === 0 && done === total;

  return (
    <section className={styles.card} aria-label={`${label} progress`}>
      <div className={styles.head}>
        <span className={styles.title}>{label}</span>
        <span className={styles.percent}>{total ? `${percent}%` : '—'}</span>
      </div>
      <Bar percent={percent} label={`${label} progress`} />
      {total === 0 ? (
        <p className={styles.note}>
          No checklist yet. Recheck asks the {agent} to read the project and make one.
        </p>
      ) : ready ? (
        <p className={styles.note}>
          {label} is done{next ? `: ready for ${STAGE_LABEL[next]}.` : '.'}
        </p>
      ) : (
        <>
          <p className={styles.note}>
            {open.length} left · {done} of {total} done
          </p>
          <ul className={styles.left}>
            {open.slice(0, SHOWN).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  title={`Ask the ${agent} about this`}
                  onClick={() => ask(`Let's work on this ${label} item: ${t.title}.`)}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
          {open.length > SHOWN && (
            <button type="button" className={styles.more} onClick={onOpenNotes}>
              and {open.length - SHOWN} more
            </button>
          )}
        </>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title={`The ${agent} reads STATUS.md and the ${label} docs and updates this checklist`}
          onClick={() =>
            ask(
              `Recheck the ${label} checklist: read _project/STATUS.md and the ${label} files, then update the checklist with stage_checklist (add what is still left, mark what the files already cover as done, drop what does not apply). Then tell me in two lines what is left.`,
            )
          }
        >
          <RefreshCw size={12} aria-hidden="true" />
          Recheck
        </button>
        {ready && next && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={moving}
            onClick={() => {
              void move(stage, next).then(onOpenChat);
            }}
          >
            Move to {STAGE_LABEL[next]}
            <ArrowRight size={12} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
