import { ArrowRight, CircleCheck, CircleX, X } from 'lucide-react';
import { useState } from 'react';
import type { BrowserTest as Test, TestStep } from '@cherry/shared';
import { shotUrl } from '../../../api/deploy.ts';
import styles from './DeployStage.module.css';

const HINT_KEY = 'cherry.chromeHint';

/** What the Builder gets from Fix in Development for a failed browser step. */
export function stepFixMessage(test: Test, step: TestStep): string {
  return `The browser test failed at step ${step.n}, "${step.name}", on ${test.url ?? 'the app'}: ${step.detail || 'no detail'}. Find the cause in the code, fix it, and check the step again in Chrome.`;
}

/**
 * The browser test in the cockpit (V3 r11): one row per step from the test plan, pass or fail,
 * with its screenshot. The log opens on a click; nothing streams by.
 */
export function BrowserTestSection({
  projectId,
  test,
  onFix,
  onRun,
}: {
  projectId: string;
  test: Test;
  onFix(step: TestStep): void;
  onRun(): void;
}) {
  const [log, setLog] = useState(false);
  const [large, setLarge] = useState<TestStep | null>(null);
  const [hint, setHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== 'seen';
    } catch {
      return false;
    }
  });
  const running = test.status === 'running';
  const shot = (s: TestStep) => (test.id && s.shot ? shotUrl(projectId, test.id, s.shot) : null);
  return (
    <section className={styles.section} aria-label="Browser test">
      <div className={styles.sectionHead}>
        <span className={styles.label}>
          Browser test <span className={styles.labelNote}>Claude in Chrome</span>
        </span>
        {test.log.length > 0 && (
          <button type="button" className={styles.link} onClick={() => setLog(!log)}>
            {log ? 'Hide log' : 'Full log'}
          </button>
        )}
      </div>
      {hint && !test.blocked && (
        <p className={styles.hint} role="note">
          Once: in the Claude in Chrome extension, allow it on localhost for good (Site access →
          localhost). Then Chrome stops asking during the test.
          <button
            type="button"
            className={styles.hintClose}
            aria-label="Got it"
            onClick={() => {
              setHint(false);
              try {
                localStorage.setItem(HINT_KEY, 'seen');
              } catch {
                // Private window: the hint shows again next time.
              }
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </p>
      )}
      {test.blocked && <p className={styles.muted}>{test.blocked}</p>}
      {!test.blocked && test.status === 'idle' && (
        <p className={styles.muted}>
          Test walks through the app in Chrome, from <code>docs/test-plan.md</code>. Run the app
          first.
        </p>
      )}
      <ul className={styles.steps} aria-label="Test steps">
        {test.steps.map((s) => (
          <li key={s.n}>
            <div className={styles.step} data-ok={s.ok || undefined}>
              {s.ok ? (
                <CircleCheck size={15} className={styles.ok} aria-label="passed" />
              ) : (
                <CircleX size={15} className={styles.bad} aria-label="failed" />
              )}
              <span className={styles.stepText}>
                <span>{s.name}</span>
                {!s.ok && s.detail && <span className={styles.stepDetail}>{s.detail}</span>}
              </span>
              {shot(s) && (
                <button
                  type="button"
                  className={styles.thumb}
                  aria-label={`Screenshot of ${s.name}`}
                  onClick={() => setLarge(s)}
                >
                  <img src={shot(s)!} alt="" loading="lazy" />
                </button>
              )}
            </div>
            {!s.ok && !running && (
              <div className={styles.fixRow}>
                <button type="button" className={styles.fix} onClick={() => onFix(s)}>
                  <ArrowRight size={12} aria-hidden="true" />
                  Fix in Development
                </button>
                <button type="button" className={styles.link} onClick={onRun}>
                  Run again
                </button>
              </div>
            )}
          </li>
        ))}
        {running && (
          <li className={styles.stepRunning}>
            <span className="spinner" style={{ width: 13, height: 13 }} />
            Step {test.steps.length + 1}…
          </li>
        )}
      </ul>
      {test.summary && test.status !== 'running' && (
        <p className={styles.testSummary}>{test.summary}</p>
      )}
      {log && (
        <pre className={styles.output} aria-label="Browser test log">
          {test.log.join('\n')}
        </pre>
      )}
      {large && shot(large) && (
        <div className={styles.scrim} onMouseDown={() => setLarge(null)}>
          <figure
            className={styles.shotLarge}
            role="dialog"
            aria-label={`Screenshot of ${large.name}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <img src={shot(large)!} alt={large.name} />
            <figcaption>
              {large.n}. {large.name}
              <button
                type="button"
                className={styles.icon}
                aria-label="Close"
                onClick={() => setLarge(null)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
