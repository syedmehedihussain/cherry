import { useState } from 'react';

/** Open or minimized, remembered per box in localStorage (a per-viewer convenience). */
export function useCollapsed(key: string, collapsedByDefault = false): [boolean, () => void] {
  const storageKey = `cherry.collapsed.${key}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? collapsedByDefault : v === '1';
    } catch {
      return collapsedByDefault;
    }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      if (next === collapsedByDefault) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      // Private window: the choice just isn't remembered.
    }
  };
  return [collapsed, toggle];
}
