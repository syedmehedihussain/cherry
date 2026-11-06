/**
 * The small Markdown files the user fills in from a stage room (V4 o9): the questions for the
 * client (Requirements) and the acceptance test checklist (Testing).
 */

export interface Question {
  /** Line index of the question in the file. */
  line: number;
  text: string;
  answer: string;
}

const Q = /^\s*\d+[.)]\s+(.+?)\s*$/;
const A = /^\s+(?:[-*]\s*)?Answer:\s*(.*?)\s*$/i;

/** `1. Question?` lines, each with an optional indented `Answer: ...` line under it. */
export function parseQuestions(md: string): Question[] {
  const lines = md.split('\n');
  const out: Question[] = [];
  lines.forEach((l, i) => {
    const q = Q.exec(l);
    if (!q) return;
    const a = A.exec(lines[i + 1] ?? '');
    out.push({ line: i, text: q[1]!, answer: a ? a[1]! : '' });
  });
  return out;
}

/** The file with each question's answer written under it (or removed when empty). */
export function writeAnswers(md: string, answers: string[]): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let qi = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    out.push(l);
    if (!Q.test(l)) continue;
    if (A.test(lines[i + 1] ?? '')) i++;
    const a = (answers[qi++] ?? '').trim().replace(/\s*\n\s*/g, ' ');
    if (a) out.push(`   Answer: ${a}`);
  }
  return out.join('\n');
}

export interface CheckItem {
  line: number;
  text: string;
  done: boolean;
}

const C = /^(\s*[-*] \[)([ xX])(\]\s+)(.*)$/;

/** `- [ ] task` and `- [x] task` lines. */
export function parseChecklist(md: string): CheckItem[] {
  return md.split('\n').flatMap((l, i) => {
    const m = C.exec(l);
    return m ? [{ line: i, text: m[4]!, done: m[2] !== ' ' }] : [];
  });
}

/** The file with one checklist line ticked or cleared. */
export function toggleCheck(md: string, line: number, done: boolean): string {
  const lines = md.split('\n');
  const m = C.exec(lines[line] ?? '');
  if (!m) return md;
  lines[line] = `${m[1]}${done ? 'x' : ' '}${m[3]}${m[4]}`;
  return lines.join('\n');
}
