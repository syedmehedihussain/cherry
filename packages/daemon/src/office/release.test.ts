import { describe, expect, it, vi } from 'vitest';
import { isPublishCommand, releaseGuard, releaseTool } from './release.ts';

// V4 section 4: nothing leaves the computer from Deployment without the release card.
describe('release card', () => {
  it.each([
    ['gh repo create iub/course --public --source .', true],
    ['git push -u origin main', true],
    ['cd site && npx netlify deploy --prod', true],
    ['vercel --prod', true],
    ['npm publish', true],
    ['git status', false],
    ['gh repo view', false],
    ['npm run build', false],
  ])('%s → publish %s', (cmd, yes) => expect(isPublishCommand(cmd)).toBe(yes));

  it('refuses publish commands until approved', () => {
    let ok = false;
    const guard = releaseGuard(() => ok);
    expect(guard('Bash', { command: 'git push' })).toMatch(/confirm_release/);
    expect(guard('Bash', { command: 'npm test' })).toBeNull();
    expect(guard('Write', { file_path: 'x' })).toBeNull();
    ok = true;
    expect(guard('Bash', { command: 'git push' })).toBeNull();
  });

  const args = {
    owner: 'smh',
    repo: 'iub-course',
    visibility: 'public',
    what: 'the course site',
    where: 'https://smh.github.io/iub-course',
  };

  it('shows owner, visibility and where on the card; Publish approves', async () => {
    const ask = vi.fn<(card: unknown) => Promise<{ ok: true; text: string }>>(async () => ({
      ok: true,
      text: 'User chose: Publish',
    }));
    const approved = vi.fn();
    const r = await releaseTool(ask, approved).handler(args);
    expect(ask.mock.calls[0]![0]).toMatchObject({
      question: 'Release to smh/iub-course (public)?',
      context: 'The course site. Goes live at https://smh.github.io/iub-course.',
    });
    expect(approved).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ ok: true, text: expect.stringMatching(/^Approved/) });
  });

  it('Not now approves nothing', async () => {
    const approved = vi.fn();
    const r = await releaseTool(
      async () => ({ ok: true, text: 'User chose: Not now' }),
      approved,
    ).handler(args);
    expect(approved).not.toHaveBeenCalled();
    expect(r.text).toMatch(/not now/);
  });
});
