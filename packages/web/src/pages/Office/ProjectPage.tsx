import { NavLink, useParams } from 'react-router';
import { useState } from 'react';
import { OfficeStageSchema, type OfficeStage } from '@cherry/shared';
import { SignOffDialog } from '../../components/SetUpOffice/SignOffDialog.tsx';
import { useOffice, useLiveOffice } from '../../api/office.ts';
import { useProjects } from '../../api/queries.ts';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { Workspace } from '../Workspace/Workspace.tsx';
import { StagesTab } from './Office.tsx';
import { PrintView } from './PrintView.tsx';
import { StageRoom } from './StageRoom.tsx';
import { Usage } from './Usage.tsx';
import { VersionControl } from './VersionControl.tsx';
import styles from './ProjectPage.module.css';

/**
 * `/p/:id/*` (V4 o6): the project page when the project has an office; the V3 workspace with
 * its views when it does not (set up the office from the Projects page).
 */
export function ProjectPage() {
  const params = useParams();
  const id = params.id ?? '';
  const office = useOffice(id);
  useLiveOffice(id);
  const [signing, setSigning] = useState(false);
  if (office.isPending) return <div className={styles.loading} aria-busy="true" />;
  if (!office.data) return <Workspace />;
  const splat = params['*'] ?? '';
  // /p/:id/print/:stage, the client documents to save as PDF (ADR-0058).
  const print = OfficeStageSchema.safeParse(/^print\/([a-z]+)$/.exec(splat)?.[1]);
  if (print.success) return <PrintPage id={id} stage={print.data} />;
  // /p/:id/s/:stage, a stage room (o7); /vc after it, its Version control tab (o11).
  const roomMatch = /^s\/([a-z]+)(?:\/(vc|usage))?$/.exec(splat);
  const room = OfficeStageSchema.safeParse(roomMatch?.[1]);
  if (room.success)
    return (
      <div className={styles.page}>
        <StageRoom
          projectId={id}
          stage={room.data}
          office={office.data}
          view={(roomMatch?.[2] as 'vc' | 'usage' | undefined) ?? 'work'}
          onSignOff={() => setSigning(true)}
        />
        {signing && (
          <SignOffDialog
            projectId={id}
            stage={room.data}
            office={office.data}
            onClose={() => setSigning(false)}
          />
        )}
      </div>
    );
  return <OfficeShell id={id} tab={splat === 'vc' || splat === 'usage' ? splat : 'stages'} />;
}

function OfficeShell({ id, tab }: { id: string; tab: 'stages' | 'vc' | 'usage' }) {
  const office = useOffice(id).data!;
  const card = useProjects().data?.cards.find((c) => c.id === id);
  const name = card?.name ?? id;
  const live = !!office.cycles.find((c) => c.liveAt) && office.cycles.length === 1;
  const tabs: [string, string][] = [
    ['', live ? 'Maintenance' : 'Stages'],
    ['/vc', 'Version control'],
    ['/usage', 'Claude usage'],
  ];
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
      <main className={styles.main} data-tab={tab}>
        {tab === 'vc' ? (
          <VersionControl projectId={id} />
        ) : tab === 'usage' ? (
          <Usage projectId={id} office={office} />
        ) : (
          <StagesTab projectId={id} name={name} office={office} />
        )}
      </main>
    </div>
  );
}

function PrintPage({ id, stage }: { id: string; stage: OfficeStage }) {
  const office = useOffice(id).data!;
  const name = useProjects().data?.cards.find((c) => c.id === id)?.name ?? id;
  return <PrintView projectId={id} name={name} stage={stage} office={office} />;
}
