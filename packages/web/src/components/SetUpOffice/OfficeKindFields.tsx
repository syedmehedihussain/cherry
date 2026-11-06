import styles from './SetUpOffice.module.css';

export type KindValue =
  | { kind: 'client'; client: string; contact: string }
  | { kind: 'personal'; client?: string; contact?: string };

/** Client project or personal project (ADR-0057), with the client's name and contact. */
export function OfficeKindFields({
  value,
  onChange,
}: {
  value: KindValue;
  onChange(v: KindValue): void;
}) {
  const client = value.kind === 'client';
  return (
    <div className={styles.fields}>
      <div className={styles.seg} role="radiogroup" aria-label="Kind of project">
        <button
          type="button"
          role="radio"
          aria-checked={client}
          onClick={() =>
            onChange({ kind: 'client', client: value.client ?? '', contact: value.contact ?? '' })
          }
        >
          Client project
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!client}
          onClick={() => onChange({ ...value, kind: 'personal' })}
        >
          Personal project
        </button>
      </div>
      {client ? (
        <div className={styles.two}>
          <label className={styles.field}>
            <span>Client</span>
            <input
              value={value.client}
              onChange={(e) => onChange({ ...value, client: e.target.value })}
              placeholder="Fitness Master Gym"
            />
          </label>
          <label className={styles.field}>
            <span>Client contact</span>
            <input
              value={value.contact}
              onChange={(e) => onChange({ ...value, contact: e.target.value })}
              placeholder="Name, role"
            />
          </label>
        </div>
      ) : (
        <p className={styles.hint}>
          Same stages as a client project. You sign off each stage yourself; there is no client
          approval and no invoice, only costs.
        </p>
      )}
    </div>
  );
}
