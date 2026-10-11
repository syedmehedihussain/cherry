import { describe, expect, it } from 'vitest';
import { parseStatus } from './StatusTab.tsx';

describe('parseStatus', () => {
  it('reads front matter and ## sections', () => {
    const p = parseStatus(
      '---\nname: core\nstatus: active          # active | paused\nsummary: A game\n---\n\n## Where we left off\n\nWe fixed the HUD.\n\n## Next steps\n\n- [ ] Add sound\n',
    );
    expect(p.fields).toMatchObject({ name: 'core', status: 'active', summary: 'A game' });
    expect(p.sections).toEqual([
      { title: 'Where we left off', body: 'We fixed the HUD.' },
      { title: 'Next steps', body: '- [ ] Add sound' },
    ]);
  });

  it('works without front matter', () => {
    expect(parseStatus('# STATUS\n\n## Next steps\n- [ ] One').sections[0]?.title).toBe(
      'Next steps',
    );
  });
});
