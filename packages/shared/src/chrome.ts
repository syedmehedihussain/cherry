/** Claude in Chrome (ADR-0037): the CLI's built-in browser tools, named mcp__claude-in-chrome__*. */
export const CHROME_PREFIX = 'mcp__claude-in-chrome__';

/** Tools that only look at the browser. They follow Auto mode and Allow for this session. */
const READS = new Set([
  'tabs_context_mcp',
  'list_connected_browsers',
  'read_page',
  'get_page_text',
  'find',
  'read_console_messages',
  'read_network_requests',
  'shortcuts_list',
]);

/** Tools that run code or send files from your disk: they ask every time, no session rule. */
const EVERY_TIME = new Set(['javascript_tool', 'file_upload', 'upload_image']);

export interface ChromeVerdict {
  /** Card title. */
  title: string;
  /** Only reads: Auto may run it. */
  read: boolean;
  /** A session rule may cover it. */
  sessionOk: boolean;
}

/** The short tool name (`navigate`), or null when the tool is not a Chrome tool. */
export function chromeTool(tool: string): string | null {
  return tool.startsWith(CHROME_PREFIX) ? tool.slice(CHROME_PREFIX.length) : null;
}

function what(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  switch (name) {
    case 'navigate':
      return s('url') ? `open ${s('url')}` : 'go to a page';
    case 'computer':
      return s('action') ? `${s('action').replace(/_/g, ' ')} in the page` : 'act in the page';
    case 'form_input':
      return 'fill in a form field';
    case 'javascript_tool':
      return 'run JavaScript in the page';
    case 'file_upload':
    case 'upload_image':
      return 'upload a file to the page';
    case 'tabs_create_mcp':
      return 'open a new tab';
    case 'tabs_close_mcp':
      return 'close a tab';
    case 'gif_creator':
      return 'record the tab as a GIF';
    case 'shortcuts_execute':
      return 'run a shortcut';
    default:
      return READS.has(name) ? 'read the browser' : name.replace(/_/g, ' ');
  }
}

/** An approval card for this tool may offer Allow for this session. */
export function chromeSessionOk(tool: string): boolean {
  const name = chromeTool(tool);
  return !name || !EVERY_TIME.has(name);
}

export function classifyChrome(name: string, input: Record<string, unknown>): ChromeVerdict {
  return {
    title: `Claude wants to use Chrome: ${what(name, input)}`,
    read: READS.has(name),
    sessionOk: !EVERY_TIME.has(name),
  };
}
