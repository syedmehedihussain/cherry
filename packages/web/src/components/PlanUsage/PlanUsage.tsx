import type { PlanWindow } from '@cherry/shared';
import { usePlanUsage } from '../../api/queries.ts';
import { useCollapsed } from '../../lib/useCollapsed.ts';
import { CollapseButton } from '../CollapseButton/CollapseButton.tsx';
import styles from './PlanUsage.module.css';

/** "in 1h 12m" for the 5-hour window, "Sun 22:00" for the week. */
export function resetText(at: number, now: number): string {
  const ms = at - now;
  if (ms <= 0) return 'resets now';
  if (ms < 24 * 3_600_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.ceil((ms % 3_600_000) / 60_000);
    return h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`;
  }
  const d = new Date(at);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `resets ${day} ${time}`;
}

const percent = (w: PlanWindow) => Math.max(0, Math.min(100, Math.round(w.usedPercent)));
const levelOf = (pct: number) => (pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'ok');

function Meter({ label, w, now }: { label: string; w: PlanWindow; now: number }) {
  const pct = percent(w);
  const level = levelOf(pct);
  return (
    <div className={styles.meter}>
      <div className={styles.row}>
        <span className={styles.name}>{label}</span>
        <span className={styles.pct}>{pct}%</span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={styles.fill} data-level={level} style={{ width: `${pct}%` }} />
      </div>
      {w.resetsAt !== null && <span className={styles.reset}>{resetText(w.resetsAt, now)}</span>}
    </div>
  );
}

/** Claude Code plan usage on the Overview: the 5-hour and weekly limits as bars. */
export function PlanUsage({ now }: { now: number }) {
  const usage = usePlanUsage();
  const [collapsed, toggle] = useCollapsed('usage');
  const u = usage.data;
  if (!u?.available || (!u.fiveHour && !u.week)) return null;
  const button = (
    <CollapseButton collapsed={collapsed} name="Claude Code usage" onToggle={toggle} />
  );
  if (collapsed) {
    const windows = [
      ['5h', u.fiveHour],
      ['Week', u.week],
    ] as const;
    return (
      <section className={styles.box} aria-label="Claude Code usage" data-collapsed>
        <div className={styles.top}>
          <span className={styles.label}>Claude Code usage</span>
          <span className={styles.mini}>
            {windows.map(([name, w]) =>
              w ? (
                <span key={name}>
                  {name} <b data-level={levelOf(percent(w))}>{percent(w)}%</b>
                </span>
              ) : null,
            )}
            {button}
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className={styles.box} aria-label="Claude Code usage">
      <div className={styles.top}>
        <span className={styles.label}>Claude Code usage</span>
        <span className={styles.mini}>
          {u.plan && <span className={styles.plan}>{u.plan}</span>}
          {button}
        </span>
      </div>
      {u.fiveHour && <Meter label="5-hour" w={u.fiveHour} now={now} />}
      {u.week && <Meter label="Week" w={u.week} now={now} />}
    </section>
  );
}
