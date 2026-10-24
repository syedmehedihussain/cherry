import { useMemo } from 'react';
import type { WorkspaceStage } from '@cherry/shared';
import { useChat } from '../../api/chat.ts';
import { useProjectDetail } from '../../api/workspace.ts';
import { FileTree } from '../../components/FileTree/FileTree.tsx';
import { tildify } from '../../lib/paths.ts';
import { ChatTab } from './ChatTab.tsx';
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
  const card = useProjectDetail(projectId).data?.card;
  const chat = useChat(projectId, stage);
  const touched = useMemo(() => new Set(chat.data?.touched ?? []), [chat.data?.touched]);
  if (stage === 'development')
    return (
      <div className={styles.dev}>
        <FileTree
          projectId={projectId}
          projectPath={card ? tildify(card.path) : ''}
          selected={null}
          onOpen={onOpenFile}
          touched={touched}
          stage={stage}
        />
        <div className={styles.centre}>
          <ChatTab projectId={projectId} stage={stage} now={now} onOpenFile={onOpenFile} />
        </div>
      </div>
    );
  return (
    <div className={styles.centre}>
      <ChatTab projectId={projectId} stage={stage} now={now} onOpenFile={onOpenFile} />
    </div>
  );
}
