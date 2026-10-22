import { describe, expect, it } from 'vitest';
import { chromeSessionOk, chromeTool, classifyChrome } from './chrome.ts';

describe('Claude in Chrome rules (ADR-0037)', () => {
  it('names the action and sorts reads from actions', () => {
    expect(chromeTool('mcp__claude-in-chrome__navigate')).toBe('navigate');
    expect(chromeTool('Bash')).toBeNull();
    expect(classifyChrome('navigate', { url: 'http://localhost:3000' })).toEqual({
      title: 'Claude wants to use Chrome: open http://localhost:3000',
      read: false,
      sessionOk: true,
    });
    expect(classifyChrome('computer', { action: 'left_click' }).title).toBe(
      'Claude wants to use Chrome: left click in the page',
    );
    expect(classifyChrome('get_page_text', {}).read).toBe(true);
  });

  it('never offers a session rule for JavaScript or uploads', () => {
    expect(chromeSessionOk('mcp__claude-in-chrome__javascript_tool')).toBe(false);
    expect(chromeSessionOk('mcp__claude-in-chrome__file_upload')).toBe(false);
    expect(chromeSessionOk('mcp__claude-in-chrome__navigate')).toBe(true);
    expect(chromeSessionOk('WebFetch')).toBe(true);
  });
});
