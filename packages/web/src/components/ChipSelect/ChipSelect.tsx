import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './ChipSelect.module.css';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** One short line under the label. */
  hint?: string;
  icon?: LucideIcon;
}

/**
 * A pill that opens a small menu above it, styled like the composer's model picker. Replaces a
 * native <select>, whose open list the browser draws in its own style.
 */
export function ChipSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  /** What is being chosen, for screen readers: "Add as", "Model". */
  label: string;
  value: T;
  options: ChipOption<T>[];
  onChange(value: T): void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.find((o) => o.value === value) ?? options[0];
  const Icon = current?.icon;

  useEffect(() => {
    if (!open) return;
    const at = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    items.current[at]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, options, value]);

  const close = () => {
    setOpen(false);
    wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const at = items.current.findIndex((b) => b === document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items.current[(at + step + options.length) % options.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={styles.chip}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? ''}`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {Icon && <Icon size={13} strokeWidth={1.8} aria-hidden="true" />}
        {current?.label}
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className={styles.chev} />
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {options.map((o, i) => {
            const OptIcon = o.icon;
            return (
              <button
                key={o.value}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                className={styles.item}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
              >
                {OptIcon && (
                  <span className={styles.icon}>
                    <OptIcon size={14} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                )}
                <span className={styles.text}>
                  <span className={styles.label}>{o.label}</span>
                  {o.hint && <span className={styles.hint}>{o.hint}</span>}
                </span>
                {o.value === value && (
                  <Check size={14} strokeWidth={2} aria-hidden="true" className={styles.check} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
