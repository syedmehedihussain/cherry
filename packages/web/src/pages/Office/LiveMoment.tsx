import { useState } from 'react';
import styles from './LiveMoment.module.css';

const key = (id: string, version: string) => `cherry:live-seen:${id}:${version}`;

function seen(id: string, version: string): boolean {
  try {
    return localStorage.getItem(key(id, version)) === '1';
  } catch {
    return true;
  }
}

/** The moment a version goes Live (V4 o19), once per version in this browser. */
export function LiveMoment({
  projectId,
  name,
  version,
}: {
  projectId: string;
  name: string;
  version: string;
}) {
  const [open, setOpen] = useState(() => !seen(projectId, version));
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(key(projectId, version), '1');
    } catch {
      // Private mode: it shows again next time.
    }
    setOpen(false);
  };
  return (
    <div className={styles.live} role="dialog" aria-modal="true" aria-label="The project is live">
      <div>
        <div className={styles.big}>Live</div>
        <p>
          {name} v{version} is live. The project page is now the maintenance office.
        </p>
        <button type="button" className={styles.btn} onClick={close} autoFocus>
          Open the maintenance office
        </button>
      </div>
    </div>
  );
}
