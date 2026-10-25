import {
  Hand,
  Maximize,
  MessageCircle,
  Monitor,
  Moon,
  MousePointer2,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DesignScreen } from '@cherry/shared';
import { fitZoom, frameDoc, SIZES, type Device, type PickMessage } from './frame.ts';
import styles from './Canvas.module.css';

type Tool = 'select' | 'hand' | 'comment';
const GAP = 48;
const LABEL = 28;

export interface CanvasComment {
  screen: DesignScreen;
  selector: string;
  text: string;
}

/**
 * The Design canvas (V3 r7, artboard 02): every screen in design/screens/ as an artboard in a
 * sandboxed frame. Pan, zoom and fit; click a screen to focus it, double-click to open it
 * large; the comment tool picks an element and sends it to the chat.
 */
export function Canvas({
  screens,
  focus,
  onFocus,
  onComment,
  actions,
}: {
  screens: DesignScreen[];
  focus: string | null;
  onFocus(path: string | null): void;
  /** Sends a comment on an element to the Designer. */
  onComment(c: CanvasComment & { note: string }): Promise<void>;
  /** Top right: Export, Approve design (r9). */
  actions?: ReactNode;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [device, setDevice] = useState<Device>('phone');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [view, setView] = useState({ x: 64, y: 64, zoom: 0.56 });
  const fitted = useRef<string | null>(null);
  const [large, setLarge] = useState<string | null>(null);
  const [pick, setPick] = useState<
    (CanvasComment & { x: number; y: number; fx: number; fy: number }) | null
  >(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [pins, setPins] = useState<{ path: string; fx: number; fy: number; n: number }[]>([]);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [space, setSpace] = useState(false);
  const size = SIZES[device];

  const fit = useCallback(() => {
    const el = area.current;
    if (!el) return;
    const box = { w: el.clientWidth, h: el.clientHeight };
    // Room at the top for the floating tools and the artboard labels.
    const zoom = fitZoom(screens.length, size, { w: box.w, h: box.h - 56 }, GAP);
    const w = screens.length * size.w + (screens.length - 1) * GAP;
    setView({
      zoom,
      x: Math.max(32, (box.w - w * zoom) / 2),
      y: Math.max(96, (box.h + 56 - (size.h + LABEL) * zoom) / 2),
    });
  }, [screens.length, size]);

  // Fit when the screens or the device change.
  const fitKey = `${screens.length}:${device}`;
  useLayoutEffect(() => {
    if (fitted.current === fitKey) return;
    const id = requestAnimationFrame(() => {
      fitted.current = fitKey;
      fit();
    });
    return () => cancelAnimationFrame(id);
  }, [fitKey, fit]);

  // Tell each frame whether the comment tool is on.
  useEffect(() => {
    for (const f of frames.current.values())
      f.contentWindow?.postMessage({ type: 'cherry:mode', comment: tool === 'comment' }, '*');
  }, [tool, screens, theme, device, large]);

  // A pick from a frame: the comment box opens next to it.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as PickMessage | null;
      if (!d || d.type !== 'cherry:pick') return;
      const entry = [...frames.current.entries()].find(([, f]) => f.contentWindow === e.source);
      const screen = entry && screens.find((s) => s.path === entry[0]);
      const frame = entry?.[1];
      if (!screen || !frame || !area.current) return;
      const fr = frame.getBoundingClientRect();
      const ar = area.current.getBoundingClientRect();
      const scale = fr.width / frame.offsetWidth || 1;
      setNote('');
      setPick({
        screen,
        selector: d.selector,
        text: d.text,
        x: Math.min(fr.left - ar.left + (d.x + d.w) * scale + 8, ar.width - 300),
        y: Math.max(8, fr.top - ar.top + d.y * scale),
        fx: d.x + d.w,
        fy: d.y,
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [screens]);

  // Space held: pan, as in design tools.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code === 'Space' && !t.closest('input, textarea, [contenteditable]')) setSpace(true);
      if (e.key === 'Escape') {
        setPick(null);
        setLarge(null);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const zoom = Math.min(2, Math.max(0.1, v.zoom * factor));
      const el = area.current;
      const px = cx ?? (el ? el.clientWidth / 2 : 0);
      const py = cy ?? (el ? el.clientHeight / 2 : 0);
      return {
        zoom,
        x: px - ((px - v.x) * zoom) / v.zoom,
        y: py - ((py - v.y) * zoom) / v.zoom,
      };
    });

  // Ctrl+wheel zooms at the pointer; the wheel alone pans. Not passive, to stop page zoom.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey)
        zoomAt(Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const panning = tool === 'hand' || space;
  const send = async () => {
    if (!pick || !note.trim()) return;
    setSending(true);
    try {
      await onComment({ ...pick, note: note.trim() });
      setPins((p) => [...p, { path: pick.screen.path, fx: pick.fx, fy: pick.fy, n: p.length + 1 }]);
      setPick(null);
    } finally {
      setSending(false);
    }
  };
  const largeScreen = useMemo(() => screens.find((s) => s.path === large), [screens, large]);
  const doc = useCallback((s: DesignScreen) => frameDoc(s.html, theme), [theme]);

  return (
    <div
      className={styles.canvas}
      ref={area}
      data-tool={panning ? 'hand' : tool}
      aria-label="Design canvas"
      role="region"
      onPointerDown={(e) => {
        const onBackground = e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg;
        if (!(panning || e.button === 1 || onBackground)) return;
        if (onBackground && !panning && e.button === 0) onFocus(null);
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <div className={styles.bar} role="toolbar" aria-label="Canvas tools">
        <div className={styles.seg}>
          <ToolBtn on={tool === 'select'} label="Select" onClick={() => setTool('select')}>
            <MousePointer2 size={14} />
          </ToolBtn>
          <ToolBtn on={tool === 'hand'} label="Pan (or hold Space)" onClick={() => setTool('hand')}>
            <Hand size={14} />
          </ToolBtn>
          <ToolBtn
            on={tool === 'comment'}
            label="Comment on an element"
            onClick={() => setTool(tool === 'comment' ? 'select' : 'comment')}
          >
            <MessageCircle size={14} />
          </ToolBtn>
        </div>
        <span className={styles.sep} />
        <div className={styles.seg}>
          <button
            type="button"
            aria-pressed={device === 'phone'}
            onClick={() => setDevice('phone')}
          >
            <Smartphone size={13} aria-hidden="true" />
            Phone
          </button>
          <button
            type="button"
            aria-pressed={device === 'desktop'}
            onClick={() => setDevice('desktop')}
          >
            <Monitor size={13} aria-hidden="true" />
            Desktop
          </button>
        </div>
        <div className={styles.seg}>
          <ToolBtn on={theme === 'dark'} label="Dark" onClick={() => setTheme('dark')}>
            <Moon size={13} />
          </ToolBtn>
          <ToolBtn on={theme === 'light'} label="Light" onClick={() => setTheme('light')}>
            <Sun size={13} />
          </ToolBtn>
        </div>
        <span className={styles.sep} />
        <button
          type="button"
          className={styles.zoom}
          aria-label="Zoom to 100%"
          title="Zoom out (Ctrl + wheel), click for 100%"
          onClick={() => zoomAt(1 / view.zoom)}
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <ToolBtn label="Fit all screens" onClick={fit}>
          <Maximize size={14} />
        </ToolBtn>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}

      <div
        className={styles.world}
        data-bg="1"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {screens.map((s, i) => (
          <div
            key={s.path}
            className={styles.board}
            style={{ left: i * (size.w + GAP), width: size.w }}
            data-focus={focus === s.path || undefined}
          >
            <div className={styles.boardLabel} style={{ fontSize: 13 / Math.max(view.zoom, 0.4) }}>
              <span className={styles.boardTitle}>{s.title}</span>
              <span className={styles.boardFile}>{s.path.split('/').pop()}</span>
            </div>
            <div className={styles.frameBox} style={{ width: size.w, height: size.h }}>
              <iframe
                ref={(el) => {
                  if (el) frames.current.set(s.path, el);
                  else frames.current.delete(s.path);
                }}
                title={`Screen ${s.title}`}
                sandbox="allow-scripts"
                srcDoc={doc(s)}
                className={styles.frame}
                onLoad={(e) =>
                  e.currentTarget.contentWindow?.postMessage(
                    { type: 'cherry:mode', comment: tool === 'comment' },
                    '*',
                  )
                }
              />
              {pins
                .filter((p) => p.path === s.path)
                .map((p) => (
                  <span
                    key={p.n}
                    className={styles.pin}
                    style={{
                      left: p.fx - 10,
                      top: p.fy - 10,
                      transform: `scale(${1 / view.zoom})`,
                    }}
                    aria-hidden="true"
                  >
                    {p.n}
                  </span>
                ))}
              {tool !== 'comment' && (
                <button
                  type="button"
                  className={styles.cover}
                  aria-label={`Focus ${s.title}. Double-click to open it large`}
                  onClick={() => !panning && onFocus(s.path)}
                  onDoubleClick={() => !panning && setLarge(s.path)}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {screens.length === 0 && (
        <p className={styles.empty}>
          No screens yet. Ask the Designer to draw the first one; every file in{' '}
          <code>design/screens/</code> shows here.
        </p>
      )}

      {pick && (
        <form
          className={styles.comment}
          style={{ left: Math.max(8, pick.x), top: pick.y }}
          aria-label="Comment"
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className={styles.commentHead}>
            <span className={styles.commentWhere}>
              {pick.screen.title} › <code>{pick.selector}</code>
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Close the comment"
              onClick={() => setPick(null)}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
          <textarea
            aria-label="Comment for the Designer"
            placeholder="What should change here?"
            autoFocus
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className={styles.commentFoot}>
            <span>Enter sends it to the chat</span>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={sending || !note.trim()}
            >
              Send to chat
            </button>
          </div>
        </form>
      )}

      {largeScreen && (
        <div className={styles.large} role="dialog" aria-label={`${largeScreen.title}, large`}>
          <div className={styles.largeHead}>
            <span>{largeScreen.title}</span>
            <span className={styles.boardFile}>{largeScreen.path}</span>
            <span className={styles.grow} />
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Close the large view"
              onClick={() => setLarge(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <iframe
            ref={(el) => {
              if (el) frames.current.set(largeScreen.path, el);
            }}
            title={`Screen ${largeScreen.title}, large`}
            sandbox="allow-scripts"
            srcDoc={doc(largeScreen)}
            className={styles.largeFrame}
            style={{ width: size.w, maxWidth: '100%' }}
          />
        </div>
      )}

      <div className={styles.foot}>
        {screens.length} screen{screens.length === 1 ? '' : 's'} <span>design/screens/</span>
      </div>
    </div>
  );
}

function ToolBtn({
  on,
  label,
  onClick,
  children,
}: {
  on?: boolean;
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={styles.tool}
    >
      {children}
    </button>
  );
}
