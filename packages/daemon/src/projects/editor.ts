import { spawn } from 'node:child_process';
import path from 'node:path';
import { run } from '../exec.ts';

/**
 * Opens a file in VS Code if present. Without it, opens the file's folder, never the file itself:
 * the desktop default handler could run a .desktop, .command or .jar file from an untrusted repo.
 */
export async function openInEditor(file: string): Promise<'code' | 'xdg-open' | 'open'> {
  const hasCode = (await run('code', ['--version'], { timeoutMs: 5000 })).ok;
  const [cmd, args] = hasCode
    ? (['code', ['-g', file]] as const)
    : process.platform === 'darwin'
      ? (['open', ['-R', file]] as const)
      : (['xdg-open', [path.dirname(file)]] as const);
  const child = spawn(cmd, [...args], { detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  child.unref();
  return cmd;
}
