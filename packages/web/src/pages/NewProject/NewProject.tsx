import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ProjectNameSchema } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { useChatDraft } from '../../api/chat.ts';
import { removeIdea } from '../../api/ideas.ts';
import { queryClient, useConfig, useHealth } from '../../api/queries.ts';
import { startProject } from '../../api/start.ts';
import { FolderPicker } from '../../components/FolderPicker/FolderPicker.tsx';
import { Pill } from '../../components/Pill/Pill.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { tildify } from '../../lib/paths.ts';
import { useStages } from '../../state/stage.ts';
import styles from './NewProject.module.css';

/** A folder name from the first words of the idea ("A printable QR code…" → "printable-qr-code"). */
export function suggestName(idea: string): string {
  const skip = new Set(['a', 'an', 'the', 'for', 'to', 'of', 'and', 'that', 'my', 'with', 'app']);
  return idea
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !skip.has(w))
    .slice(0, 3)
    .join('-')
    .slice(0, 40);
}

/** The first Plan message, left in the composer so the user sends it (ADR-0036). */
export function planPrompt(idea: string): string {
  return `This is a new project. Here is the idea:\n\n${idea.trim()}\n\nHelp me plan it.`;
}

/**
 * Start project (ADR-0036): the idea, a folder name and where to create it. Start planning
 * makes the folder and opens the project on the Plan stage with the idea in the composer.
 */
export function NewProject() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const health = useHealth();
  const config = useConfig();
  const setStage = useStages((s) => s.set);
  const setDraft = useChatDraft((s) => s.set);
  // New projects go in the folder chosen at setup or in Settings (ADR-0032); Change picks
  // another one for this project only.
  const [parent, setParent] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const base = parent ?? config.data?.resolvedProjectsDir ?? null;
  const projectsDir = base ? `${tildify(base)}/` : '…/';
  const [idea, setIdea] = useState(params.get('idea') ?? '');
  // From an idea on Home: its name becomes the folder name, and the idea goes once started.
  const fromIdea = params.get('from');
  const [name, setName] = useState(params.get('name') ? suggestName(params.get('name')!) : '');
  const [nameTouched, setNameTouched] = useState(!!params.get('name'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownName = nameTouched ? name : suggestName(idea);
  const nameCheck = ProjectNameSchema.safeParse(shownName);
  const claudeMissing = health.data
    ? !(health.data.claude.found && health.data.claude.loggedIn)
    : false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameCheck.success || !idea.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await startProject({
        name: nameCheck.data,
        idea: idea.trim(),
        ...(parent ? { parentDir: parent } : {}),
      });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (fromIdea) void removeIdea(fromIdea).catch(() => undefined);
      setStage(id, 'plan');
      setDraft(id, planPrompt(idea));
      void navigate(`/p/${encodeURIComponent(id)}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not create the project.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar
        crumbs={[{ label: 'Projects', href: '/' }, { label: 'New project' }]}
        status={<Pill tone="neutral">New</Pill>}
      />
      <main className={styles.centre}>
        <form className={styles.card} onSubmit={(e) => void submit(e)} aria-labelledby="new-title">
          <div className={styles.cardHead}>
            <h1 id="new-title">What are we building?</h1>
            <p className={styles.lead}>
              A name and a paragraph is enough. The project opens in Plan, where you and Claude work
              out the rest.
            </p>
          </div>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Idea</span>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={5}
                placeholder="A printable QR code that opens a business's Google review page."
                autoFocus
              />
            </label>
            <label className={styles.field}>
              <span>Folder name</span>
              <div className={styles.nameRow}>
                <span className={styles.prefix} title={projectsDir}>
                  {projectsDir}
                </span>
                <input
                  value={shownName}
                  onChange={(e) => {
                    setNameTouched(true);
                    setName(e.target.value);
                  }}
                  placeholder="review-qr"
                  spellCheck={false}
                  aria-invalid={shownName.length > 0 && !nameCheck.success}
                />
              </div>
              {shownName && !nameCheck.success ? (
                <span className={styles.bad}>{nameCheck.error.issues[0]?.message}</span>
              ) : (
                <span className={styles.hint}>Lower case, digits and dashes.</span>
              )}
            </label>
            <button
              type="button"
              className={styles.change}
              aria-expanded={picking}
              onClick={() => setPicking(!picking)}
            >
              {picking ? 'Done' : 'Change where it is created'}
            </button>
            {picking && (
              <FolderPicker
                value={parent ?? config.data?.resolvedProjectsDir ?? '~'}
                onChange={setParent}
                label="Create the project in"
                missingNote="This folder does not exist yet. Cherry will create it."
                emptyNote="No folders inside."
              />
            )}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.foot}>
            <span className={styles.muted}>Nothing is written outside this folder.</span>
            <button
              type="submit"
              className="btn btn-primary btn-md"
              disabled={busy || !nameCheck.success || !idea.trim() || claudeMissing}
              title={claudeMissing ? 'Connect Claude Code first' : undefined}
            >
              {busy ? 'Creating…' : 'Start planning'}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
