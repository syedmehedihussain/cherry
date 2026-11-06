import { useNavigate } from 'react-router';
import { useLiveChat } from '../../api/chat.ts';
import { useLiveProject } from '../../api/workspace.ts';
import { useNow } from '../../lib/useNow.ts';
import { DevStage } from '../Workspace/dev/DevStage.tsx';
import type { ActiveTab } from '../Workspace/dev/devTabs.ts';

/**
 * The Code tab (V4 o15): the explorer, Monaco file tabs and real terminals, like VS Code and
 * nothing else. `/p/:id/code`, `/code/files/<path>`, `/code/term/<id>`. Secret files stay blocked.
 */
export function CodeTab({ projectId, rest }: { projectId: string; rest: string }) {
  const navigate = useNavigate();
  const now = useNow(60_000);
  useLiveProject(projectId);
  useLiveChat(projectId);
  const file = /^files\/(.+)$/.exec(rest)?.[1];
  const term = /^term\/(.+)$/.exec(rest)?.[1];
  const active: ActiveTab = file
    ? { kind: 'file', path: file }
    : term
      ? { kind: 'term', id: term }
      : { kind: 'claude' };
  const base = `/p/${encodeURIComponent(projectId)}/code`;
  return (
    <DevStage
      projectId={projectId}
      now={now}
      active={active}
      editorOnly
      onShow={(t) =>
        void navigate(
          t.kind === 'file'
            ? `${base}/files/${t.path}`
            : t.kind === 'term'
              ? `${base}/term/${t.id}`
              : base,
        )
      }
    />
  );
}
