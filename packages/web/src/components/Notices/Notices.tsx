import { Bell, CheckCircle2, CircleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { Notice } from '@cherry/shared';
import { usePendingApprovals } from '../../api/chat.ts';
import { socket } from '../../api/socket.ts';
import { desktopNotify, notifyState, turnOnNotifications } from '../../lib/desktopNotify.ts';
import styles from './Notices.module.css';

type Shown = Notice & { id: number };

const TOAST_MS = 8000;
const FAILED = new Set<Notice['kind']>([
  'agent.failed',
  'scan.failed',
  'chat.failed',
  'issue.failed',
  'test.failed',
  'autopilot.failed',
]);

const hidden = () => document.hidden || !document.hasFocus();

/**
 * Work that ended or needs you: a toast while you look, a desktop notification while you
 * don't, and a count in the tab title until you come back.
 */
export function Notices() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  }, [pathname]);
  const [toasts, setToasts] = useState<Shown[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [canAsk, setCanAsk] = useState(() => notifyState() === 'ask');
  const pending = usePendingApprovals().data;
  const seenApprovals = useRef(new Set<string>());

  useEffect(() => {
    let next = 0;
    const unsub = socket.subscribe('notices');
    const off = socket.on((event) => {
      if (event.type !== 'notice') return;
      const n: Notice = event;
      const away = hidden();
      // A chat reply on the chat you are looking at needs no word.
      const onChat = where.current.replace(/\/$/, '') === n.link;
      if (n.kind === 'chat.done' && onChat && !away) return;
      if (away) {
        setUnseen((u) => u + 1);
        desktopNotify(n.title, n.body, `${n.kind}:${n.link}`, () => void navigate(n.link));
      }
      const id = ++next;
      setToasts((t) => [...t.slice(-2), { ...n, id }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
    });
    const back = () => {
      if (!hidden()) setUnseen(0);
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      unsub();
      off();
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, [navigate]);

  // Approvals already have their own toast; tell the desktop when you are away.
  useEffect(() => {
    for (const a of pending ?? []) {
      if (seenApprovals.current.has(a.id)) continue;
      seenApprovals.current.add(a.id);
      if (!hidden()) continue;
      const link = a.source.startsWith('agent:')
        ? `/p/${encodeURIComponent(a.projectId)}/agents?agent=${a.source.slice(6)}`
        : `/p/${encodeURIComponent(a.projectId)}`;
      desktopNotify(
        `Needs your OK: ${a.title}`,
        `${a.projectId} · ${a.command ?? a.files.map((f) => f.path).join(', ')}`,
        `approval:${a.id}`,
        () => void navigate(link),
      );
    }
  }, [pending, navigate]);

  const count = unseen + (pending?.length ?? 0);
  useEffect(() => {
    document.title = count > 0 ? `(${count}) Cherry` : 'Cherry';
  }, [count]);

  if (toasts.length === 0) return null;
  return (
    <div className={styles.stack} role="region" aria-label="Notifications">
      {toasts.map((n) => {
        const Icon = FAILED.has(n.kind)
          ? CircleAlert
          : n.kind === 'decision.proposed'
            ? Bell
            : CheckCircle2;
        return (
          <div
            key={n.id}
            className={styles.toast}
            data-tone={FAILED.has(n.kind) ? 'failed' : undefined}
            role="status"
          >
            <div className={styles.head}>
              <Icon size={13} strokeWidth={2} aria-hidden="true" className={styles.icon} />
              <span className={styles.title}>{n.title}</span>
              <button
                type="button"
                className={styles.close}
                aria-label="Dismiss"
                onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
            <p className={styles.body}>
              <span className={styles.project}>{n.projectId}</span> · {n.body}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setToasts((t) => t.filter((x) => x.id !== n.id));
                  void navigate(n.link);
                }}
              >
                Open
              </button>
              {canAsk && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void turnOnNotifications().then((s) => setCanAsk(s === 'ask'))}
                >
                  Also notify me on the desktop
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
