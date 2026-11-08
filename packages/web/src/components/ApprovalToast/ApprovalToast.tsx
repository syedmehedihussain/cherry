import { ShieldAlert } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { STAGES, type Approval, type ChatState, type Stage } from '@cherry/shared';
import { answerApproval, chatKey, useLiveApprovals, usePendingApprovals } from '../../api/chat.ts';
import { queryClient } from '../../api/queries.ts';
import styles from './ApprovalToast.module.css';

/** Approvals that arrive while you look at something else (W-14). */
export function ApprovalToasts() {
  useLiveApprovals();
  const approvals = usePendingApprovals();
  const location = useLocation();
  const navigate = useNavigate();
  const visible = (approvals.data ?? []).filter((a) => {
    const chatPath = `/p/${encodeURIComponent(a.projectId)}`;
    // A push approval sits in the GitHub box, which every workspace tab shows.
    if (a.kind === 'push' && location.pathname.startsWith(chatPath)) return false;
    // The card is already in the stage room in view (finding R2-5).
    const room = roomOf(a);
    if (room && location.pathname.replace(/\/$/, '') === `${chatPath}/s/${room}`) return false;
    return !(location.pathname === chatPath || location.pathname === `${chatPath}/`);
  });
  if (visible.length === 0) return null;
  return (
    <div className={styles.stack} role="region" aria-label="Approvals waiting">
      {visible.slice(-3).map((a) => (
        <div key={a.id} className={styles.toast} role="alert">
          <div className={styles.head}>
            <ShieldAlert size={13} strokeWidth={2} aria-hidden="true" className={styles.icon} />
            <span className={styles.title}>
              {a.title} <span className={styles.project}>· {a.projectId}</span>
            </span>
          </div>
          <code className={styles.what}>
            {a.command ?? a.files.map((f) => f.path).join(', ') ?? a.tool}
          </code>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const room = roomOf(a);
                const target = a.source.startsWith('agent:')
                  ? `/p/${encodeURIComponent(a.projectId)}/agents?agent=${a.source.slice(6)}`
                  : `/p/${encodeURIComponent(a.projectId)}${room ? `/s/${room}` : ''}`;
                void navigate(target);
              }}
            >
              Review
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void answerApproval(a.id, { answer: 'deny' })}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The stage whose chat asked for this approval, from the chats already loaded. */
function roomOf(a: Approval): Stage | null {
  if (!a.source.startsWith('chat:')) return null;
  const conversation = a.source.slice(5);
  for (const stage of STAGES) {
    const chat = queryClient.getQueryData<ChatState>(chatKey(a.projectId, stage));
    if (chat?.conversationId === conversation) return stage;
  }
  return null;
}
