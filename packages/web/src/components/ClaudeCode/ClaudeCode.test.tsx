import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Approval } from '@cherry/shared';
import { CcPrompt } from './ClaudeCode.tsx';

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
