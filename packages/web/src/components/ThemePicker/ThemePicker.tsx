import { Check } from 'lucide-react';
import { setTheme, THEMES, useTheme } from '../../lib/theme.ts';
import styles from './ThemePicker.module.css';

/** The theme cards, each previewed in its own tokens. Used in Settings and on the welcome screen. */
export function ThemePicker() {
  const theme = useTheme();
  return (
    <div className={styles.themes} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          className={styles.theme}
          onClick={() => setTheme(t.id)}
        >
          <span className={styles.themePreview} data-theme={t.id} aria-hidden="true">
            <span className={styles.themeCard}>
              <span className={styles.themeLine} />
              <span className={styles.themeLine} data-short />
              <span className={styles.themeAccent} />
            </span>
          </span>
          <span className={styles.themeName}>
            {t.label}
            {theme === t.id && <Check size={14} />}
          </span>
          <span className={styles.themeHint}>{t.hint}</span>
        </button>
      ))}
    </div>
  );
}
