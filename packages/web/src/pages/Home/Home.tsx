import { ArrowDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { recheckHealth, useHealth, useProjects } from '../../api/queries.ts';
import { ClaudeMissingBanner } from '../../components/Banner/Banner.tsx';
import { Wordmark } from '../../components/Brand/Brand.tsx';
import { Ideas } from '../../components/Ideas/Ideas.tsx';
import { MagnetAvatar } from '../../components/MagnetAvatar/MagnetAvatar.tsx';
import { OpenFolderButton } from '../../components/OpenFolder/OpenFolder.tsx';
import { ProjectCard, ProjectCardSkeleton } from '../../components/ProjectCard/ProjectCard.tsx';
import { ProjectTable } from '../../components/ProjectTable/ProjectTable.tsx';
import { PromptBox } from '../../components/PromptBox/PromptBox.tsx';
import { Shutdown } from '../../components/Shutdown/Shutdown.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { useNow } from '../../lib/useNow.ts';
import { useUi } from '../../state/ui.ts';
import styles from './Home.module.css';

type Sort = 'last' | 'name';

export function Home() {
  const projects = useProjects();
  const health = useHealth();
  const navigate = useNavigate();
  const openMagnet = useUi((s) => s.openMagnet);
  const now = useNow(60_000);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('last');
  const [checking, setChecking] = useState(false);
  const [idea, setIdea] = useState('');

  const cards = useMemo(() => projects.data?.cards ?? [], [projects.data]);
  const claudeMissing = health.data
    ? !(health.data.claude.found && health.data.claude.loggedIn)
    : false;
  const recent = cards.filter((c) => !c.missing).slice(0, 4);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? cards.filter((c) =>
          [c.name, c.summary, ...c.stack].some((s) => s.toLowerCase().includes(q)),
        )
      : cards;
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  }, [cards, query, sort]);
  const empty = projects.isSuccess && cards.length === 0;

  const checkAgain = async () => {
    setChecking(true);
    try {
      await recheckHealth();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar crumbs={[]} />
      {claudeMissing && (
        <ClaudeMissingBanner onCheckAgain={() => void checkAgain()} checking={checking} />
      )}
      <main className={styles.main}>
        <section aria-label="Start" className={styles.start}>
          <div className={styles.hello}>
            <span className={styles.brand}>
              <Wordmark height={44} centred />
            </span>
            <h1 className={styles.title}>What are we building?</h1>
          </div>
          <PromptBox
            disabled={claudeMissing}
            calibratable={cards.filter((c) => c.state !== 'ready' && !c.draft)}
            onNewProject={(idea) => void navigate(`/new?idea=${encodeURIComponent(idea)}`)}
            onAskMagnet={(text) => openMagnet(text)}
            onCalibrate={(id) => void navigate(`/p/${encodeURIComponent(id)}/calibrate`)}
            onIdeaChange={setIdea}
          />
          {!empty && (
            <div className={styles.cta}>
              <Link
                to={idea ? `/new?idea=${encodeURIComponent(idea)}` : '/new'}
                className="btn btn-primary btn-lg"
                aria-disabled={claudeMissing}
                title={claudeMissing ? 'Connect Claude Code first' : undefined}
                onClick={(e) => claudeMissing && e.preventDefault()}
              >
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Start project
              </Link>
              <OpenFolderButton />
              <span className={styles.hint}>
                A short survey first. Claude drafts the plan before any code.
              </span>
            </div>
          )}
        </section>

        {empty ? (
          <section aria-label="Projects" className={styles.empty}>
            <span className={styles.emptyIcon}>
              <MagnetAvatar size={48} display={38} />
            </span>
            <div className={styles.emptyText}>
              <h2>No projects yet</h2>
              <p>
                Open a project folder from anywhere, like in VS Code, or start a new one. Only the
                projects you open or create show here.
              </p>
            </div>
            <div className={styles.emptyActions}>
              <Link
                to={idea ? `/new?idea=${encodeURIComponent(idea)}` : '/new'}
                className="btn btn-primary btn-lg"
                aria-disabled={claudeMissing}
                onClick={(e) => claudeMissing && e.preventDefault()}
              >
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Start project
              </Link>
              <OpenFolderButton />
            </div>
          </section>
        ) : null}
        {empty && <Ideas now={now} disabled={claudeMissing} />}
        {empty ? null : (
          <>
            <section aria-labelledby="recent" className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 id="recent">Recent</h2>
                <span className={styles.meta}>Last worked on</span>
              </div>
              <div className={styles.grid}>
                {projects.isPending
                  ? Array.from({ length: 4 }, (_, i) => <ProjectCardSkeleton key={i} />)
                  : recent.map((c) => <ProjectCard key={c.id} card={c} now={now} />)}
              </div>
            </section>

            <Ideas now={now} disabled={claudeMissing} />

            <section aria-labelledby="all" className={styles.section}>
              <div className={styles.sectionHead}>
                <div className={styles.titleRow}>
                  <h2 id="all">All projects</h2>
                  <span className={styles.meta}>
                    {cards.length} project{cards.length === 1 ? '' : 's'} in Cherry. Remove takes
                    one off the list; the folder stays on disk.
                  </span>
                </div>
                <div className={styles.tools}>
                  <button
                    type="button"
                    className={styles.sort}
                    onClick={() => setSort(sort === 'last' ? 'name' : 'last')}
                    aria-label={`Sorted by ${sort === 'last' ? 'last worked' : 'name'}. Change sort.`}
                  >
                    {sort === 'last' ? 'Last worked' : 'Name'}
                    <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <label className={styles.search}>
                    <Search size={14} strokeWidth={1.8} aria-hidden="true" />
                    <span className="sr-only">Search projects</span>
                    <input
                      placeholder="Search projects"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <ProjectTable cards={filtered} now={now} loading={projects.isPending} />
              {projects.isSuccess && filtered.length === 0 && (
                <p className={styles.noMatch}>No project matches “{query}”.</p>
              )}
            </section>
          </>
        )}
        <Shutdown />
      </main>
    </div>
  );
}
