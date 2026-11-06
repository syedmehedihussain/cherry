import { useEffect } from 'react';
import { OFFICE_STAGE_LABEL, type OfficeFile, type OfficeStage } from '@cherry/shared';
import { useStageDocs } from '../../api/office.ts';
import { useFile } from '../../api/workspace.ts';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import styles from './PrintView.module.css';

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/**
 * `/p/:id/print/:stage` (ADR-0058): the stage's client documents on a white page, then the print
 * dialog, where the user saves a PDF for the client. Nothing leaves the machine.
 */
export function PrintView({
  projectId,
  name,
  stage,
  office,
}: {
  projectId: string;
  name: string;
  stage: OfficeStage;
  office: OfficeFile;
}) {
  const docs = useStageDocs(projectId, stage).data;
  const client = docs?.client ?? [];
  const ready = !!docs;
  useEffect(() => {
    if (!ready || !client.length) return;
    // Give the documents a moment to render before the dialog.
    const t = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(t);
  }, [ready, client.length]);
  const cycle = office.cycles[office.cycles.length - 1]!;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{name}</h1>
        <p>
          {OFFICE_STAGE_LABEL[stage]}
          {office.client ? ` · for ${office.client.name}` : ''} · version {cycle.version} ·{' '}
          {new Date().toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>
      {ready && !client.length && (
        <p className={styles.none}>
          This stage has no client documents yet (docs/{stage}/client/).
        </p>
      )}
      {client.map((d) => (
        <PrintDoc key={d.path} projectId={projectId} path={d.path} />
      ))}
    </div>
  );
}

function PrintDoc({ projectId, path }: { projectId: string; path: string }) {
  const file = useFile(projectId, path).data;
  if (!file) return null;
  return (
    <article className={styles.doc}>
      <Markdown source={file.content.replace(FRONTMATTER, '')} docPath={path} />
    </article>
  );
}
