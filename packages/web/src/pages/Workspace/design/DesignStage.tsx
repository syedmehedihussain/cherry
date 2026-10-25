import { useCallback, useMemo, useState } from 'react';
import { sendChat } from '../../../api/chat.ts';
import { useDesignScreens } from '../../../api/design.ts';
import { useProjectDetail } from '../../../api/workspace.ts';
import { BriefPanel } from './BriefPanel.tsx';
import { ChatTab, readMode } from '../ChatTab.tsx';
import { Canvas, type CanvasComment } from './Canvas.tsx';
import styles from './DesignStage.module.css';

/** The comment as the Designer reads it (its AGENT.md knows this form). */
export function commentMessage(c: CanvasComment & { note: string }): string {
  const what = c.text ? ` ("${c.text.slice(0, 40)}")` : '';
  return `Comment on ${c.screen.path}, element \`${c.selector}\`${what}:\n${c.note}`;
}

/**
 * Design (V3 r7, artboard 02): Claude Design in Cherry. The canvas in the centre shows the
 * screens the Designer writes; the Designer's chat is on the right.
 */
export function DesignStage({
  projectId,
  now,
  onOpenFile,
}: {
  projectId: string;
  now: number;
  onOpenFile(path: string): void;
}) {
  const data = useDesignScreens(projectId).data;
  const screens = useMemo(() => data ?? [], [data]);
  const [focus, setFocus] = useState<string | null>(null);
  const card = useProjectDetail(projectId).data?.card;
  const openFile = useCallback(
    (path: string) => {
      // A screen the Designer wrote: show it on the canvas, not in the editor.
      if (screens.some((s) => s.path === path)) setFocus(path);
      else onOpenFile(path);
    },
    [screens, onOpenFile],
  );
  return (
    <div className={styles.design}>
      <BriefPanel projectId={projectId} idea={card?.summary || card?.name || projectId} />
      <Canvas
        screens={screens}
        focus={focus}
        onFocus={setFocus}
        onComment={async (c) => {
          await sendChat(projectId, 'design', commentMessage(c), readMode(projectId, 'design'));
        }}
      />
      <div className={styles.chat}>
        <ChatTab projectId={projectId} stage="design" now={now} onOpenFile={openFile} />
      </div>
    </div>
  );
}
