import { NavLink, useParams } from 'react-router';
import { useOffice, useLiveOffice } from '../../api/office.ts';
import { useProjects } from '../../api/queries.ts';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { Workspace } from '../Workspace/Workspace.tsx';
import { StagesTab } from './Office.tsx';
import styles from './ProjectPage.module.css';

/**
 * `/p/:id/*` (V4 o6): the project page when the project has an office; the V3 workspace with
 * its views when it does not (set up the office from the Projects page).
 */
export function ProjectPage() {
  const id = useParams().id ?? '';
  const office = useOffice(id);
  useLiveOffice(id);
  if (office.isPending) return <div className={styles.loading} aria-busy="true" />;
  if (!office.data) return <Workspace />;
  return <OfficeShell id={id} />;
}

function OfficeShell({ id }: { id: string }) {
  const office = useOffice(id).data!;
  const card = useProjects().data?.cards.find((c) => c.id === id);
  const name = card?.name ?? id;
  const live = !!office.cycles.find((c) => c.liveAt) && office.cycles.length === 1;
  const tabs: [string, string][] = [['', live ? 'Maintenance' : 'Stages']];
  return (
    <div className={styles.page}>
      <TopBar
        crumbs={[{ label: 'Projects', href: '/' }, { label: name }]}
        centre={
          <nav className={styles.tabs} aria-label="Project">
            {tabs.map(([path, label]) => (
              <NavLink
                key={label}
                to={`/p/${encodeURIComponent(id)}${path}`}
                end
                className={({ isActive }) => (isActive ? styles.on : undefined)}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        }
      />
      <main className={styles.main}>
        <StagesTab projectId={id} name={name} office={office} />
      </main>
    </div>
  );
}
