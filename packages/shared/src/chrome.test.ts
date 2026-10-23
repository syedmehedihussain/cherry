import { describe, expect, it } from 'vitest';
import { chromeTool, classifyChrome } from './chrome.ts';

describe('Claude in Chrome steps (ADR-0037, ADR-0038)', () => {
  it('names the action and tells reads from actions', () => {
    expect(chromeTool('mcp__claude-in-chrome__navigate')).toBe('navigate');
    expect(chromeTool('Bash')).toBeNull();
    expect(classifyChrome('navigate', { url: 'http://localhost:3000' })).toEqual({
      title: 'Claude wants to use Chrome: open http://localhost:3000',
      action: 'open http://localhost:3000',
      read: false,
    });
    expect(classifyChrome('computer', { action: 'left_click' }).action).toBe(
      'left click in the page',
    );
    expect(classifyChrome('get_page_text', {}).read).toBe(true);
  });
});
