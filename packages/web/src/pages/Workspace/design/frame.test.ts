import { describe, expect, it } from 'vitest';
import { fitZoom, frameDoc } from './frame.ts';

describe('canvas frames', () => {
  it('sets the theme and adds the script in the head', () => {
    const doc = frameDoc('<html><head><title>x</title></head><body>hi</body></html>', 'light');
    expect(doc).toMatch(
      /<head><script>document\.documentElement\.setAttribute\('data-theme', "light"\)/,
    );
    expect(doc).toContain('cherry:pick');
    expect(frameDoc('<p>bare</p>', 'dark')).toMatch(/^<!doctype html><html><head><script>/);
  });
  it('fits the artboards in the box, never above 100%', () => {
    expect(fitZoom(3, { w: 375, h: 812 }, { w: 1000, h: 800 })).toBeCloseTo(0.71, 2);
    expect(fitZoom(1, { w: 375, h: 812 }, { w: 4000, h: 4000 })).toBe(1);
    expect(fitZoom(0, { w: 375, h: 812 }, { w: 1000, h: 800 })).toBe(1);
  });
});

import { commentMessage } from './DesignStage.tsx';
describe('comments for the Designer', () => {
  it('names the file and the element', () => {
    const screen = { path: 'design/screens/a.html', name: 'a', title: 'A', html: '', mtime: 0 };
    expect(commentMessage({ screen, selector: 'p.big', text: '12', note: 'Bigger.' })).toBe(
      'Comment on design/screens/a.html, element `p.big` ("12"):\nBigger.',
    );
  });
});
