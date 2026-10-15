import { Lightbulb, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { relativeTime, type Idea } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { addIdea, removeIdea, updateIdea, useIdeas } from '../../api/ideas.ts';
import styles from './Ideas.module.css';

/** Where Start opens the survey: the idea's text, a folder name and the idea to remove after. */
export function startHref(idea: Idea): string {
  const text = idea.description ? `${idea.name}: ${idea.description}` : idea.name;
  return `/new?${new URLSearchParams({ idea: text, name: idea.name, from: idea.id }).toString()}`;
}

/** Upcoming projects on Home (ADR-0027): ideas saved for later, started with one click. */
export function Ideas({ now, disabled }: { now: number; disabled?: boolean }) {
  const ideas = useIdeas();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const list = ideas.data ?? [];

  return (
    <section aria-labelledby="upcoming" className={styles.section}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h2 id="upcoming">Upcoming</h2>
          <span className={styles.meta}>Ideas to start when you have time</span>
        </div>
        {!adding && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
          >
            <Plus size={14} aria-hidden="true" />
            Add idea
          </button>
        )}
      </div>

      {adding && <IdeaForm onDone={() => setAdding(false)} />}

      {ideas.isError && <p className={styles.error}>Could not load ideas: {ideas.error.message}</p>}
      {ideas.isSuccess && list.length === 0 && !adding && (
        <p className={styles.empty}>
          <Lightbulb size={14} aria-hidden="true" />
          Have a project in mind? Add its name and a few lines, and start it from here later.
        </p>
      )}
      {list.length > 0 && (
        <ul className={styles.list} aria-label="Project ideas">
          {list.map((idea) =>
            editing === idea.id ? (
              <li key={idea.id}>
                <IdeaForm idea={idea} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <IdeaRow
                key={idea.id}
                idea={idea}
                now={now}
                disabled={disabled}
                onEdit={() => {
                  setEditing(idea.id);
                  setAdding(false);
                }}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function IdeaRow({
  idea,
  now,
  disabled,
  onEdit,
}: {
  idea: Idea;
  now: number;
  disabled?: boolean;
  onEdit(): void;
}) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    try {
      await removeIdea(idea.id);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not remove it.');
    }
  };

  return (
    <li className={styles.item} aria-label={idea.name}>
      <div className={styles.body}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{idea.name}</span>
          <span className={styles.when}>added {relativeTime(Date.parse(idea.createdAt), now)}</span>
        </div>
        {idea.description && <p className={styles.description}>{idea.description}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
      <div className={styles.actions}>
        {confirm ? (
          <>
            <span className={styles.ask}>Remove this idea?</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()}>
              Remove
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={disabled}
              title={disabled ? 'Connect Claude Code first' : 'Opens the new project survey'}
              onClick={() => void navigate(startHref(idea))}
            >
              <Rocket size={13} aria-hidden="true" />
              Start
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label={`Edit ${idea.name}`}
              onClick={onEdit}
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label={`Remove ${idea.name}`}
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function IdeaForm({ idea, onDone }: { idea?: Idea; onDone(): void }) {
  const [name, setName] = useState(idea?.name ?? '');
  const [description, setDescription] = useState(idea?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (idea) await updateIdea(idea.id, { name, description });
      else await addIdea({ name, description });
      onDone();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => void submit(e)}
      aria-label={idea ? `Edit ${idea.name}` : 'New idea'}
    >
      <input
        className="input"
        aria-label="Idea name"
        placeholder="Name, e.g. Recipe planner"
        maxLength={80}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className={styles.textarea}
        aria-label="Description"
        placeholder="What is it, who is it for, anything you already know (optional)"
        rows={3}
        maxLength={4000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formActions}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
          {idea ? 'Save' : 'Add idea'}
        </button>
      </div>
    </form>
  );
}
