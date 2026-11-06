import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  Undo2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { relativeTime, VaultSchema, type VaultDoc } from '@cherry/shared';
import { api, ApiFailure } from '../../api/client.ts';
import { queryClient } from '../../api/queries.ts';
import { useNow } from '../../lib/useNow.ts';
import { DocReader } from '../Workspace/plan/PlanStage.tsx';
import styles from './Vault.module.css';

export const vaultKey = (id: string) => ['vault', id] as const;

/**
 * The Docs tab (V4 o14): the project's documents like an Obsidian vault, never code. A tree with
 * search, the document to read and edit, its outline, links and backlinks, and a graph.
 */
export function Vault({ projectId, open }: { projectId: string; open: string | null }) {
  const now = useNow(60_000);
  const navigate = useNavigate();
  const vault = useQuery({
    queryKey: vaultKey(projectId),
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/office/vault`,
        undefined,
        VaultSchema,
      ),
  });
  const docs = useMemo(() => vault.data?.docs ?? [], [vault.data]);
  const [q, setQ] = useState('');
  const [graph, setGraph] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const shown =
    open ?? docs.find((d) => /readme\.md$/i.test(d.path))?.path ?? docs[0]?.path ?? null;
  const doc = docs.find((d) => d.path === shown) ?? null;
  const go = (path: string) => {
    setGraph(false);
    void navigate(`/p/${encodeURIComponent(projectId)}/docs/${path}`);
  };
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? docs.filter((d) => `${d.title} ${d.path} ${d.text}`.toLowerCase().includes(s))
      : docs;
  }, [docs, q]);
  const back = doc ? docs.filter((d) => d.links.includes(doc.path)) : [];
  const byPath = new Map(docs.map((d) => [d.path, d]));

  // The tree: folders from the paths.
  type Node = { dirs: Map<string, Node>; files: VaultDoc[] };
  const tree: Node = { dirs: new Map(), files: [] };
  for (const d of hits) {
    const parts = d.path.split('/');
    let n = tree;
    for (const p of parts.slice(0, -1)) {
      if (!n.dirs.has(p)) n.dirs.set(p, { dirs: new Map(), files: [] });
      n = n.dirs.get(p)!;
    }
    n.files.push(d);
  }
  const walk = (n: Node, prefix: string, depth: number): React.ReactNode[] => [
    ...[...n.dirs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([name, child]) => {
        const key = prefix + name;
        const isClosed = closed[key] && !q;
        return [
          <li key={key}>
            <button
              type="button"
              className={styles.dir}
              style={{ paddingLeft: 8 + depth * 12 }}
              aria-expanded={!isClosed}
              onClick={() => setClosed({ ...closed, [key]: !closed[key] })}
            >
              {isClosed ? (
                <ChevronRight size={12} aria-hidden="true" />
              ) : (
                <ChevronDown size={12} aria-hidden="true" />
              )}
              <Folder size={13} aria-hidden="true" />
              {name}
            </button>
          </li>,
          ...(isClosed ? [] : walk(child, `${key}/`, depth + 1)),
        ];
      }),
    ...n.files.map((d) => (
      <li key={d.path}>
        <button
          type="button"
          className={styles.file}
          style={{ paddingLeft: 26 + depth * 12 }}
          aria-current={d.path === shown || undefined}
          title={d.title}
          onClick={() => go(d.path)}
        >
          <FileText size={13} aria-hidden="true" />
          {d.path.split('/').pop()}
        </button>
      </li>
    )),
  ];

  return (
    <div className={styles.vault}>
      <aside className={styles.tree} aria-label="Documents">
        <div className={styles.tools}>
          <input
            aria-label="Search documents"
            placeholder="Search documents"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <NewNote projectId={projectId} onCreated={go} />
        </div>
        <ul className={styles.list}>{walk(tree, '', 0)}</ul>
        <div className={styles.foot}>
          {hits.length} document{hits.length === 1 ? '' : 's'}
          {vault.data?.truncated ? ', first 500' : ''}
          <span>no code here</span>
        </div>
      </aside>
      <section className={styles.main} aria-label="Document">
        <div className={styles.modes} role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={!graph} onClick={() => setGraph(false)}>
            Read
          </button>
          <button type="button" role="radio" aria-checked={graph} onClick={() => setGraph(true)}>
            Graph
          </button>
        </div>
        {graph ? (
          <Graph docs={docs} current={shown} onOpen={go} />
        ) : shown ? (
          <div className={styles.reader}>
            <DocReader key={shown} projectId={projectId} path={shown} now={now} extra={false} />
          </div>
        ) : (
          <p className={styles.empty}>
            No documents yet. The stage agents write them in docs/, or make a note.
          </p>
        )}
      </section>
      <aside className={styles.side} aria-label="About this document">
        {doc && (
          <>
            <div>
              <h4>Outline</h4>
              {doc.headings.length ? (
                <ol className={styles.outline}>
                  {doc.headings.map((h, i) => (
                    <li key={i} data-level={h.level}>
                      {h.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.dim}>No headings</p>
              )}
            </div>
            <div>
              <h4>Links {doc.links.length}</h4>
              {doc.links.map((l) => (
                <button key={l} type="button" className={styles.link} onClick={() => go(l)}>
                  <ArrowUpRight size={12} aria-hidden="true" />
                  {byPath.get(l)?.title ?? l}
                </button>
              ))}
            </div>
            <div>
              <h4>Backlinks {back.length}</h4>
              {back.map((b) => (
                <button
                  key={b.path}
                  type="button"
                  className={styles.link}
                  onClick={() => go(b.path)}
                >
                  <Undo2 size={12} aria-hidden="true" />
                  {b.title}
                </button>
              ))}
            </div>
            <div>
              <h4>Info</h4>
              <p className={styles.dim}>
                {doc.words} words, changed {relativeTime(doc.mtime, now)}
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function NewNote({ projectId, onCreated }: { projectId: string; onCreated(path: string): void }) {
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (name === null)
    return (
      <button
        type="button"
        className={styles.icon}
        aria-label="New note"
        title="New note"
        onClick={() => setName('')}
      >
        <FilePlus size={15} aria-hidden="true" />
      </button>
    );
  const create = async () => {
    try {
      const r = await api(
        'POST',
        `/api/projects/${encodeURIComponent(projectId)}/office/notes`,
        { name },
        z.object({ path: z.string() }),
      );
      await queryClient.invalidateQueries({ queryKey: vaultKey(projectId) });
      setName(null);
      onCreated(r.path);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not make the note.');
    }
  };
  return (
    <form
      className={styles.newNote}
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <input
        aria-label="Note name"
        autoFocus
        placeholder="Note name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}

/** Every document as a dot, a line for each link; client documents on the inner ring. */
function Graph({
  docs,
  current,
  onOpen,
}: {
  docs: VaultDoc[];
  current: string | null;
  onOpen(path: string): void;
}) {
  const W = 760;
  const H = 560;
  const inner = docs.filter((d) => d.path.includes('/client/'));
  const outer = docs.filter((d) => !d.path.includes('/client/'));
  const pos = new Map<string, [number, number]>();
  const ring = (list: VaultDoc[], r: number) =>
    list.forEach((d, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
      pos.set(d.path, [W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r * 0.8]);
    });
  ring(inner, 140);
  ring(outer, inner.length ? 250 : 200);
  const edges = docs
    .flatMap((d) => d.links.map((l) => [d.path, l] as const))
    .filter(([a, b]) => pos.has(a) && pos.has(b));
  return (
    <svg className={styles.graph} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Document graph">
      {edges.map(([a, b]) => (
        <line
          key={`${a}>${b}`}
          x1={pos.get(a)![0]}
          y1={pos.get(a)![1]}
          x2={pos.get(b)![0]}
          y2={pos.get(b)![1]}
          data-hi={a === current || b === current || undefined}
        />
      ))}
      {docs.map((d) => {
        const [x, y] = pos.get(d.path)!;
        return (
          <g
            key={d.path}
            onClick={() => onOpen(d.path)}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(d.path)}
            tabIndex={0}
            role="button"
            aria-label={`Open ${d.title}`}
          >
            <circle
              cx={x}
              cy={y}
              r={6 + Math.min(6, d.links.length * 1.5)}
              data-client={d.path.includes('/client/') || undefined}
              data-current={d.path === current || undefined}
            />
            <text x={x + 11} y={y + 4}>
              {d.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
