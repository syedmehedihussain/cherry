import { useSyncExternalStore } from 'react';

/** The app themes. Classic is the original token set; the Cherry pair follows the brand sheet. */
export const THEMES = [
  {
    id: 'classic',
    label: 'Classic',
    mode: 'dark',
    hint: 'The original Cherry look: neutral greys, blue accent.',
  },
  {
    id: 'cherry-dark',
    label: 'Cherry dark',
    mode: 'dark',
    hint: 'Brand ink with cream text and a coral accent.',
  },
  {
    id: 'cherry-light',
    label: 'Cherry light',
    mode: 'light',
    hint: 'Brand cream with ink text and a cherry accent.',
  },
  {
    id: 'just-black',
    label: 'Just black',
    mode: 'dark',
    hint: 'Jet black with white text and a vivid blue accent.',
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'cherry.theme';
const listeners = new Set<() => void>();

function read(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (THEMES.some((t) => t.id === v)) return v as ThemeId;
  } catch {
    // Private window: fall back to the default.
  }
  return 'just-black';
}

let current: ThemeId = read();

export const themeMode = (id: ThemeId) => THEMES.find((t) => t.id === id)!.mode;

/** Sets data-theme on <html> (tokens.css keys the overrides off it) and the browser chrome colour. */
export function applyTheme(id: ThemeId = current) {
  document.documentElement.dataset.theme = id;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function setTheme(id: ThemeId) {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not remembered, but still applied for this visit.
  }
  applyTheme(id);
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
