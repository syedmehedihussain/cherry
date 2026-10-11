import { useState } from 'react';

/** Open or minimized, remembered per box in localStorage (a per-viewer convenience). */
export function useCollapsed(key: string): [boolean, () => void] {
  const storageKey = `cherry.collapsed.${key}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      if (next) localStorage.setItem(storageKey, '1');
      else localStorage.removeItem(storageKey);
    } catch {
      // Private window: the choice just isn't remembered.
    }
  };
  return [collapsed, toggle];
}
