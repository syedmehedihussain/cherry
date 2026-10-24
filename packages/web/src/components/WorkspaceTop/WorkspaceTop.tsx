import { ChevronsUpDown, Search, Settings } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProjects } from '../../api/queries.ts';
import { useSocketStatus } from '../../api/socket.ts';
import { CherryBadge, Wordmark } from '../Brand/Brand.tsx';
import { Pill } from '../Pill/Pill.tsx';
import styles from './WorkspaceTop.module.css';

interface WorkspaceTopProps {
  projectId: string;
  projectName: string;
  /** The stage tabs, in the centre. */
  stages?: ReactNode;
  /** Before the search: the Autopilot button (ADR-0046). */
  actions?: ReactNode;
  onSearch(): void;
}

/** The V3 top bar (ADR-0045): brand, project switcher, the four stages, search, settings. */
export function WorkspaceTop({
  projectId,
  projectName,
  stages,
  actions,
  onSearch,
}: WorkspaceTopProps) {
  const socketStatus = useSocketStatus((s) => s.status);
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Link to="/" className={styles.home} aria-label="Cherry home">
          <CherryBadge size={24} />
          <span className={styles.wordmark}>
            <Wordmark height={14} />
          </span>
        </Link>
        <span className={styles.slash} aria-hidden="true">
          /
        </span>
        <ProjectSwitcher projectId={projectId} name={projectName} />
        {socketStatus === 'reconnecting' && (
          <Pill tone="warning" dot>
            Reconnecting…
          </Pill>
        )}
      </div>
      <div className={styles.centre}>{stages}</div>
      <div className={styles.right}>
        {actions}
        <button type="button" className={styles.search} onClick={onSearch}>
          <Search size={13} aria-hidden="true" />
          <span className={styles.searchText}>Search or run a command</span>
          <kbd className={styles.kbd}>Ctrl K</kbd>
        </button>
        <Link to="/settings/general" className={styles.icon} aria-label="Settings">
          <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

/** The project name; a click lists the other projects, like a breadcrumb that switches. */
function ProjectSwitcher({ projectId, name }: { projectId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const projects = useProjects();
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const cards = (projects.data?.cards ?? []).filter((c) => !c.missing);
  return (
    <div className={styles.switchWrap} ref={wrap}>
      <button
        type="button"
        className={styles.project}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Project ${name}. Switch project`}
        onClick={() => setOpen(!open)}
      >
        <span aria-current="page">{name}</span>
        <ChevronsUpDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Projects">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitemradio"
              aria-checked={c.id === projectId}
              onClick={() => {
                setOpen(false);
                void navigate(`/p/${encodeURIComponent(c.id)}`);
              }}
            >
              <span className={styles.menuName}>{c.name}</span>
              <span className={styles.menuMeta}>{c.summary}</span>
            </button>
          ))}
          <hr />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void navigate('/');
            }}
          >
            <span className={styles.menuName}>All projects</span>
          </button>
        </div>
      )}
    </div>
  );
}
