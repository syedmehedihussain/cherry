import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const E2E_ROOT = path.join(tmpdir(), 'cherry-e2e');
export const E2E_HOME = path.join(E2E_ROOT, 'home');
export const E2E_PROJECTS = path.join(E2E_ROOT, 'projects');
export const E2E_DAEMON_PORT = 4318;
export const E2E_WEB_PORT = 5174;

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function git(dir: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', ...args], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
  });
}

/** Projects in each state, all in Cherry's list (docs/testing.md E2E flow 1). */
export function createFixture(): void {
  rmSync(E2E_ROOT, { recursive: true, force: true });
  write(
    path.join(E2E_HOME, 'config.json'),
    JSON.stringify({
      schema: 1,
      projectsDir: E2E_PROJECTS,
      // Cherry lists only these (ADR-0032); a folder in projectsDir alone is not a project.
      projects: ['core', 'cctop', 'torongo', 'atlas', 'shop'].map((id) => ({
        id,
        path: path.join(E2E_PROJECTS, id),
      })),
    }),
  );

  const core = path.join(E2E_PROJECTS, 'core');
  write(
    path.join(core, '_project', 'project.json'),
    JSON.stringify({
      schema: 1,
      name: 'core',
      summary: 'Local personal dashboard',
      phase: 'development',
      stack: ['Next.js', 'SQLite'],
    }),
  );
  write(
    path.join(core, '_project', 'STATUS.md'),
    '## Where we left off\nFinished the HUD.\n\n## Next steps\n- [ ] Build the Study Room floor\n',
  );
  write(path.join(core, 'README.md'), '# core\n');
  write(path.join(core, 'lib', 'streaks.ts'), 'export const streaks = 1;\n');
  mkdirSync(core, { recursive: true });
  git(core, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(core, '.git', 'info', 'exclude'), '_project/\n');
  git(core, 'add', '-A');
  git(core, 'commit', '-q', '-m', 'init');
  write(path.join(core, 'lib', 'streaks.ts'), 'export const streaks = 2;\n');

  // Only the editor e2e touches this file (cctop has no git, so no change counts move).
  write(path.join(E2E_PROJECTS, 'cctop', 'edit-me.txt'), 'one\n');
  write(
    path.join(E2E_PROJECTS, 'cctop', '_project', 'STATUS.md'),
    '---\nsummary: Terminal dashboard\n---\n## Next steps\n- [ ] Tag release 1.1\n',
  );
  // Something the Run button can start: prints a local address and stays up until stopped.
  write(
    path.join(E2E_PROJECTS, 'cctop', 'package.json'),
    JSON.stringify({ scripts: { dev: 'node server.js' }, dependencies: { express: '^5' } }),
  );
  write(
    path.join(E2E_PROJECTS, 'cctop', 'server.js'),
    "console.log('ready on http://localhost:4998/');\nsetInterval(() => {}, 1000);\n",
  );
  mkdirSync(path.join(E2E_PROJECTS, 'cctop', 'node_modules'), { recursive: true });
  write(path.join(E2E_PROJECTS, 'torongo', 'README.md'), '# torongo\nReal-time translation.\n');
  // In the new projects folder but never opened: Home must not list it (ADR-0032).
  write(path.join(E2E_PROJECTS, 'stray', 'README.md'), '# stray\n');

  // A Ready project with a local "remote" and one commit to push (M6).
  const atlas = path.join(E2E_PROJECTS, 'atlas');
  const remote = path.join(E2E_ROOT, 'remotes', 'atlas.git');
  mkdirSync(remote, { recursive: true });
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  write(
    path.join(atlas, '_project', 'project.json'),
    JSON.stringify({ schema: 1, name: 'atlas', summary: 'API server', phase: 'preparation' }),
  );
  write(path.join(atlas, 'README.md'), '# atlas\n');
  git(atlas, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(atlas, '.git', 'info', 'exclude'), '_project/\n');
  git(atlas, 'add', '-A');
  git(atlas, 'commit', '-q', '-m', 'init');
  git(atlas, 'remote', 'add', 'origin', remote);
  git(atlas, 'push', '-q', '-u', 'origin', 'main');
  write(path.join(atlas, 'src', 'server.ts'), 'export {};\n');
  git(atlas, 'add', '-A');
  git(atlas, 'commit', '-q', '-m', 'feat: server skeleton');

  // A Ready project with changes to commit as the user (GitHub view → Ready to commit).
  const shop = path.join(E2E_PROJECTS, 'shop');
  write(
    path.join(shop, '_project', 'project.json'),
    JSON.stringify({ schema: 1, name: 'shop', summary: 'Small web shop', phase: 'development' }),
  );
  write(path.join(shop, 'src', 'hero.ts'), 'export const hero = 1;\n');
  git(shop, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(shop, '.git', 'info', 'exclude'), '_project/\n');
  git(shop, 'config', 'user.name', 'E2E User');
  git(shop, 'config', 'user.email', 'e2e-user@example.com');
  git(shop, 'add', '-A');
  git(shop, 'commit', '-q', '-m', 'feat: first');
  write(path.join(shop, 'src', 'hero.ts'), 'export const hero = 2;\n');
}

export const E2E_REMOTES = path.join(E2E_ROOT, 'remotes');

export async function loginCode(): Promise<string> {
  const info = JSON.parse(readFileSync(path.join(E2E_HOME, 'run', 'daemon.json'), 'utf8')) as {
    cliSecret: string;
  };
  const res = await fetch(`http://127.0.0.1:${E2E_DAEMON_PORT}/api/cli/login-code`, {
    method: 'POST',
    headers: { 'x-cherry-cli': info.cliSecret },
  });
  return ((await res.json()) as { code: string }).code;
}

/** Opens a side view from the right rail (ADR-0045) and returns its panel. */
export async function openSide(
  page: import('@playwright/test').Page,
  name: 'Overview' | 'Live' | 'GitHub' | 'Chat',
) {
  const rail = page.getByRole('navigation', { name: 'Side views' });
  const button = rail.getByRole('button', { name, exact: true });
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  return page.getByRole('complementary', { name });
}

/** Runs an action or opens a view from the command palette (Ctrl K, ADR-0045). */
export async function runCommand(page: import('@playwright/test').Page, label: string | RegExp) {
  // The workspace listens for Ctrl K once it is on screen.
  await page.getByRole('navigation', { name: 'Lifecycle stages' }).waitFor();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette
    .getByRole('combobox')
    .fill(typeof label === 'string' ? label : label.source.replace(/[\\^$]/g, ''));
  await palette.getByRole('option', { name: label }).first().click();
}
