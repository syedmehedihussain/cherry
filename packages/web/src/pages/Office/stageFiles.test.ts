import { describe, expect, it } from 'vitest';
import { parseChecklist, parseQuestions, toggleCheck, writeAnswers } from './stageFiles.ts';

const qs = `# Questions for the client

1. Does each branch have its own trainers?
   Answer: Own trainers, same prices.
2. Which payment plans do members have?
3. Bangla, English, or both?
`;

describe('questions for the client', () => {
  it('reads numbered questions and their answers', () => {
    expect(parseQuestions(qs).map((q) => [q.text, q.answer])).toEqual([
      ['Does each branch have its own trainers?', 'Own trainers, same prices.'],
      ['Which payment plans do members have?', ''],
      ['Bangla, English, or both?', ''],
    ]);
  });

  it('writes answers under their questions, replacing old ones and dropping empty ones', () => {
    const out = writeAnswers(qs, ['Own trainers.', 'Monthly\nand 3 months', '']);
    expect(out).toBe(`# Questions for the client

1. Does each branch have its own trainers?
   Answer: Own trainers.
2. Which payment plans do members have?
   Answer: Monthly and 3 months
3. Bangla, English, or both?
`);
    expect(parseQuestions(out)[1]!.answer).toBe('Monthly and 3 months');
  });
});

describe('the acceptance checklist', () => {
  const uat = '# UAT\n\n- [ ] Sign in\n- [x] Renew with bKash\n* [ ] Log a workout\n';
  it('reads and toggles items in place', () => {
    expect(parseChecklist(uat)).toEqual([
      { line: 2, text: 'Sign in', done: false },
      { line: 3, text: 'Renew with bKash', done: true },
      { line: 4, text: 'Log a workout', done: false },
    ]);
    expect(toggleCheck(uat, 2, true)).toBe(
      '# UAT\n\n- [x] Sign in\n- [x] Renew with bKash\n* [ ] Log a workout\n',
    );
    expect(toggleCheck(uat, 3, false)).toContain('- [ ] Renew with bKash');
    expect(toggleCheck(uat, 0, true)).toBe(uat);
  });
});
