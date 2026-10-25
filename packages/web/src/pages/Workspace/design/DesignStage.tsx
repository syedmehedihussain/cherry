import { Check, Download } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { sendChat, useChatDraft } from '../../../api/chat.ts';
import { ApiFailure } from '../../../api/client.ts';
import { useStages } from '../../../state/stage.ts';
import { approveDesign, exportUrl, useDesignScreens } from '../../../api/design.ts';
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
/** What the Builder is asked first, once the design is approved. */
export const BUILD_FROM_HANDOFF =
  'The design is approved. Read design/handoff/README.md, design/handoff/components.md and the screens in design/handoff/screens/, then the roadmap. Build the shared components first, then the first roadmap task, to match the screens. Use design/handoff/tokens.css.';

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
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStage = useStages((s) => s.set);
  const setDraft = useChatDraft((s) => s.set);
  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await approveDesign(projectId);
      setConfirm(false);
      setDraft(projectId, BUILD_FROM_HANDOFF);
      setStage(projectId, 'development');
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not write the handoff.');
    } finally {
      setBusy(false);
    }
  };
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
        actions={
          <>
            <a className={styles.export} href={exportUrl(projectId)} download>
              <Download size={13} aria-hidden="true" />
              Export
            </a>
            <button
              type="button"
              className={styles.approve}
              disabled={!screens.length}
              title={screens.length ? undefined : 'Draw a screen first'}
              onClick={() => setConfirm(true)}
            >
              <Check size={13} aria-hidden="true" />
              Approve design
            </button>
          </>
        }
        onComment={async (c) => {
          await sendChat(projectId, 'design', commentMessage(c), readMode(projectId, 'design'));
        }}
      />
      {confirm && (
        <div className={styles.scrim} onMouseDown={() => !busy && setConfirm(false)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-label="Approve design"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Approve the design?</h2>
            <p>
              Cherry writes the handoff for the Builder into <code>design/handoff/</code>:
            </p>
            <ul>
              <li>
                {screens.length} screen{screens.length === 1 ? '' : 's'}, each standalone (
                {screens.map((s) => s.title).join(', ')})
              </li>
              <li>
                <code>tokens.css</code>, <code>components.md</code> and <code>README.md</code>{' '}
                (notes for the Builder)
              </li>
            </ul>
            <p>Then Development opens with a first message for the Builder. Nothing is sent yet.</p>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.dialogFoot}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                autoFocus
                onClick={() => void approve()}
              >
                Approve and open Development
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={styles.chat}>
        <ChatTab projectId={projectId} stage="design" now={now} onOpenFile={openFile} />
      </div>
    </div>
  );
}
