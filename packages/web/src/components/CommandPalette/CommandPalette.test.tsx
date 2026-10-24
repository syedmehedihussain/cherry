import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, matchLabel, usePalette, type PaletteItem } from './CommandPalette.tsx';

describe('matchLabel', () => {
  it('prefers one run of letters', () => {
    expect(matchLabel('Scan agents', 'ag')).toEqual([5, 6]);
  });
  it('falls back to the letters in order', () => {
    expect(matchLabel('Notes and tasks', 'nts')).toEqual([0, 2, 4]);
  });
  it('is null when the letters are not there', () => {
    expect(matchLabel('Decisions', 'xyz')).toBeNull();
  });
  it('matches everything for an empty query', () => {
    expect(matchLabel('Agents', '  ')).toEqual([]);
  });
});

const items = (run = vi.fn()): PaletteItem[] => [
  { id: 'a', group: 'Views', label: 'Agents', hint: '2 running', run },
  { id: 'd', group: 'Views', label: 'Decisions', run: vi.fn() },
  { id: 'n', group: 'Actions', label: 'New chat', keys: ['/clear'], run: vi.fn() },
];

describe('CommandPalette', () => {
  it('opens with Ctrl+K, filters, and runs the chosen row with Enter', async () => {
    const run = vi.fn();
    render(<CommandPalette items={items(run)} searchFiles={async () => []} onOpenFile={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const box = await screen.findByRole('combobox', { name: 'Search or run a command' });
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'agen' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('2 running')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with Esc', async () => {
    render(<CommandPalette items={items()} searchFiles={async () => []} onOpenFile={vi.fn()} />);
    act(() => usePalette.getState().set(true));
    fireEvent.keyDown(await screen.findByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('finds files; a leading > finds files only', async () => {
    const open = vi.fn();
    const search = vi.fn(async () => ['src/agents.ts']);
    render(<CommandPalette items={items()} searchFiles={search} onOpenFile={open} />);
    act(() => usePalette.getState().set(true));
    const box = await screen.findByRole('combobox');
    fireEvent.change(box, { target: { value: '>agents' } });
    const row = await screen.findByRole('option', { name: /src\/agents\.ts/ });
    expect(screen.queryByRole('option', { name: /^Agents/ })).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledWith('agents');
    fireEvent.click(row);
    expect(open).toHaveBeenCalledWith('src/agents.ts');
  });
});
