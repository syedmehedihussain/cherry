import { ArrowRight, CircleCheck, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { STAGE_LABEL, isWorkspaceStage, type ChatItem, type Stage } from '@cherry/shared';
import { nextStage, useStageProgress } from '../../api/stages.ts';
import { useUi } from '../../state/ui.ts';
import { useMoveStage } from './stageMoves.ts';
import styles from './Chat.module.css';

const dismissKey = (projectId: string, stage: Stage) => `cherry.nextChip.${projectId}.${stage}`;

/**
 * At 100%, a quiet suggestion to move on (V3 r12, artboard 05). Never a gate: any stage opens
 * at any time. "Not now" hides it until the checklist changes.
 */
export function NextStageChip({ projectId, stage }: { projectId: string; stage: Stage }) {
  const progress = useStageProgress(projectId, stage);
  const { move, moving } = useMoveStage(projectId);
  const next = nextStage(stage);
  const mark = progress ? `${progress.done}/${progress.total}` : '';
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(dismissKey(projectId, stage));
    } catch {
      return null;
    }
  });
  if (!progress?.total || progress.percent < 100 || !next || !isWorkspaceStage(stage)) return null;
  if (hidden === mark) return null;
  return (
    <div className={styles.next} role="status">
      <CircleCheck size={15} className={styles.nextIcon} aria-hidden="true" />
      <span>
        <b>{STAGE_LABEL[stage]} is done.</b> Move to {STAGE_LABEL[next]}?
      </span>
      <button
        type="button"
        className={styles.nextGo}
        disabled={moving}
        onClick={() => void move(stage, next)}
      >
        {moving ? 'Writing the handoff…' : `Open ${STAGE_LABEL[next]}`}
        <ArrowRight size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.nextLater}
        onClick={() => {
          setHidden(mark);
          try {
            localStorage.setItem(dismissKey(projectId, stage), mark);
          } catch {
            // Private window: it shows again after a reload.
          }
        }}
      >
        Not now
      </button>
    </div>
  );
}

/** The chat is not moving: two failed replies in a row, or the same message twice. */
export function stuckReason(items: ChatItem[]): string | null {
  const ends = items.filter((i) => i.kind === 'turn-end');
  const lastTwo = ends.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((e) => e.kind === 'turn-end' && !e.ok && !e.stopped))
    return 'The last two replies failed.';
  const sent = items.flatMap((i) => (i.kind === 'user' && i.text.trim() ? [i.text.trim()] : []));
  if (sent.length >= 2 && sent.at(-1)!.toLowerCase() === sent.at(-2)!.toLowerCase())
    return 'You sent the same message twice.';
  return null;
}

/** "Stuck?" (V3 r12): a second look from Magnet, or a rewind. Quiet, and only when it fits. */
export function StuckHint({
  projectId,
  stage,
  items,
  onRewind,
}: {
  projectId: string;
  stage: Stage;
  items: ChatItem[];
  onRewind(): void;
}) {
  const openMagnet = useUi((s) => s.openMagnet);
  const reason = stuckReason(items);
  if (!reason) return null;
  const lastUser = items.findLast((i) => i.kind === 'user');
  const lastError = items.findLast((i) => i.kind === 'turn-end' && !i.ok);
  return (
    <div className={styles.next} role="note">
      <LifeBuoy size={15} className={styles.stuckIcon} aria-hidden="true" />
      <span>
        <b>Stuck?</b> {reason}
      </span>
      <button
        type="button"
        className={styles.nextGo}
        onClick={() =>
          openMagnet(
            `We are stuck in ${STAGE_LABEL[stage]} of ${projectId}. ${reason} My last message: "${lastUser?.kind === 'user' ? lastUser.text.slice(0, 300) : ''}".${lastError?.kind === 'turn-end' && lastError.error ? ` The error: ${lastError.error.slice(0, 300)}.` : ''} What should we try?`,
          )
        }
      >
        Ask Magnet
      </button>
      <button type="button" className={styles.nextLater} onClick={onRewind}>
        Rewind
      </button>
    </div>
  );
}
