import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import type { TerminalServerMessage } from '@cherry/shared';
import { terminalSocketUrl } from '../../api/terminals.ts';
import { useTheme } from '../../lib/theme.ts';
import styles from './TerminalView.module.css';

/** xterm's colours from the page's tokens, so every Cherry theme carries over. */
function xtermTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return {
    background: v('--code-bg-deep'),
    foreground: v('--t-code'),
    cursor: v('--t1'),
    cursorAccent: v('--code-bg-deep'),
    selectionBackground: v('--accent-fill'),
    black: v('--s3'),
    red: v('--danger'),
    green: v('--success'),
    yellow: v('--warning'),
    blue: v('--accent'),
    magenta: v('--edited'),
    cyan: v('--ft-go'),
    white: v('--t2'),
    brightBlack: v('--t3'),
    brightRed: v('--danger-text'),
    brightGreen: v('--diff-add-text'),
    brightYellow: v('--ft-js'),
    brightBlue: v('--accent-text'),
    brightMagenta: v('--ft-css'),
    brightCyan: v('--ft-md'),
    brightWhite: v('--t1'),
  };
}

/**
 * A terminal tab (V3 r6, ADR-0049): xterm.js attached to a shell the daemon runs in the
 * project folder. It stays mounted while hidden, so switching tabs keeps its screen.
 */
export default function TerminalView({
  projectId,
  id,
  title,
  active,
}: {
  projectId: string;
  id: string;
  title: string;
  active: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const [state, setState] = useState<'connecting' | 'open' | 'exited' | 'lost'>('connecting');
  const theme = useTheme();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const t = new Terminal({
      fontFamily: css.getPropertyValue('--mono').trim(),
      fontSize: 12.5,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: xtermTheme(),
      allowProposedApi: false,
    });
    // Cherry's own keys reach Cherry, not the shell: Ctrl+K (palette), Ctrl+B (side view).
    t.attachCustomKeyEventHandler(
      (e) => !((e.ctrlKey || e.metaKey) && !e.altKey && /^[kb]$/i.test(e.key)),
    );
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(el);
    term.current = t;
    fit.current = f;
    const ws = new WebSocket(terminalSocketUrl(projectId, id));
    socket.current = ws;
    const send = (m: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    };
    ws.onopen = () => {
      setState('open');
      try {
        f.fit();
      } catch {
        // Hidden: it fits when it shows.
      }
      send({ t: 'resize', cols: t.cols, rows: t.rows });
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as TerminalServerMessage;
      if (m.t === 'out') t.write(m.d);
      else {
        t.write(`\r\n\x1b[2m[The shell ended with code ${m.code ?? '?'}]\x1b[0m\r\n`);
        setState('exited');
      }
    };
    ws.onclose = () => setState((s) => (s === 'exited' ? s : 'lost'));
    const input = t.onData((d) => send({ t: 'in', d }));
    const resize = t.onResize(({ cols, rows }) => send({ t: 'resize', cols, rows }));
    const ro = new ResizeObserver(() => {
      if (el.offsetParent === null) return;
      try {
        f.fit();
      } catch {
        // Not laid out yet.
      }
    });
    ro.observe(el);
    void document.fonts?.ready.then(() => {
      if (el.offsetParent !== null) f.fit();
    });
    return () => {
      ro.disconnect();
      input.dispose();
      resize.dispose();
      ws.close();
      t.dispose();
      term.current = null;
    };
  }, [projectId, id]);

  // A theme change repaints the terminal.
  useEffect(() => {
    if (term.current) term.current.options.theme = xtermTheme();
  }, [theme]);

  // Shown again: fit to the space and take the keyboard.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => {
      try {
        fit.current?.fit();
      } catch {
        // Not laid out yet.
      }
      term.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <section className={styles.wrap} aria-label={title}>
      <div className={styles.screen} ref={box} data-testid="terminal-screen" />
      {state === 'lost' && (
        <p className={styles.note} role="status">
          The connection to this terminal ended. Close the tab and open a new one.
        </p>
      )}
    </section>
  );
}
