import { STAGE_LABEL, type ChatState, type WorkspaceStage } from '@cherry/shared';
import { readTasks } from '../projects/tasks.ts';

/** The checklist items done and the files written: Cherry's note, with no model call (ADR-0055). */
export function plainNote(from: WorkspaceStage, chat: ChatState | null, dir: string): string {
  let done: string[];
  try {
    done = readTasks(dir)
      .tasks.filter((t) => t.phase === from && t.status === 'done')
      .map((t) => t.title);
  } catch {
    done = [];
  }
  const files = [
    ...new Set(
      (chat?.items ?? []).flatMap((i) =>
        i.kind === 'tool' && i.verb === 'edit' && i.status === 'ok' ? [i.target] : [],
      ),
    ),
  ];
  return [
    done.length ? `Done: ${done.join('; ')}.` : `${STAGE_LABEL[from]} has no checklist items done.`,
    files.length ? `Files: ${files.slice(0, 12).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The handoff note when the user moves to the next stage (V3 r12). No model call (ADR-0055). */
export function writeHandoffNote(
  dir: string,
  from: WorkspaceStage,
  chat: ChatState | null,
): { note: string; by: 'cherry' } {
  return { note: plainNote(from, chat, dir), by: 'cherry' };
}
