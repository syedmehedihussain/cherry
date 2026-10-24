/**
 * Claude in Chrome (ADR-0037, ADR-0038): the CLI's built-in browser tools, named
 * mcp__claude-in-chrome__*. With the setting on they run without asking; these helpers name
 * each step for the chat row and the Live view.
 */
export const CHROME_PREFIX = 'mcp__claude-in-chrome__';

/** Tools that only look at the browser. */
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

export interface ChromeVerdict {
  /** What Claude does, e.g. "Claude wants to use Chrome: open http://localhost:5173". */
  title: string;
  /** What it does, short: "open http://localhost:5173". */
  action: string;
  /** Only looks at the browser. */
  read: boolean;
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

export function classifyChrome(name: string, input: Record<string, unknown>): ChromeVerdict {
  const action = what(name, input);
  return { title: `Claude wants to use Chrome: ${action}`, action, read: READS.has(name) };
}

/** Claude's subagent tool: Task in older Claude Code, Agent in newer (V2.1 w7.5, ADR-0042). */
export const SUBAGENT_TOOLS = new Set(['Task', 'Agent']);
export const isSubagent = (tool: string) => SUBAGENT_TOOLS.has(tool);
