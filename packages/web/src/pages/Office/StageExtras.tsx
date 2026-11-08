import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { IssueListSchema } from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { api, ApiFailure } from '../../api/client.ts';
import { saveFile, useFile } from '../../api/workspace.ts';
import { parseChecklist, parseQuestions, toggleCheck, writeAnswers } from './stageFiles.ts';
import styles from './StageRoom.module.css';

export const QUESTIONS_FILE = 'docs/requirements/technical/questions.md';
export const UAT_FILE = 'docs/testing/client/uat.md';

/** Requirements (o9): the questions for the client, and the answers the user brings back. */
export function QuestionsTab({ projectId }: { projectId: string }) {
  const file = useFile(projectId, QUESTIONS_FILE);
  const setDraft = useChatDraft((s) => s.set);
  const content = file.data?.content ?? '';
  const questions = parseQuestions(content);
  if (file.isPending) return null;
  if (!file.data || !questions.length)
    return (
      <div className={styles.empty}>
        <p>The System Analyst writes the questions for the client in {QUESTIONS_FILE}.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setDraft(projectId, 'Write the questions I should ask the client.')}
        >
          Ask for the questions
        </button>
      </div>
    );

  // Keyed by the file: a new version from the agent starts the form again.
  return (
    <QuestionsForm
      key={`${file.data.mtime}`}
      projectId={projectId}
      content={content}
      mtime={file.data.mtime}
    />
  );
}

function QuestionsForm({
  projectId,
  content,
  mtime,
}: {
  projectId: string;
  content: string;
  mtime: number;
}) {
  const setDraft = useChatDraft((s) => s.set);
  const questions = parseQuestions(content);
  const [answers, setAnswers] = useState(() => questions.map((q) => q.answer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = answers.filter((a) => a.trim()).length;
  const save = async (send: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await saveFile(projectId, QUESTIONS_FILE, writeAnswers(content, answers), mtime);
      if (send)
        setDraft(
          projectId,
          `I met the client. ${answered} of ${questions.length} questions are answered in ${QUESTIONS_FILE}. Write the requirements from them.`,
        );
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save the answers.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.extra}>
      <p className={styles.note}>
        Ask these at the client meeting, then type the answers. They are saved in the file the
        System Analyst reads.
      </p>
      {questions.map((q, i) => (
        <label key={q.line} className={styles.question}>
          <span>{q.text}</span>
          <textarea
            rows={2}
            value={answers[i] ?? ''}
            placeholder="The client's answer"
            onChange={(e) => setAnswers(answers.map((a, n) => (n === i ? e.target.value : a)))}
          />
        </label>
      ))}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.extraFoot}>
        <span className={styles.note}>
          {answered} of {questions.length} answered
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => void save(false)}
        >
          Save
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void save(true)}
        >
          Send answers to the agent
        </button>
      </div>
    </div>
  );
}

/** Testing (o9): the client's acceptance test, ticked in place in the file. */
export function UatTab({ projectId }: { projectId: string }) {
  const file = useFile(projectId, UAT_FILE);
  const setDraft = useChatDraft((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  if (file.isPending) return null;
  const items = parseChecklist(file.data?.content ?? '');
  if (!file.data || !items.length)
    return (
      <div className={styles.empty}>
        <p>The QA Engineer writes the acceptance test for the client in {UAT_FILE}.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setDraft(projectId, 'Write the acceptance test for the client.')}
        >
          Ask for the acceptance test
        </button>
      </div>
    );
  const toggle = async (line: number, done: boolean) => {
    setError(null);
    try {
      await saveFile(
        projectId,
        UAT_FILE,
        toggleCheck(file.data!.content, line, done),
        file.data!.mtime,
      );
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save the checklist.');
    }
  };
  const done = items.filter((i) => i.done).length;
  return (
    <div className={styles.extra}>
      <p className={styles.note}>
        The client's staff try each task. Tick the ones that work. {done} of {items.length} done.
      </p>
      <ul className={styles.checks}>
        {items.map((it) => (
          <li key={it.line}>
            <label>
              <input
                type="checkbox"
                checked={it.done}
                onChange={(e) => void toggle(it.line, e.target.checked)}
              />
              {it.text}
            </label>
          </li>
        ))}
      </ul>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

/** Testing (o9): the open bugs, one issue file each in docs/issues/. */
export function BugsTab({ projectId }: { projectId: string }) {
  const issues = useQuery({
    queryKey: ['issues', projectId],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/issues`,
        undefined,
        IssueListSchema,
      ),
  });
  // Open and planned first, then the fixed ones, each with its state from the file (#51).
  const bugs = (issues.data?.issues ?? [])
    .filter((i) => i.type === 'bug')
    .sort(
      (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.number - b.number,
    );
  const open = bugs.filter((i) => i.status !== 'done').length;
  if (issues.isPending) return null;
  if (!bugs.length)
    return (
      <p className={styles.empty}>
        No bugs yet. The QA Engineer writes one issue per bug in docs/issues/.
      </p>
    );
  return (
    <ul className={styles.bugs} aria-label={`${open} open of ${bugs.length} bugs`}>
      {bugs.map((i) => (
        <li key={i.file} data-done={i.status === 'done' || undefined}>
          <span className="mono">#{i.number}</span>
          <span className={styles.bugTitle}>{i.title}</span>
          <span className="tag">{i.status === 'done' ? 'fixed' : i.status}</span>
          <span className="tag">{i.severity}</span>
        </li>
      ))}
    </ul>
  );
}
