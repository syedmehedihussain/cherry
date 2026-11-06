import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveCard, StageCard } from './StageCard.tsx';

const base = { name: 'Plan', agent: 'System Architect', mono: 'AR', meta: 'In progress' };

describe('StageCard (V4)', () => {
  it('names the state: On-going, ready to sign off, waiting, complete, needs update', () => {
    const { rerender } = render(
      <StageCard {...base} state="active" ready={false} onOpen={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Plan, On-going' })).toBeTruthy();
    rerender(<StageCard {...base} state="active" ready onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Plan, ready to sign off' })).toBeTruthy();
    rerender(<StageCard {...base} state="waiting" ready onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Plan, waiting for client' })).toBeTruthy();
    rerender(<StageCard {...base} state="signed" ready onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Plan, complete' }).dataset.state).toBe('signed');
    rerender(<StageCard {...base} state="update" ready={false} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Plan, needs update' })).toBeTruthy();
  });

  it('opens an open stage; a locked one shakes and says why instead', () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <StageCard {...base} state="active" ready={false} onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    rerender(
      <StageCard
        {...base}
        state="locked"
        ready={false}
        meta="Opens when Requirements is signed off"
        onOpen={onOpen}
      />,
    );
    const card = screen.getByRole('button', { name: 'Plan, locked' });
    expect(card.getAttribute('aria-disabled')).toBe('true');
    expect(card.getAttribute('title')).toBe('Opens when Requirements is signed off');
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(card.dataset.shake).toBe('1');
  });

  it('Live opens Maintenance only once the project is live', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<LiveCard live={false} label="after Deployment" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Live, after Deployment' }));
    expect(onOpen).not.toHaveBeenCalled();
    rerender(<LiveCard live label="v1.0 is live" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Live, v1.0 is live' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
