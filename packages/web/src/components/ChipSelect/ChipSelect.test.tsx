import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipSelect } from './ChipSelect.tsx';

const options = [
  { value: 'task', label: 'Task', hint: 'Add it to your task list' },
  { value: 'note', label: 'Note' },
  { value: 'agent', label: 'Agent' },
];

describe('ChipSelect', () => {
  it('names the choice and picks from the menu', () => {
    const onChange = vi.fn();
    render(<ChipSelect label="Add as" value="task" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add as: Task' }));
    expect(screen.getByRole('menuitemradio', { name: /Task/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Note/ }));
    expect(onChange).toHaveBeenCalledWith('note');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves with the arrow keys and closes on Escape', () => {
    render(<ChipSelect label="Add as" value="task" options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add as: Task' }));
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('menuitemradio', { name: /Task/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitemradio', { name: /Agent/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add as: Task' })).toHaveFocus();
  });
});
