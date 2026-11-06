import { Plus, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ProjectCard } from '@cherry/shared';
import { recheckHealth, useHealth, useProjects } from '../../api/queries.ts';
import { ClaudeMissingBanner } from '../../components/Banner/Banner.tsx';
import { Ideas } from '../../components/Ideas/Ideas.tsx';
import { MagnetAvatar } from '../../components/MagnetAvatar/MagnetAvatar.tsx';
import { OfficeTable } from '../../components/OfficeTable/OfficeTable.tsx';
import { OpenFolderButton } from '../../components/OpenFolder/OpenFolder.tsx';
import { Shutdown } from '../../components/Shutdown/Shutdown.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { useNow } from '../../lib/useNow.ts';
import styles from './Home.module.css';

export function greeting(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The Projects page (V4 o5): client projects and personal projects, each with its stage and a
 * small track of the seven stages; folders without an office below, with Set up office.
 */
export function Home() {
  const projects = useProjects();
  const health = useHealth();
  const now = useNow(60_000);
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(false);

  const cards = useMemo(() => projects.data?.cards ?? [], [projects.data]);
  const claudeMissing = health.data
    ? !(health.data.claude.found && health.data.claude.loggedIn)
    : false;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      [c.name, c.summary, c.office?.client ?? '', ...c.stack].some((s) =>
        s.toLowerCase().includes(q),
      ),
    );
  }, [cards, query]);
  const group = (pred: (c: ProjectCard) => boolean) => filtered.filter(pred);
  const client = group((c) => c.office?.kind === 'client');
  const personal = group((c) => c.office?.kind === 'personal');
  const none = group((c) => !c.office);
  const empty = projects.isSuccess && cards.length === 0;

  const checkAgain = async () => {
    setChecking(true);
    try {
      await recheckHealth();
    } finally {
      setChecking(false);
    }
  };
  const newProject = (
    <Link
      to="/new"
      className="btn btn-primary btn-lg"
      aria-disabled={claudeMissing}
      title={claudeMissing ? 'Connect Claude Code first' : undefined}
      onClick={(e) => claudeMissing && e.preventDefault()}
    >
      <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
      New project
    </Link>
  );

  return (
    <div className={styles.page}>
      <TopBar crumbs={[{ label: 'Projects' }]} />
      {claudeMissing && (
        <ClaudeMissingBanner onCheckAgain={() => void checkAgain()} checking={checking} />
      )}
      <main className={styles.main}>
        <header className={styles.head}>
          <div className={styles.hello}>
            <h1 className={styles.title}>{greeting(new Date(now).getHours())}</h1>
            <p className={styles.lead}>
              {cards.length
                ? `${cards.length} project${cards.length === 1 ? '' : 's'}. Open one to see its stages and staff.`
                : 'Start a project, or open a folder you already have.'}
            </p>
          </div>
          <div className={styles.cta}>
            <OpenFolderButton />
            {newProject}
          </div>
        </header>

        {empty ? (
          <section aria-label="Projects" className={styles.empty}>
            <span className={styles.emptyIcon}>
              <MagnetAvatar size={48} display={38} />
            </span>
            <div className={styles.emptyText}>
              <h2>No projects yet</h2>
              <p>
                A new project starts in Idea, with the Business Analyst. Only the projects you open
                or create show here.
              </p>
            </div>
          </section>
        ) : (
          <>
            {cards.length > 0 && (
              <label className={styles.search}>
                <Search size={14} strokeWidth={1.8} aria-hidden="true" />
                <span className="sr-only">Search projects</span>
                <input
                  placeholder="Search projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
            {projects.isPending && <span className="shimmer" style={{ height: 120 }} />}
            {client.length > 0 && (
              <Section title="Client projects">
                <OfficeTable cards={client} kind="client" now={now} />
              </Section>
            )}
            {personal.length > 0 && (
              <Section title="Personal projects" meta="Same stages; you sign off yourself.">
                <OfficeTable cards={personal} kind="personal" now={now} />
              </Section>
            )}
            {none.length > 0 && (
              <Section
                title="Not in the office yet"
                meta="Set up the office to work through the stages. Your files stay as they are."
              >
                <OfficeTable cards={none} kind="none" now={now} />
              </Section>
            )}
            {projects.isSuccess && query && filtered.length === 0 && (
              <p className={styles.noMatch}>No project matches “{query}”.</p>
            )}
          </>
        )}
        <Ideas now={now} disabled={claudeMissing} />
        <p className={styles.note}>
          <ShieldCheck size={14} aria-hidden="true" />
          Agents only work when you give them a job. Nothing runs in the background.
        </p>
        <Shutdown />
      </main>
    </div>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}
