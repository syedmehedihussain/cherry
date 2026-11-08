import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Approval } from '@cherry/shared';
import { activeTask, CcPrompt, CcTasks } from './ClaudeCode.tsx';

const approval = (over: Partial<Approval> = {}): Approval => ({
  id: 'a1',
  projectId: 'p',
  source: 'chat',
  kind: 'command',
  tool: 'Bash',
  title: 'Claude wants to run a command',
  files: [],
  command: 'pnpm add idb',
  detail: null,
  cwd: '/home/u/p',
  status: 'pending',
  reason: null,
  createdAt: 0,
  answeredAt: null,
  remember: true,
  ...over,
});

describe('CcPrompt', () => {
  it('numbers the answers like the CLI', () => {
    render(<CcPrompt approval={approval()} onAnswer={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Claude wants to run a command' });
    expect(group).toHaveTextContent('Bash command');
    expect(group).toHaveTextContent('Do you want to proceed?');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1.Yes',
      '2.Yes, for this session',
      "3.Yes, and don't ask again for pnpm add idb in this project",
      '4.No, and tell Claude what to do differently (esc)',
    ]);
  });

  it('answers with a number key', async () => {
    const onAnswer = vi.fn(async () => {});
    render(<CcPrompt approval={approval()} onAnswer={onAnswer} autoFocus />);
    fireEvent.keyDown(screen.getByRole('group'), { key: '3' });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('allow_always', undefined));
  });

  it('moves with the arrows and picks with Enter', async () => {
    const onAnswer = vi.fn(async () => {});
    render(<CcPrompt approval={approval({ remember: false })} onAnswer={onAnswer} autoFocus />);
    const group = screen.getByRole('group');
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    fireEvent.keyDown(group, { key: 'Enter' });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('allow_session', undefined));
  });

  it('Esc asks why, then denies with the reason', async () => {
    const onAnswer = vi.fn(async () => {});
    render(<CcPrompt approval={approval()} onAnswer={onAnswer} autoFocus />);
    fireEvent.keyDown(screen.getByRole('group'), { key: 'Escape' });
    const reason = screen.getByLabelText('Tell Claude why (optional)');
    fireEvent.change(reason, { target: { value: 'use npm' } });
    fireEvent.keyDown(reason, { key: 'Enter' });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('deny', 'use npm'));
  });

  it('a serious command or a push has no session answer', () => {
    render(
      <CcPrompt
        approval={approval({ detail: 'Deletes a folder.', remember: false })}
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.getByText('Serious command')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /session/ })).not.toBeInTheDocument();
  });
});

describe('CcTasks', () => {
  const plan = [
    { id: '1', title: 'Read the SRS', activeForm: 'Reading the SRS', status: 'completed' as const },
    {
      id: '2',
      title: 'Write the test plan',
      activeForm: 'Writing',
      status: 'in_progress' as const,
    },
    { id: '3', title: 'Run the tests', activeForm: null, status: 'pending' as const },
  ];

  it('ticks off done steps and marks the current one while Claude works', () => {
    render(<CcTasks plan={plan} running />);
    const list = screen.getByRole('list', { name: 'Tasks, 1 of 3 done' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual([
      'completed',
      'in_progress',
      'pending',
    ]);
    expect(rows.map((r) => r.textContent?.[0])).toEqual(['✓', '■', '□']);
    expect(activeTask(plan)).toBe('Writing');
  });

  it('folds into one line after the turn, and opens on a click', () => {
    render(<CcTasks plan={plan} running={false} />);
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tasks · 1 of 3 done' }));
    expect(screen.getByRole('list', { name: 'Tasks, 1 of 3 done' })).toBeVisible();
  });
});
