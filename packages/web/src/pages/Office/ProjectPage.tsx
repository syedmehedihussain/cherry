import { NavLink, useParams } from 'react-router';
import { useState } from 'react';
import { OfficeStageSchema, type OfficeStage } from '@cherry/shared';
import { SignOffDialog } from '../../components/SetUpOffice/SignOffDialog.tsx';
import { useOffice, useLiveOffice } from '../../api/office.ts';
import { useProjects } from '../../api/queries.ts';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { Workspace } from '../Workspace/Workspace.tsx';
import { StagesTab } from './Office.tsx';
import { InvoicePrint, PrintView } from './PrintView.tsx';
import { Invoice } from './Invoice.tsx';
import { StageRoom } from './StageRoom.tsx';
import { ChangeDialog } from './Changes.tsx';
import { CodeTab } from './CodeTab.tsx';
import { Maintenance } from './Maintenance.tsx';
import { Meeting } from './Meeting.tsx';
import { LiveMoment } from './LiveMoment.tsx';
import { Usage } from './Usage.tsx';
import { Vault } from './Vault.tsx';
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
  const [changing, setChanging] = useState(false);
  if (office.isPending) return <div className={styles.loading} aria-busy="true" />;
  if (!office.data) return <Workspace />;
  const splat = params['*'] ?? '';
  // /p/:id/print/:stage, the client documents to save as PDF (ADR-0058).
  if (splat === 'print/invoice') return <PrintPage id={id} stage={null} />;
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
          onChange={() => setChanging(true)}
        />
        {changing && (
          <ChangeDialog
            projectId={id}
            stage={room.data}
            office={office.data}
            onClose={() => setChanging(false)}
          />
        )}
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
  // /p/:id/docs[/<path>], the Docs tab with a document open (o14).
  const doc = /^docs(?:\/(.+))?$/.exec(splat);
  if (doc) return <OfficeShell id={id} tab="docs" doc={doc[1] ?? null} />;
  // /p/:id/code[/files/<path>|/term/<id>], the Code tab (o15).
  const code = /^code(?:\/(.+))?$/.exec(splat);
  if (code) return <OfficeShell id={id} tab="code" doc={code[1] ?? ''} />;
  return (
    <OfficeShell
      id={id}
      tab={
        splat === 'meeting' ||
        splat === 'vc' ||
        splat === 'usage' ||
        splat === 'invoice' ||
        splat === 'stages' ||
        splat === 'maintenance'
          ? splat
          : 'home'
      }
    />
  );
}

function OfficeShell({
  id,
  tab,
  doc = null,
}: {
  id: string;
  /** `stages` is the cards even when Live; the bare page is Maintenance once Live (o19). */
  tab: 'home' | 'stages' | 'maintenance' | 'meeting' | 'docs' | 'code' | 'vc' | 'usage' | 'invoice';
  /** The open document (Docs) or the rest of the path (Code). */
  doc?: string | null;
}) {
  const office = useOffice(id).data!;
  const card = useProjects().data?.cards.find((c) => c.id === id);
  const name = card?.name ?? id;
  // Live: the last cycle went live, so the page is the maintenance office. While a new version
  // is built (o20), the page shows its stages and Maintenance is its own tab.
  const anyLive = !!office.cycles.find((c) => c.liveAt);
  const live = !!office.cycles[office.cycles.length - 1]!.liveAt;
  const tabs: [string, string][] = [
    ['', live ? 'Maintenance' : 'Stages'],
    ...(anyLive && !live ? ([['/maintenance', 'Maintenance']] as [string, string][]) : []),
    ['/meeting', 'Meeting'],
    ['/docs', 'Docs'],
    ['/code', 'Code'],
    ['/vc', 'Version control'],
    ['/usage', 'Claude usage'],
    ['/invoice', office.kind === 'personal' ? 'Costs' : 'Invoice'],
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
                end={path === ''}
                className={({ isActive }) => (isActive ? styles.on : undefined)}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        }
      />
      {live && (
        <LiveMoment
          projectId={id}
          name={name}
          version={office.cycles[office.cycles.length - 1]!.version}
        />
      )}
      <main className={styles.main} data-tab={tab}>
        {tab === 'meeting' ? (
          <Meeting projectId={id} name={name} office={office} />
        ) : tab === 'docs' ? (
          <Vault projectId={id} open={doc} />
        ) : tab === 'code' ? (
          <CodeTab projectId={id} rest={doc ?? ''} />
        ) : tab === 'vc' ? (
          <VersionControl projectId={id} />
        ) : tab === 'usage' ? (
          <Usage projectId={id} office={office} />
        ) : tab === 'invoice' ? (
          <Invoice projectId={id} office={office} />
        ) : (tab === 'home' && live) || tab === 'maintenance' ? (
          <Maintenance projectId={id} name={name} office={office} />
        ) : (
          <StagesTab projectId={id} name={name} office={office} />
        )}
      </main>
    </div>
  );
}

function PrintPage({ id, stage }: { id: string; stage: OfficeStage | null }) {
  const office = useOffice(id).data!;
  const name = useProjects().data?.cards.find((c) => c.id === id)?.name ?? id;
  return stage ? (
    <PrintView projectId={id} name={name} stage={stage} office={office} />
  ) : (
    <InvoicePrint projectId={id} name={name} office={office} />
  );
}
