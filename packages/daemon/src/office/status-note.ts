import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { localDay } from '@cherry/shared';
import { writeFileAtomic } from '../fsutil.ts';

/**
 * After a sign-off, `_project/STATUS.md` says so (finding #37), written by Cherry with no model
 * call (ADR-0055): the line goes first under "Where we left off" and `updated` moves to today.
 * The rest of the file is kept as it is. No STATUS.md: nothing is written.
 */
export function noteInStatus(dir: string, line: string, now = new Date()): boolean {
  const file = path.join(dir, '_project', 'STATUS.md');
  if (!existsSync(file)) return false;
  const day = localDay(now);
  let text = readFileSync(file, 'utf8');
  text = /^updated:.*$/m.test(text) ? text.replace(/^updated:.*$/m, `updated: ${day}`) : text;
  const entry = `${day}: ${line}`;
  const head = /^## Where we left off[ \t]*\n+/m.exec(text);
  text = head
    ? `${text.slice(0, head.index + head[0].length)}${entry}\n\n${text.slice(head.index + head[0].length)}`
    : `${text.trimEnd()}\n\n## Where we left off\n\n${entry}\n`;
  writeFileAtomic(file, text);
  return true;
}
