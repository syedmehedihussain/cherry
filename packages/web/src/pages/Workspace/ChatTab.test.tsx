import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Approval, ChatItem, DecisionCard as Card } from '@cherry/shared';
import { CcPrompt } from '../../components/ClaudeCode/ClaudeCode.tsx';
import { DecisionCard } from '../../components/DecisionCard/DecisionCard.tsx';
import { answerKey, CONTINUE_JOB, readMode, retryMessage, storeMode } from './ChatTab.tsx';

const approval: Approval = {
  id: 'a1',
  projectId: 'p',
  source: 'chat',
  kind: 'command',
  tool: 'Bash',
  title: 'Claude wants to run a command',
  files: [],
  command: 'pnpm test',
  detail: null,
  cwd: '/home/u/p',
  status: 'pending',
  reason: null,
  createdAt: 0,
  answeredAt: null,
  remember: false,
};

/** Like a key press in the composer: React updates inside act. */
const press = (root: HTMLElement, key: string) => {
  let used = false;
  act(() => {
    used = answerKey(root, key);
  });
  return used;
};

const card = {
  label: 'Decision',
  topic: 'Hosting',
  question: 'Where should the site run?',
  context: '',
  options: [
    { id: 'o1', title: 'GitHub Pages', detail: '', tradeoff: 'Static only', recommended: true },
    { id: 'o2', title: 'Netlify', detail: '', tradeoff: 'Another account', recommended: false },
  ],
  allowCustom: false,
  why: '',
} as unknown as Card;

// #14, #39: the composer keeps focus, so "press a number" must reach the card through it.
describe('answerKey', () => {
  it('answers an approval with a number key from the composer', async () => {
    const onAnswer = vi.fn(async () => {});
    const { container } = render(<CcPrompt approval={approval} onAnswer={onAnswer} />);
    expect(press(container, '1')).toBe(true);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('allow', undefined));
  });

  it('picks a decision option by number, then Enter confirms it', async () => {
    const onConfirm = vi.fn(async () => {});
    const { container } = render(<DecisionCard card={card} state="open" onConfirm={onConfirm} />);
    expect(screen.getAllByRole('radio').map((r) => r.textContent?.[0])).toEqual(['1', '2']);
    expect(press(container, '2')).toBe(true);
    expect(screen.getByRole('radio', { name: /Netlify/ })).toHaveAttribute('aria-checked', 'true');
    expect(press(container, 'Enter')).toBe(true);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ optionId: 'o2' }));
  });

  it('leaves the key to the composer when no card waits or the card ignores it', () => {
    expect(answerKey(document.createElement('div'), '1')).toBe(false);
    const { container } = render(<DecisionCard card={card} state="open" onConfirm={vi.fn()} />);
    expect(press(container, '7')).toBe(false);
  });
});

// Findings #38, #50: a room the user has not set takes the mode last picked in the project.
describe('readMode', () => {
  it('uses the last pick in the project for a room with no mode of its own', () => {
    localStorage.clear();
    expect(readMode('p', 'development')).toBe('ask');
    expect(readMode('p', 'design')).toBe('auto');
    storeMode('p', 'requirements', 'auto');
    expect(readMode('p', 'development')).toBe('auto');
    expect(readMode('p', 'testing')).toBe('auto');
    storeMode('p', 'testing', 'ask');
    expect(readMode('p', 'requirements')).toBe('auto');
    expect(readMode('p', 'design')).toBe('ask');
    expect(readMode('other', 'development')).toBe('ask');
  });
});

// Finding #46: Retry after a limit carries on instead of sending the whole job again.
describe('retryMessage', () => {
  const user = { kind: 'user', id: 'u', at: 1, text: 'Build the whole app' } as unknown as ChatItem;
  const tool = { kind: 'tool', id: 't', at: 2 } as unknown as ChatItem;
  const end = { kind: 'turn-end', id: 'e', at: 3, ok: false } as unknown as ChatItem;

  it('continues in the session when the failed turn had done work', () => {
    expect(retryMessage([user, tool, end], 'sess')).toBe(CONTINUE_JOB);
  });

  it('sends the message again when nothing happened, or there is no session', () => {
    expect(retryMessage([user, end], 'sess')).toBe('Build the whole app');
    expect(retryMessage([user, tool, end], null)).toBe('Build the whole app');
    expect(retryMessage([], 'sess')).toBeUndefined();
  });
});
