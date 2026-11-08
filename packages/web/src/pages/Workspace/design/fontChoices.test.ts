import { describe, expect, it } from 'vitest';
import { fontChoices } from './BriefPanel.tsx';

// Finding #28: a short list first, search for the rest; never hundreds of options.
describe('fontChoices', () => {
  const all = ['Inter', 'Noto Sans', ...Array.from({ length: 300 }, (_, i) => `Noto Sans X${i}`)];
  it('offers Cherry fonts and common ones on this computer when empty', () => {
    expect(fontChoices(all, ['Geist', 'Geist Mono'], '')).toEqual([
      'Geist',
      'Geist Mono',
      'Inter',
      'Noto Sans',
    ]);
  });
  it('searches all fonts, at most 30', () => {
    expect(fontChoices(all, ['Geist'], 'noto')).toHaveLength(30);
    expect(fontChoices(all, ['Geist'], 'int')).toEqual(['Inter']);
  });
});
