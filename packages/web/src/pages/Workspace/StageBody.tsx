import type { WorkspaceStage } from '@cherry/shared';
import { ChatTab } from './ChatTab.tsx';
import { PlanStage } from './plan/PlanStage.tsx';
import { DesignStage } from './design/DesignStage.tsx';
import styles from './Workspace.module.css';

/** The open stage's own layout (ADR-0045). */
export function StageBody({
  projectId,
  stage,
  now,
  onOpenFile,
}: {
  projectId: string;
  stage: WorkspaceStage;
  now: number;
  onOpenFile(path: string): void;
}) {
  if (stage === 'plan')
    return <PlanStage projectId={projectId} now={now} onOpenFile={onOpenFile} />;
  if (stage === 'design')
    return <DesignStage projectId={projectId} now={now} onOpenFile={onOpenFile} />;
  return (
    <div className={styles.centre}>
      <ChatTab projectId={projectId} stage={stage} now={now} onOpenFile={onOpenFile} />
    </div>
  );
}
