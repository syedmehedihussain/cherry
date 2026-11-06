import { Clock, Package, Plus, Printer, X } from 'lucide-react';
import { useState } from 'react';
import {
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  OfficeStageSchema,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import {
  addCost,
  addTime,
  billCost,
  officeSettings,
  removeCost,
  removeTime,
} from '../../api/office.ts';
import { useProjectUsage } from './Usage.tsx';
import styles from './Invoice.module.css';

export interface InvoiceTotals {
  /** Hours by stage: Claude's working time plus the time added by hand. */
  hours: { stage: OfficeStage | null; claude: number; manual: number }[];
  totalHours: number;
  services: number;
  billed: number;
  claudeUsd: number;
  work: number;
  invoiceTotal: number;
}

/** The numbers behind the Invoice tab and its print page (o13). */
export function invoiceTotals(
  office: OfficeFile,
  usage: { stage: string; ms: number }[],
  claudeUsd: number,
): InvoiceTotals {
  const rows: (OfficeStage | null)[] = [...OFFICE_STAGES, null];
  const hours = rows
    .map((s) => ({
      stage: s,
      claude: (usage.find((u) => u.stage === s)?.ms ?? 0) / 3_600_000,
      manual: office.time.filter((t) => t.stage === s).reduce((a, t) => a + t.hours, 0),
    }))
    .filter((h) => h.claude > 0 || h.manual > 0);
  const totalHours = hours.reduce((a, h) => a + h.claude + h.manual, 0);
  const services = office.costs.reduce((a, c) => a + c.amount, 0);
  const billed = office.costs.filter((c) => c.bill).reduce((a, c) => a + c.amount, 0);
  const work = Math.round(totalHours * office.rate * 100) / 100;
  return { hours, totalHours, services, billed, claudeUsd, work, invoiceTotal: work + billed };
}

/**
 * The Invoice tab (V4 o13), Costs for a personal project: time by stage, every cost, the Claude
 * usage at its API value, and the invoice for the client at the user's rate.
 */
export function Invoice({ projectId, office }: { projectId: string; office: OfficeFile }) {
  const usage = useProjectUsage(projectId).data;
  const personal = office.kind === 'personal';
  const t = invoiceTotals(office, usage?.stages ?? [], usage?.total.costUsd ?? 0);
  const money = (n: number) =>
    `${office.currency === 'USD' ? '$' : `${office.currency} `}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [error, setError] = useState<string | null>(null);
  const run = (p: Promise<unknown>) =>
    p.catch((e: unknown) => setError(e instanceof ApiFailure ? e.message : 'Could not save.'));

  return (
    <div className={styles.page}>
      <h2 className={styles.h}>{personal ? 'Costs' : 'Invoice'}</h2>
      <p className={styles.sub}>
        {personal
          ? 'What this personal project costs you: services, the Claude usage and your time.'
          : 'What this project cost, the time it took, and the invoice for the client.'}
      </p>
      <div className={styles.stats}>
        <Stat v={`${t.totalHours.toFixed(1)}h`} l="time (Claude working + added)" />
        <Stat v={money(t.claudeUsd)} l="Claude, API value (in your plan)" />
        <Stat v={money(t.services)} l="services and accounts" />
        <Stat v={money(t.services + t.claudeUsd)} l="spent, with Claude" />
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={personal ? undefined : styles.cols}>
        <div>
          <section className={styles.sect} aria-label="Costs">
            <h3>
              <Package size={15} aria-hidden="true" />
              Costs
            </h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Vendor</th>
                  <th>Period</th>
                  <th className={styles.num}>Amount</th>
                  {!personal && <th>Bill</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {office.costs.map((c) => (
                  <tr key={c.id}>
                    <td>{c.item}</td>
                    <td className={styles.dim}>{c.vendor}</td>
                    <td className={styles.dim}>{c.period}</td>
                    <td className={styles.num}>{money(c.amount)}</td>
                    {!personal && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Bill ${c.item} to the client`}
                          checked={c.bill}
                          onChange={(e) => void run(billCost(projectId, c.id, e.target.checked))}
                        />
                      </td>
                    )}
                    <td>
                      <button
                        type="button"
                        className={styles.x}
                        aria-label={`Remove ${c.item}`}
                        onClick={() => void run(removeCost(projectId, c.id))}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Claude usage</td>
                  <td className={styles.dim}>Anthropic</td>
                  <td className={styles.dim}>API value</td>
                  <td className={styles.num}>{money(t.claudeUsd)}</td>
                  {!personal && <td className={styles.dim}>in your rate</td>}
                  <td />
                </tr>
              </tbody>
            </table>
            <AddCost projectId={projectId} personal={personal} onError={setError} />
          </section>
          <section className={styles.sect} aria-label="Time">
            <h3>
              <Clock size={15} aria-hidden="true" />
              Time by stage
            </h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className={styles.num}>Claude working</th>
                  <th className={styles.num}>Added</th>
                </tr>
              </thead>
              <tbody>
                {t.hours.map((h) => (
                  <tr key={h.stage ?? 'none'}>
                    <td>{h.stage ? OFFICE_STAGE_LABEL[h.stage] : 'Other'}</td>
                    <td className={styles.num}>{h.claude.toFixed(1)}h</td>
                    <td className={styles.num}>{h.manual.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td colSpan={2} className={styles.num}>
                    {t.totalHours.toFixed(1)}h
                  </td>
                </tr>
              </tfoot>
            </table>
            {office.time.length > 0 && (
              <ul className={styles.entries}>
                {office.time.map((e) => (
                  <li key={e.id}>
                    {e.date} {e.hours}h {e.stage ? OFFICE_STAGE_LABEL[e.stage] : ''} {e.note}
                    <button
                      type="button"
                      className={styles.x}
                      aria-label={`Remove ${e.hours}h on ${e.date}`}
                      onClick={() => void run(removeTime(projectId, e.id))}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AddTime projectId={projectId} onError={setError} />
          </section>
        </div>
        {!personal && (
          <aside className={styles.invoice} aria-label="Invoice for the client">
            <div className={styles.invHead}>
              <div>
                <h3>Invoice</h3>
                <span className={styles.dim}>{new Date().toLocaleDateString('en-GB')}</span>
              </div>
              <div className={styles.to}>
                <b>{office.client?.name}</b>
                <span className={styles.dim}>{office.client?.contact}</span>
              </div>
            </div>
            <table className={styles.table}>
              <tbody>
                <tr>
                  <td>
                    Design and development
                    <div className={styles.dim}>
                      {t.totalHours.toFixed(1)} h x {money(office.rate)}
                    </div>
                  </td>
                  <td className={styles.num}>{money(t.work)}</td>
                </tr>
                {office.costs
                  .filter((c) => c.bill)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>{c.item}</td>
                      <td className={styles.num}>{money(c.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className={styles.total}>
              <span>Total</span>
              <span>{money(t.invoiceTotal)}</span>
            </div>
            <Rate projectId={projectId} rate={office.rate} onError={setError} />
            <a
              className="btn btn-secondary btn-sm"
              href={`/p/${encodeURIComponent(projectId)}/print/invoice`}
              target="_blank"
              rel="noreferrer"
            >
              <Printer size={13} aria-hidden="true" />
              Export PDF
            </a>
            <p className={styles.dim}>Profit after costs: {money(t.invoiceTotal - t.services)}</p>
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.v}>{v}</div>
      <div className={styles.l}>{l}</div>
    </div>
  );
}

function AddCost({
  projectId,
  personal,
  onError,
}: {
  projectId: string;
  personal: boolean;
  onError(m: string | null): void;
}) {
  const [item, setItem] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const add = async () => {
    const n = Number(amount);
    if (!item.trim() || !Number.isFinite(n) || n < 0) {
      onError('Give the cost a name and an amount.');
      return;
    }
    try {
      await addCost(projectId, {
        item: item.trim(),
        vendor: vendor.trim(),
        amount: n,
        bill: !personal,
      });
      setItem('');
      setVendor('');
      setAmount('');
      onError(null);
    } catch (e) {
      onError(e instanceof ApiFailure ? e.message : 'Could not add the cost.');
    }
  };
  return (
    <form
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <input
        aria-label="Cost"
        placeholder="Item, e.g. Domain"
        value={item}
        onChange={(e) => setItem(e.target.value)}
      />
      <input
        aria-label="Vendor"
        placeholder="Vendor"
        value={vendor}
        onChange={(e) => setVendor(e.target.value)}
      />
      <input
        aria-label="Amount"
        placeholder="Amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="submit" className="btn btn-secondary btn-sm">
        <Plus size={13} aria-hidden="true" />
        Add cost
      </button>
    </form>
  );
}

function AddTime({ projectId, onError }: { projectId: string; onError(m: string | null): void }) {
  const [stage, setStage] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const add = async () => {
    const n = Number(hours);
    if (!Number.isFinite(n) || n <= 0 || n > 24) {
      onError('Give the hours, up to 24.');
      return;
    }
    try {
      const s = OfficeStageSchema.safeParse(stage);
      await addTime(projectId, { stage: s.success ? s.data : null, hours: n, note: note.trim() });
      setHours('');
      setNote('');
      onError(null);
    } catch (e) {
      onError(e instanceof ApiFailure ? e.message : 'Could not add the time.');
    }
  };
  return (
    <form
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>
        <option value="">Other</option>
        {OFFICE_STAGES.map((s) => (
          <option key={s} value={s}>
            {OFFICE_STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <input
        aria-label="Hours"
        placeholder="Hours"
        inputMode="decimal"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
      />
      <input
        aria-label="Note"
        placeholder="Client call"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="btn btn-secondary btn-sm">
        <Plus size={13} aria-hidden="true" />
        Add time
      </button>
    </form>
  );
}

function Rate({
  projectId,
  rate,
  onError,
}: {
  projectId: string;
  rate: number;
  onError(m: string | null): void;
}) {
  const [value, setValue] = useState(String(rate));
  return (
    <form
      className={styles.rate}
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return onError('Give the rate as a number.');
        void officeSettings(projectId, { rate: n }).catch((err: unknown) =>
          onError(err instanceof ApiFailure ? err.message : 'Could not save the rate.'),
        );
      }}
    >
      <label>
        Rate per hour{' '}
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
      </label>
      <button type="submit" className="btn btn-ghost btn-sm">
        Update
      </button>
    </form>
  );
}
