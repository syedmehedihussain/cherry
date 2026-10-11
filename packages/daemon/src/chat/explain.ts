import { existsSync, readFileSync } from 'node:fs';
import type { ChatItem } from '@cherry/shared';
import { git } from '../git.ts';
import { badRequest } from '../http.ts';
import { isSecretFile, resolveInside } from '../paths.ts';
import type { Runner } from '../claude/runner.ts';

/** Input caps keep one Explain click to a few thousand tokens (ADR-0022). */
const MAX_DIFF = 6000;
const MAX_REPLY = 1200;
const NO_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'Bash',
  'WebFetch',
  'WebSearch',
];

type Tool = Extract<ChatItem, { kind: 'tool' }>;

/** What one Claude turn changed, from the chat items alone (no tokens). */
export function turnChanges(items: ChatItem[], turnId: string) {
  const turn = items.filter((i) => 'turnId' in i && i.turnId === turnId);
  const tools = turn.filter((i): i is Tool => i.kind === 'tool');
  const firstEdit = tools.findIndex((t) => t.verb === 'edit' && t.status === 'ok');
  const files = [
    ...new Set(tools.filter((t) => t.verb === 'edit' && t.status === 'ok').map((t) => t.target)),
  ];
  const commands = (firstEdit < 0 ? [] : tools.slice(firstEdit))
    .filter((t) => t.verb === 'run')
    .map((t) => ({ command: t.target, status: t.status }));
  const texts = turn.filter((i) => i.kind === 'text');
  const reply = texts.length ? texts[texts.length - 1]!.text : '';
  return { files, commands, reply };
}

/** The diff of the changed files vs HEAD (new files: their first lines), capped. */
async function diffOf(dir: string, files: string[]): Promise<string> {
  const safe = files.filter((f) => !isSecretFile(f));
  let out = '';
  for (const f of safe) {
    if (out.length >= MAX_DIFF) break;
    const d = await git(dir, ['diff', 'HEAD', '-U2', '--', f]);
    if (d.stdout.trim()) out += d.stdout;
    else {
      const abs = resolveInside(dir, f);
      if (existsSync(abs))
        out += `new file ${f}\n${readFileSync(abs, 'utf8').split('\n').slice(0, 40).join('\n')}\n`;
    }
  }
  return out.length > MAX_DIFF ? out.slice(0, MAX_DIFF) + '\n[diff cut here]' : out;
}

export function explainPrompt(c: ReturnType<typeof turnChanges>, diff: string): string {
  return [
    'Explain to the user what this change did, in plain words.',
    'At most 5 short bullet points: what changed and why, then what happened after (commands run and their result). No preamble.',
    '',
    `Files changed: ${c.files.join(', ')}`,
    c.commands.length
      ? `Commands run after the change:\n${c.commands.map((x) => `- ${x.command} (${x.status === 'denied' ? 'denied by the user' : x.status})`).join('\n')}`
      : 'No commands were run after the change.',
    '',
    "Claude's last message in that turn:",
    c.reply.slice(0, MAX_REPLY) || '(none)',
    '',
    'Diff (may include earlier uncommitted work in the same files):',
    diff || '(no diff: the files match HEAD now)',
  ].join('\n');
}

/** One Haiku call, no tools, plain text back. Only ever runs on the user's click. */
export async function explainTurn(runner: Runner, dir: string, items: ChatItem[], turnId: string) {
  const changes = turnChanges(items, turnId);
  if (!changes.files.length) throw badRequest('Claude did not change any files in this turn.');
  const prompt = explainPrompt(changes, await diffOf(dir, changes.files));
  let text = '';
  let error: string | null = null;
  const handle = runner({
    cwd: dir,
    prompt,
    resume: null,
    model: 'haiku',
    planMode: false,
    appendSystemPrompt: 'You summarise a code change for Cherry. Use only what you are given.',
    allowedTools: [],
    disallowedTools: NO_TOOLS,
    decisions: false,
    onPermission: async () => ({ allow: false, message: 'No tools here.' }),
    onDecision: async () => ({ ok: false, error: 'No questions here.' }),
    onEvent: (ev) => {
      if (ev.t === 'text') text += ev.delta;
      if (ev.t === 'result' && !ev.ok) error = ev.error;
    },
  });
  await handle.done;
  if (!text.trim()) throw new Error(error ?? 'Claude did not answer.');
  return text.trim();
}
