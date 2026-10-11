import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ConfigStore } from '../config.ts';
import { writeFileAtomic } from '../fsutil.ts';
import type { CustomTool, Runner } from '../claude/runner.ts';
import { projectDir } from '../projects/workspace.ts';

/** Notes this long or longer are cut in the prompt; the note-taker only needs the headings. */
const CONTEXT_CHARS = 20_000;

const SaveSchema = z.object({
  section: z.string().trim().min(1).max(80),
  markdown: z.string().trim().min(1).max(20_000),
});

const headingOf = (line: string) => /^##\s+(.+?)\s*#*\s*$/.exec(line)?.[1] ?? null;

/** The `##` headings of notes.md, in order. */
export function noteSections(md: string): string[] {
  return md.split('\n').flatMap((l) => headingOf(l) ?? []);
}

/**
 * Adds `body` at the end of the `## section` (matched without case), or as a new section at
 * the end. Existing text is never changed: the user's notes only get additions (CLAUDE.md
 * rule 3).
 */
export function insertNote(md: string, section: string, body: string): string {
  const lines = md.replace(/\s+$/, '').split('\n');
  const want = section.replace(/^#+\s*/, '').trim();
  const start = lines.findIndex((l) => headingOf(l)?.toLowerCase() === want.toLowerCase());
  const block = body.trim();
  if (start === -1) {
    const head = md.trim() ? `${lines.join('\n')}\n\n` : '';
    return `${head}## ${want}\n\n${block}\n`;
  }
  let end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
  if (end === -1) end = lines.length;
  while (end > start + 1 && lines[end - 1]?.trim() === '') end--;
  const before = lines.slice(0, end);
  const after = lines.slice(end);
  if (after.length && after[0]?.trim() !== '') after.unshift('');
  return [...before, '', block, ...after].join('\n') + '\n';
}

function notePrompt(note: string, current: string): string {
  const sections = noteSections(current);
  const context =
    current.length > CONTEXT_CHARS ? `${current.slice(0, CONTEXT_CHARS)}\n…(cut)` : current;
  return [
    'Organise this new note for the project notes file (_project/notes.md), then call save_note once.',
    '',
    '## The new note',
    note,
    '',
    '## How to organise it',
    '- Keep every fact, name, number and link in the note. Do not add facts.',
    '- Fix spelling and wording. Make it short: a few bullets, or one short paragraph.',
    '- No `#` or `##` headings in markdown; a `###` title is fine for a long note.',
    `- section: choose the existing section that fits best (${sections.length ? sections.map((s) => `"${s}"`).join(', ') : 'there are none yet'}). If none fits, give a short new section name.`,
    '- Do not repeat what the notes already say. Do not change other notes.',
    '',
    '## The notes file now',
    context.trim() ? context : '(empty)',
  ].join('\n');
}

export type OrganiseResult = { content: string; mtime: number; section: string };

/**
 * The note-taker: a short Claude turn that tidies a note and picks its section. It has no
 * tools but save_note; the daemon does the writing, as an addition to notes.md.
 */
export class NoteService {
  private readonly queue = new Map<string, Promise<unknown>>();

  constructor(
    private readonly config: ConfigStore,
    private readonly runner: Runner,
  ) {}

  /** One note at a time per project, so two notes never race on notes.md. */
  organise(projectId: string, note: string): Promise<OrganiseResult> {
    const prev = this.queue.get(projectId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => this.run(projectId, note));
    this.queue.set(projectId, next);
    next
      .finally(() => {
        if (this.queue.get(projectId) === next) this.queue.delete(projectId);
      })
      .catch(() => undefined);
    return next;
  }

  private async run(projectId: string, note: string): Promise<OrganiseResult> {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const file = path.join(dir, '_project', 'notes.md');
    const read = () => (existsSync(file) ? readFileSync(file, 'utf8') : '');

    let saved: z.infer<typeof SaveSchema> | null = null;
    let error: string | null = null;
    const save: CustomTool = {
      name: 'save_note',
      description:
        'Save the organised note. section: an existing ## heading of notes.md, or a short new one. markdown: the organised note.',
      shape: SaveSchema.shape,
      handler: async (args) => {
        const parsed = SaveSchema.safeParse(args);
        if (!parsed.success) {
          return {
            ok: false,
            text: `Not valid, fix it and call save_note again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          };
        }
        saved = parsed.data;
        return { ok: true, text: 'Saved. You are done; stop here.' };
      },
    };

    const handle = this.runner({
      cwd: dir,
      prompt: notePrompt(note, read()),
      resume: null,
      model: 'haiku',
      planMode: false,
      appendSystemPrompt:
        'You are the note-taker inside Cherry. You only organise the note you are given. Finish by calling save_note.',
      allowedTools: [],
      disallowedTools: [
        'Edit',
        'Write',
        'MultiEdit',
        'NotebookEdit',
        'Bash',
        'WebFetch',
        'WebSearch',
      ],
      decisions: false,
      extraTools: [save],
      onPermission: async () => ({
        allow: false,
        message: 'The note-taker has no tools but save_note.',
      }),
      onDecision: async () => ({ ok: false, error: 'The note-taker cannot ask questions.' }),
      onEvent: (ev) => {
        if (ev.t === 'result' && !ev.ok) error = ev.error;
      },
    });
    await handle.done;

    const result = saved as z.infer<typeof SaveSchema> | null;
    if (!result) throw new Error(error ?? 'The note-taker did not save the note.');
    // Read again: the user may have typed in the notes while Claude worked.
    const content = insertNote(read(), result.section, result.markdown);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, content);
    return { content, mtime: statSync(file).mtimeMs, section: result.section };
  }
}
