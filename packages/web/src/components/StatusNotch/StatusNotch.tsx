import { FileText } from 'lucide-react';
import { useState } from 'react';
import type { StatusDoc } from '@cherry/shared';
import { useNow } from '../../lib/useNow.ts';
import styles from './StatusNotch.module.css';

interface StatusNotchProps {
  /** undefined while the project is still loading. */
  status: StatusDoc | null | undefined;
  /** STATUS.md mtime; a change while you watch makes the notch light up. */
  updatedAt: number | null;
  /** The Status report is the open tab. */
  active?: boolean;
  onOpen(): void;
}

const FLASH_MS = 6000;

/**
 * STATUS.md as a small pill in the top bar: the word and a document icon. It lights up blue
 * for a few seconds when STATUS.md changes; a click opens the Status report in the centre.
 */
export function StatusNotch({ status, updatedAt, active, onOpen }: StatusNotchProps) {
  const [mountedAt] = useState(() => Date.now());
  const next = status?.nextSteps.find((s) => !s.done)?.text ?? null;
  const tick = useNow(1000);
  const flash = !!updatedAt && updatedAt > mountedAt && tick - updatedAt < FLASH_MS;

  const tone = status === undefined ? 'loading' : !status ? 'missing' : flash ? 'updated' : 'ok';
  const label =
    status === undefined
      ? 'Status · loading'
      : !status
        ? 'Status · no STATUS.md yet'
        : flash
          ? 'Status · just updated'
          : `Status${next ? ` · next: ${next}` : ''}`;

  return (
    <button
      type="button"
      className={styles.notch}
      data-tone={tone}
      aria-pressed={!!active}
      aria-label={`Open the status report. ${label}`}
      title={label}
      onClick={onOpen}
    >
      <span className={styles.text}>Status</span>
      <FileText size={12} strokeWidth={1.8} aria-hidden="true" className={styles.icon} />
    </button>
  );
}
