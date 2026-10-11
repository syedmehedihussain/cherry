import { ChevronDown, ChevronUp } from 'lucide-react';
import styles from './CollapseButton.module.css';

/** The small round button in a box's corner that minimizes or expands it. */
export function CollapseButton({
  collapsed,
  name,
  onToggle,
}: {
  collapsed: boolean;
  /** What the box is, for the label: "Minimize repository". */
  name: string;
  onToggle(): void;
}) {
  const Icon = collapsed ? ChevronDown : ChevronUp;
  return (
    <button
      type="button"
      className={styles.btn}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Expand ${name}` : `Minimize ${name}`}
      title={collapsed ? 'Expand' : 'Minimize'}
      onClick={onToggle}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
