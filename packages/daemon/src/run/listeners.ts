import { readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';

export interface Listener {
  port: number;
  pid: number;
  /** Process group: lets the Run service leave out the app it started itself. */
  pgid: number;
  /** The command line, shortened, for the tooltip. */
  command: string;
}

const LOCAL = new Set([
  '00000000', // 0.0.0.0
  '0100007F', // 127.0.0.1
  '00000000000000000000000000000000', // ::
  '00000000000000000000000001000000', // ::1
  '0000000000000000FFFF00000100007F', // ::ffff:127.0.0.1
]);

/** Inode → port of every local TCP socket in LISTEN state (Linux /proc/net/tcp and tcp6). */
function listeningSockets(): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 10 || f[3] !== '0A') continue; // 0A = LISTEN
      const [ip, portHex] = f[1]!.split(':');
      if (!LOCAL.has(ip!)) continue;
      out.set(f[9]!, parseInt(portHex!, 16));
    }
  }
  return out;
}

const inside = (dir: string, p: string) => p === dir || p.startsWith(dir + path.sep);

/**
 * Servers listening on a local port whose process runs from inside `dir`: a dev server Claude
 * started in a chat, or the user in a terminal. Reads /proc only (no tokens, nothing spawned);
 * returns [] where /proc is missing (macOS) or a process is not ours to read.
 */
export function projectListeners(dir: string): Listener[] {
  const sockets = listeningSockets();
  if (sockets.size === 0) return [];
  let root: string;
  try {
    root = realpathSync(dir);
  } catch {
    return [];
  }
  const found = new Map<number, Listener>();
  let pids: string[];
  try {
    pids = readdirSync('/proc').filter((n) => /^\d+$/.test(n));
  } catch {
    return [];
  }
  for (const pid of pids) {
    try {
      if (!inside(root, readlinkSync(`/proc/${pid}/cwd`))) continue;
      for (const fd of readdirSync(`/proc/${pid}/fd`)) {
        let link = '';
        try {
          link = readlinkSync(`/proc/${pid}/fd/${fd}`);
        } catch {
          continue;
        }
        const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1];
        const port = inode ? sockets.get(inode) : undefined;
        if (port === undefined || found.has(port)) continue;
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        const pgid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]);
        const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
          .split('\0')
          .filter(Boolean)
          .join(' ')
          .slice(0, 200);
        found.set(port, { port, pid: Number(pid), pgid, command });
      }
    } catch {
      // Gone, or another user's process.
    }
  }
  return [...found.values()].sort((a, b) => a.port - b.port);
}

/** True when something answers HTTP on the port (any status). Databases and sockets do not. */
export async function answersHttp(port: number, timeoutMs = 800): Promise<boolean> {
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      await fetch(`http://${host}:${port}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return true;
    } catch {
      // Try the other address.
    }
  }
  return false;
}
