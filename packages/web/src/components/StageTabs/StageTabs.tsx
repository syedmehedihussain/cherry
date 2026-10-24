import { Check } from 'lucide-react';
import { STAGE_LABEL, WORKSPACE_STAGES, type WorkspaceStage } from '@cherry/shared';
import { useChat } from '../../api/chat.ts';
import { stageInfo, useStageInfo, useStageProgress } from '../../api/stages.ts';
import styles from './StageTabs.module.css';

interface StageTabsProps {
  projectId: string;
  active: WorkspaceStage;
  onSelect(stage: WorkspaceStage): void;
}

/**
 * The four stages in the top bar (ADR-0045): a number, the name, and the stage's progress as a
 * thin line under it (ADR-0040). Any stage opens at any time.
 */
export function StageTabs({ projectId, active, onSelect }: StageTabsProps) {
  const info = useStageInfo().data;
  return (
    <nav aria-label="Lifecycle stages" className={styles.stages}>
      {WORKSPACE_STAGES.map((stage, i) => (
        <StageTab
          key={stage}
          n={i + 1}
          projectId={projectId}
          stage={stage}
          active={stage === active}
          agent={stageInfo(info, stage)?.name}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function StageTab({
  n,
  projectId,
  stage,
  active,
  agent,
  onSelect,
}: {
  n: number;
  projectId: string;
  stage: WorkspaceStage;
  active: boolean;
  agent: string | undefined;
  onSelect(stage: WorkspaceStage): void;
}) {
  const running = !!useChat(projectId, stage).data?.running;
  const progress = useStageProgress(projectId, stage);
  const percent = progress?.total ? progress.percent : 0;
  const done = !!progress?.total && percent === 100;
  return (
    <button
      type="button"
      className={styles.tab}
      aria-pressed={active}
      data-running={running || undefined}
      data-done={done || undefined}
      title={
        agent
          ? `${STAGE_LABEL[stage]}: the ${agent}${running ? ' (working)' : ''}${progress?.total ? `, ${percent}% done` : ''}`
          : undefined
      }
      onClick={() => onSelect(stage)}
    >
      <span className={styles.n} aria-hidden="true">
        0{n}
      </span>
      {STAGE_LABEL[stage]}
      {done && <Check size={13} strokeWidth={2.25} className={styles.check} aria-label="done" />}
      {running && <span className={styles.dot} aria-label="working" />}
      <span className={styles.track} aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </span>
    </button>
  );
}
