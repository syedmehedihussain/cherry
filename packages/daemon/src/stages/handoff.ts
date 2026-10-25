import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { STAGE_LABEL, type ChatState, type WorkspaceStage } from '@cherry/shared';
import type { CustomTool, Runner } from '../claude/runner.ts';
import { readTasks } from '../projects/tasks.ts';

const NoteSchema = z.object({ note: z.string().min(1).max(900) });

/** What the note is written from: small and capped, so the Haiku job stays small (ADR-0022). */
export function handoffContext(dir: string, from: WorkspaceStage, chat: ChatState | null): string {
  const status = existsSync(path.join(dir, '_project', 'STATUS.md'))
    ? readFileSync(path.join(dir, '_project', 'STATUS.md'), 'utf8').slice(0, 1500)
    : '(none)';
  let items: string[];
  try {
    items = readTasks(dir)
      .tasks.filter((t) => t.phase === from)
      .map((t) => `- [${t.status === 'done' || t.status === 'skipped' ? 'x' : ' '}] ${t.title}`);
  } catch {
    items = [];
  }
  const said = (chat?.items ?? [])
    .flatMap((i) =>
      i.kind === 'user'
        ? [`User: ${i.text}`]
        : i.kind === 'text'
          ? [`${STAGE_LABEL[from]} agent: ${i.text}`]
          : i.kind === 'tool' && i.verb === 'edit' && i.status === 'ok'
            ? [`(wrote ${i.target})`]
            : [],
    )
    .join('\n')
    .slice(-2500);
  return [
    `## ${STAGE_LABEL[from]} checklist`,
    items.join('\n') || '(none)',
    '## STATUS.md',
    status,
    `## The end of the ${STAGE_LABEL[from]} chat`,
    said || '(empty)',
  ].join('\n\n');
}

/** Without Claude: the checklist and the files written, when the Haiku job cannot run. */
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

/**
 * A short handoff note when the user moves to the next stage (V3 r12). A small job, so it runs
 * on Haiku with a capped prompt and no tools but the one that saves the note (ADR-0022).
 */
export async function writeHandoffNote(
  runner: Runner,
  dir: string,
  from: WorkspaceStage,
  to: WorkspaceStage,
  chat: ChatState | null,
): Promise<{ note: string; by: 'haiku' | 'cherry' }> {
  let saved: string | null = null;
  const save: CustomTool = {
    name: 'handoff_note',
    description: 'Save the handoff note. At most 6 short lines.',
    shape: NoteSchema.shape,
    handler: async (args) => {
      const parsed = NoteSchema.safeParse(args);
      if (!parsed.success) return { ok: false, text: 'Give a note of at most 900 characters.' };
      saved = parsed.data.note;
      return { ok: true, text: 'Saved. You are done; stop here.' };
    },
  };
  try {
    const handle = runner({
      cwd: dir,
      prompt: [
        `Write the handoff note from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}: what ${STAGE_LABEL[from]} made, what is still open, and the one thing the ${STAGE_LABEL[to]} agent must know first.`,
        'At most 6 lines. ASD-STE100: short sentences, facts first, file paths in backticks. Then call handoff_note.',
        '',
        handoffContext(dir, from, chat),
      ].join('\n'),
      resume: null,
      model: 'haiku',
      planMode: false,
      appendSystemPrompt:
        'You write a short handoff note inside Cherry. You have no tools but handoff_note.',
      allowedTools: [],
      disallowedTools: [
        'Edit',
        'Write',
        'MultiEdit',
        'NotebookEdit',
        'Bash',
        'WebFetch',
        'WebSearch',
        'Read',
        'Glob',
        'Grep',
      ],
      decisions: false,
      extraTools: [save],
      onPermission: async () => ({ allow: false, message: 'Only handoff_note.' }),
      onDecision: async () => ({ ok: false, error: 'No questions.' }),
      onEvent: () => undefined,
    });
    await Promise.race([handle.done, new Promise((r) => setTimeout(r, 60_000))]);
    if (saved === null) await handle.interrupt().catch(() => undefined);
  } catch {
    saved = null;
  }
  const note = saved as string | null;
  return note
    ? { note: note.trim(), by: 'haiku' }
    : { note: plainNote(from, chat, dir), by: 'cherry' };
}
