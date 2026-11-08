import { describe, expect, it } from 'vitest';
import { tokenColours } from './tokens.ts';

describe('tokenColours', () => {
  it('reads the Brief colours from the light :root, by common names', () => {
    const css = `/* --text: #000000 in a comment */
:root {
  --paper: #fbf7ee;   /* page */
  --surface: #ffffff;
  --ink: #1d2130;
  --ink-2: #4f5566;
  --accent: #c2410c;
  --outline: var(--ink);
}
@media (prefers-color-scheme: dark) { :root { --surface: #16181f; } }`;
    expect(tokenColours(css)).toEqual({
      accent: '#C2410C',
      surface: '#FFFFFF',
      text: '#1D2130',
      muted: '#4F5566',
    });
  });

  it('expands short hex and leaves out what is not there', () => {
    expect(tokenColours(':root { --primary: #0af; }')).toEqual({ primary: '#00AAFF' });
    expect(tokenColours('body { color: red; }')).toEqual({});
  });
});
