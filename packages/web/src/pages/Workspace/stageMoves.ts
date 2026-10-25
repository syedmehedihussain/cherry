import { useCallback, useState } from 'react';
import { STAGE_LABEL, type WorkspaceStage } from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { handoffNote } from '../../api/stages.ts';
import { setPhase } from '../../api/workspace.ts';
import { useStages } from '../../state/stage.ts';

/** The first message of the next stage: the handoff note, then what to do. Not sent. */
export function handoffDraft(from: WorkspaceStage, to: WorkspaceStage, note: string): string {
  return `Handoff from ${STAGE_LABEL[from]}:\n${note}\n\nStart ${STAGE_LABEL[to]}: read what ${STAGE_LABEL[from]} made, say what you understood and what you will do first.`;
}

/**
 * Moves the project to the next stage (V3 r12): Haiku writes a short handoff note, the phase
 * moves on, the stage opens, and the note waits in the box for the user to send.
 */
export function useMoveStage(projectId: string) {
  const setStage = useStages((s) => s.set);
  const setDraft = useChatDraft((s) => s.set);
  const [moving, setMoving] = useState(false);
  const move = useCallback(
    async (from: WorkspaceStage, to: WorkspaceStage) => {
      setMoving(true);
      try {
        const { note } = await handoffNote(projectId, from, to).catch(() => ({
          note: `${STAGE_LABEL[from]} is finished.`,
        }));
        await setPhase(projectId, to).catch(() => undefined);
        setStage(projectId, to);
        setDraft(projectId, handoffDraft(from, to, note));
      } finally {
        setMoving(false);
      }
    },
    [projectId, setStage, setDraft],
  );
  return { move, moving };
}
