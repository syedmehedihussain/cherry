import { RotateCcw } from 'lucide-react';
import { STAGES, STAGE_LABEL, type Stage } from '@cherry/shared';
import { useChat } from '../../api/chat.ts';
import { stageInfo, useStageInfo } from '../../api/stages.ts';
import styles from './StageTabs.module.css';

interface StageTabsProps {
  projectId: string;
  active: Stage;
  onSelect(stage: Stage): void;
}

/**
 * The lifecycle stages in the workspace top bar (ADR-0034). Each opens its own agent's chat;
 * the arrow after Issues says the loop goes back to Plan.
 */
export function StageTabs({ projectId, active, onSelect }: StageTabsProps) {
  const info = useStageInfo().data;
  return (
    <nav aria-label="Lifecycle stages" className={styles.stages}>
      {STAGES.map((stage) => (
        <StageTab
          key={stage}
          projectId={projectId}
          stage={stage}
          active={stage === active}
          agent={stageInfo(info, stage)?.name}
          onSelect={onSelect}
        />
      ))}
      <span className={styles.loop} title="Issues feed the next Plan" aria-hidden="true">
        <RotateCcw size={12} strokeWidth={1.8} />
      </span>
    </nav>
  );
}

function StageTab({
  projectId,
  stage,
  active,
  agent,
  onSelect,
}: {
  projectId: string;
  stage: Stage;
  active: boolean;
  agent: string | undefined;
  onSelect(stage: Stage): void;
}) {
  const running = !!useChat(projectId, stage).data?.running;
  return (
    <button
      type="button"
      className={styles.tab}
      aria-pressed={active}
      data-running={running || undefined}
      title={
        agent ? `${STAGE_LABEL[stage]}: the ${agent}${running ? ' (working)' : ''}` : undefined
      }
      onClick={() => onSelect(stage)}
    >
      {running && <span className={styles.dot} aria-label="working" />}
      {STAGE_LABEL[stage]}
    </button>
  );
}
