import { Power } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiFailure } from '../../api/client.ts';
import styles from './Shutdown.module.css';

/** Home's Shut down button: asks once, stops the daemon, then shows how to start it again. */
export function Shutdown() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'off'>('idle');
  const [error, setError] = useState<string | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (step === 'confirm') confirm.current?.focus();
  }, [step]);

  const shutDown = async () => {
    setStep('busy');
    setError(null);
    try {
      await api('POST', '/api/shutdown');
      setStep('off');
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Cherry did not answer.');
      setStep('confirm');
    }
  };

  if (step === 'off')
    return (
      <div className={styles.off} role="alert">
        <Power size={28} strokeWidth={1.6} aria-hidden="true" />
        <h1>Cherry is off</h1>
        <p>
          To start it again, run <span className="mono">cherry</span> in a terminal.
        </p>
      </div>
    );

  return (
    <div className={styles.wrap}>
      {step === 'idle' ? (
        <button type="button" className={styles.trigger} onClick={() => setStep('confirm')}>
          <Power size={13} strokeWidth={1.8} aria-hidden="true" />
          Shut down Cherry
        </button>
      ) : (
        <div className={styles.confirm} role="group" aria-label="Shut down Cherry">
          <span>Shut down Cherry? Running chats, agents and apps stop too.</span>
          <button
            ref={confirm}
            type="button"
            className={`btn btn-danger btn-sm ${styles.danger}`}
            disabled={step === 'busy'}
            onClick={() => void shutDown()}
          >
            {step === 'busy' ? 'Shutting down…' : 'Shut down'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={step === 'busy'}
            onClick={() => setStep('idle')}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
