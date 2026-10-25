import { randomUUID } from 'node:crypto';
import { spawn, type IPty } from 'node-pty';
import type { TerminalInfo, TerminalServerMessage } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import { conflict, notFound } from '../http.ts';
import { projectDir } from '../projects/workspace.ts';

/** Kept output, so a tab that reconnects (a reload, a tab switch) sees what came before. */
const SCROLLBACK = 256_000;
/** Shells per project, so a runaway loop cannot fill the machine. */
const MAX_PER_PROJECT = 8;

interface Term {
  info: TerminalInfo;
  pty: IPty | null;
  buffer: string;
  listeners: Set<(m: TerminalServerMessage) => void>;
}

/**
 * Terminal tabs in Development (V3 r6, ADR-0049): a real shell in the project folder through
 * node-pty. The daemon owns each shell; browsers attach and detach over a WebSocket.
 */
export class TerminalService {
  private terms = new Map<string, Term>();
  private n = new Map<string, number>();

  constructor(
    private readonly config: ConfigStore,
    private readonly shell = process.env.SHELL || '/bin/bash',
  ) {}

  list(projectId: string): TerminalInfo[] {
    return [...this.terms.values()]
      .filter((t) => t.info.projectId === projectId)
      .map((t) => t.info);
  }

  create(projectId: string, cols: number, rows: number): TerminalInfo {
    const cwd = projectDir(this.config.projectsDir(), projectId);
    if (this.list(projectId).length >= MAX_PER_PROJECT)
      throw conflict(`At most ${MAX_PER_PROJECT} terminals per project. Close one first.`);
    const id = `t_${randomUUID().slice(0, 8)}`;
    const count = (this.n.get(projectId) ?? 0) + 1;
    this.n.set(projectId, count);
    const pty = spawn(this.shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', CHERRY_TERMINAL: '1' },
    });
    const term: Term = {
      info: {
        id,
        projectId,
        title: count === 1 ? 'Terminal' : `Terminal ${count}`,
        alive: true,
        exitCode: null,
        createdAt: Date.now(),
      },
      pty,
      buffer: '',
      listeners: new Set(),
    };
    pty.onData((d) => {
      term.buffer = (term.buffer + d).slice(-SCROLLBACK);
      for (const l of term.listeners) l({ t: 'out', d });
    });
    pty.onExit(({ exitCode }) => {
      term.pty = null;
      term.info = { ...term.info, alive: false, exitCode };
      for (const l of term.listeners) l({ t: 'exit', code: exitCode });
    });
    this.terms.set(id, term);
    return term.info;
  }

  private get(projectId: string, id: string): Term {
    const t = this.terms.get(id);
    if (!t || t.info.projectId !== projectId) throw notFound('No such terminal');
    return t;
  }

  /** Attaches a browser: sends the kept output, then live output. Returns detach. */
  attach(projectId: string, id: string, send: (m: TerminalServerMessage) => void): () => void {
    const t = this.get(projectId, id);
    if (t.buffer) send({ t: 'out', d: t.buffer });
    if (!t.info.alive) send({ t: 'exit', code: t.info.exitCode });
    t.listeners.add(send);
    return () => t.listeners.delete(send);
  }

  write(projectId: string, id: string, data: string): void {
    this.get(projectId, id).pty?.write(data);
  }

  resize(projectId: string, id: string, cols: number, rows: number): void {
    try {
      this.get(projectId, id).pty?.resize(cols, rows);
    } catch {
      // The shell exited between the check and the call.
    }
  }

  close(projectId: string, id: string): void {
    const t = this.get(projectId, id);
    t.pty?.kill();
    t.listeners.clear();
    this.terms.delete(id);
  }

  stopAll(): void {
    for (const t of this.terms.values()) t.pty?.kill();
    this.terms.clear();
  }
}
