import { describe, expect, it } from 'vitest';
import { contrast, grade } from './contrast.ts';

describe('contrast', () => {
  it('matches WCAG for black and white', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('#ffffff', '#000000')).toBe(21);
  });
  it('grades body text', () => {
    expect(grade(contrast('#767676', '#ffffff'))).toBe('AA');
    expect(grade(3.2)).toBe('AA large');
    expect(grade(2)).toBe('Fail');
    expect(grade(7.1)).toBe('AAA');
  });
});
