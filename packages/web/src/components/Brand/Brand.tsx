import badge from '../../assets/brand/cherry-badge.png';
import { WORDMARK_CURSOR, WORDMARK_PATH, WORDMARK_VIEWBOX } from './wordmark-path.ts';
import styles from './Brand.module.css';

/**
 * The "cherry_" wordmark: JetBrains Mono outlines with a blinking coral cursor. `height` is the
 * cap-to-descender height in px; the letters take the current text colour.
 */
export function Wordmark({ height = 16, cursor = true }: { height?: number; cursor?: boolean }) {
  return (
    <svg
      className={styles.wordmark}
      viewBox={WORDMARK_VIEWBOX}
      height={height}
      role="img"
      aria-label="Cherry"
    >
      <path d={WORDMARK_PATH} fill="currentColor" />
      {cursor && (
        <rect
          className={styles.cursor}
          x={WORDMARK_CURSOR.x}
          y={WORDMARK_CURSOR.y}
          width={WORDMARK_CURSOR.width}
          height={WORDMARK_CURSOR.height}
        />
      )}
    </svg>
  );
}

/**
 * The small icon: a cream branch cherry on a burgundy tile. At 32 px and below the badge
 * letters blur, so this takes over (brand reference).
 */
export function CherryIcon({ size = 22 }: { size?: number }) {
  const small = size <= 16;
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <rect width="100" height="100" rx="25" className={styles.tile} />
      <svg x="9" y="9" width="82" height="82" viewBox="0 0 100 100">
        <g className={styles.branch} strokeWidth={small ? 11 : 9} strokeLinecap="round" fill="none">
          <path d="M50 18 V36 C50 46 37 48 33 56" />
          <path d="M50 36 C50 46 63 48 67 56" />
        </g>
        <circle cx="32" cy="68" r={small ? 18 : 17} className={styles.fruit} />
        <circle cx="68" cy="68" r={small ? 18 : 17} className={styles.fruit} />
      </svg>
    </svg>
  );
}

/** The Cherry badge (the user's lettering), for sizes above 32 px. */
export function CherryBadge({ size = 56 }: { size?: number }) {
  return <img src={badge} width={size} height={size} alt="" className={styles.badge} />;
}

/** Badge and wordmark side by side, as on the brand sheet's dark card. */
export function Lockup({ size = 56, tagline }: { size?: number; tagline?: boolean }) {
  return (
    <div className={styles.lockup}>
      <div className={styles.lockupRow}>
        <CherryBadge size={size} />
        <span className={styles.lockupWord}>
          <Wordmark height={Math.round(size * 0.52)} />
        </span>
      </div>
      {tagline && (
        <p className={styles.tagline}>
          $ cherry-pick your workflow
          <span className={styles.blockCursor} aria-hidden="true" />
        </p>
      )}
    </div>
  );
}
