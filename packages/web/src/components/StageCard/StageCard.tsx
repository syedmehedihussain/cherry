import { Check, Clock, Globe, Lock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { StageState } from '@cherry/shared';
import styles from './StageCard.module.css';

export interface StageCardProps {
  name: string;
  agent: string;
  /** The agent's initials, e.g. BA. */
  mono: string;
  state: StageState;
  ready: boolean;
  /** Small line under the name on hover: documents, sign-off date, or why it is locked. */
  meta: string;
  onOpen(): void;
}

const WORD: Record<StageState, string> = {
  locked: 'locked',
  active: 'On-going',
  waiting: 'waiting for client',
  signed: 'complete',
  update: 'needs update',
  carried: 'from the last version',
};

/** A stage on the project page (V4, the plan sketch): paper while open, red when signed off. */
export function StageCard({ name, agent, mono, state, ready, meta, onOpen }: StageCardProps) {
  const [shake, setShake] = useState(0);
  const locked = state === 'locked';
  const word = state === 'active' && ready ? 'ready to sign off' : WORD[state];
  const Icon =
    state === 'locked'
      ? Lock
      : state === 'signed' || state === 'carried'
        ? Check
        : state === 'waiting'
          ? Clock
          : state === 'update'
            ? TriangleAlert
            : null;
  return (
    <button
      type="button"
      className={styles.card}
      data-state={state === 'carried' ? 'signed' : state}
      data-ready={state === 'active' && ready ? 'true' : undefined}
      data-shake={shake || undefined}
      aria-label={`${name}, ${word}`}
      aria-disabled={locked || undefined}
      title={locked ? meta : undefined}
      onClick={() => (locked ? setShake((n) => n + 1) : onOpen())}
      onAnimationEnd={() => setShake(0)}
    >
      <span className={styles.top}>
        <span className={styles.av}>{mono}</span>
        <span className={styles.role}>{agent}</span>
        {Icon && <Icon size={14} className={styles.icon} aria-hidden="true" />}
      </span>
      <span className={styles.body}>
        <span className={styles.name} data-long={name.length > 9 || undefined}>
          {name}
        </span>
        <span className={styles.state}>{word}</span>
      </span>
      <span className={styles.meta}>{meta}</span>
    </button>
  );
}

/** The eighth card: Live, which opens Maintenance once the project is live. */
export function LiveCard({
  live,
  label,
  onOpen,
}: {
  live: boolean;
  label: string;
  onOpen(): void;
}) {
  const [shake, setShake] = useState(0);
  return (
    <button
      type="button"
      className={styles.card}
      data-state={live ? 'signed' : 'locked'}
      data-shake={shake || undefined}
      aria-label={`Live, ${label}`}
      aria-disabled={!live || undefined}
      title={live ? undefined : 'Opens when Deployment is signed off'}
      onClick={() => (live ? onOpen() : setShake((n) => n + 1))}
      onAnimationEnd={() => setShake(0)}
    >
      <span className={styles.top}>
        <span className={styles.av}>
          <Globe size={12} aria-hidden="true" />
        </span>
        <span className={styles.role}>Maintenance office</span>
        {live ? (
          <Check size={14} className={styles.icon} aria-hidden="true" />
        ) : (
          <Lock size={14} className={styles.icon} aria-hidden="true" />
        )}
      </span>
      <span className={styles.body}>
        <span className={styles.name}>Live</span>
        <span className={styles.state}>{label}</span>
      </span>
      <span className={styles.meta}>
        {live ? 'Support, QA, issues, upgrades' : 'Opens when Deployment is signed off'}
      </span>
    </button>
  );
}
