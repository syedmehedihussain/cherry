import { describe, expect, it } from 'vitest';
import { run, serviceUnit } from './run.ts';

describe('cherry cli', () => {
  it('prints the version', async () => {
    expect(await run(['--version'])).toEqual({ code: 0, out: '1.1.0' });
  });

  it('prints help that lists the bare command as up', async () => {
    expect((await run(['--help'])).out).toContain('(none), up');
  });

  it('rejects unknown commands with help', async () => {
    const res = await run(['nope']);
    expect(res.code).toBe(2);
    expect(res.out).toContain('Usage: cherry');
  });

  it('asks for a project name with open', async () => {
    expect((await run(['open'])).code).toBe(2);
  });

  it('says so when the daemon is not running', async () => {
    process.env.CHERRY_HOME = '/nonexistent-cherry-home';
    expect(await run(['status'])).toEqual({
      code: 1,
      out: 'Cherry is not running. Start it with `cherry`.',
    });
    expect((await run(['down'])).out).toBe('Cherry is not running.');
    delete process.env.CHERRY_HOME;
  });

  it('lists the always-on commands in the help', async () => {
    const help = (await run(['--help'])).out;
    for (const cmd of ['start', 'stop', 'restart'])
      expect(help).toMatch(new RegExp(`^  ${cmd} `, 'm'));
  });

  it('writes a service that finds claude, rebuilds the UI first and starts at login', () => {
    const unit = serviceUnit({ PATH: '/home/u/.local/share/mise/shims:/usr/bin' });
    expect(unit).toContain('Environment="PATH=/home/u/.local/share/mise/shims:/usr/bin"');
    expect(unit).toMatch(/^ExecStartPre=.*cli\/src\/index\.ts build-ui$/m);
    expect(unit).toMatch(/^ExecStart=.*daemon\/src\/main\.ts$/m);
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain('WantedBy=default.target');
  });
});
