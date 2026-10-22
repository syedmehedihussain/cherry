import { useQuery } from '@tanstack/react-query';
import { ArrowUp, Folder } from 'lucide-react';
import { useDeferredValue } from 'react';
import { FolderListSchema } from '@cherry/shared';
import { api } from '../../api/client.ts';
import styles from './FolderPicker.module.css';

/** Type or click through folders on this machine (the daemon lists them; names only). */
export function FolderPicker({
  value,
  onChange,
  label,
  missingNote,
  emptyNote,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  missingNote: string;
  emptyNote: string;
}) {
  const query = useDeferredValue(value.trim());
  const list = useQuery({
    queryKey: ['folders', query],
    queryFn: () =>
      api('GET', `/api/folders?path=${encodeURIComponent(query)}`, undefined, FolderListSchema),
    enabled: !!query,
    placeholderData: (prev) => prev,
  });
  const data = list.data;
  const join = (name: string) => `${(data?.path ?? value).replace(/\/$/, '')}/${name}`;

  return (
    <div className={styles.picker}>
      <input
        className="input mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        spellCheck={false}
      />
      <div className={styles.browser}>
        <button
          type="button"
          className={styles.up}
          disabled={!data?.parent}
          onClick={() => data?.parent && onChange(data.parent)}
        >
          <ArrowUp size={14} /> Up
        </button>
        {data && !data.exists ? (
          <p className={styles.note}>{missingNote}</p>
        ) : data && data.dirs.length === 0 ? (
          <p className={styles.note}>{emptyNote}</p>
        ) : (
          <ul className={styles.dirs}>
            {data?.dirs.map((name) => (
              <li key={name}>
                <button type="button" onClick={() => onChange(join(name))}>
                  <Folder size={14} /> {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
