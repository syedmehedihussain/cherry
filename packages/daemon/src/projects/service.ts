import { realpathSync } from 'node:fs';

const safeReal = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};
import path from 'node:path';
import type { ProjectCard } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import type { EventHub } from '../events.ts';
import { writeProjectsMd } from '../magnet/files.ts';
import { notFound } from '../http.ts';
import { expandHome, tildify } from '../paths.ts';
import { checkOpenable, folderId } from './opened.ts';
import { scanProjects } from './scanner.ts';

/**
 * Owns the list of project cards: serves them from the SQLite cache, rescans in the background,
 * and publishes `projects.updated` when anything changed.
 */
export class ProjectService {
  private cards: ProjectCard[] | null = null;
  private scanning: Promise<ProjectCard[]> | null = null;
  private rescanQueued = false;

  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
    private readonly home: string,
  ) {
    const rows = db.prepare('SELECT card_json FROM projects ORDER BY last_worked DESC').all() as {
      card_json: string;
    }[];
    if (rows.length) this.cards = rows.map((r) => JSON.parse(r.card_json) as ProjectCard);
  }

  /** Cached cards right away if we have them; otherwise waits for the first scan. */
  async list(): Promise<ProjectCard[]> {
    if (this.cards) {
      // In the background; a scan that fails (for example at shutdown) keeps the old cards.
      void this.rescan().catch(() => undefined);
      return this.cards;
    }
    return this.rescan();
  }

  /** The cards from the last scan, without starting a new one (waits for the first scan). */
  async known(): Promise<ProjectCard[]> {
    return this.cards ?? this.rescan();
  }

  get(id: string): ProjectCard | undefined {
    return this.cards?.find((c) => c.id === id);
  }

  rescan(): Promise<ProjectCard[]> {
    if (this.scanning) {
      this.rescanQueued = true;
      return this.scanning;
    }
    this.scanning = this.doScan().finally(() => {
      this.scanning = null;
      if (this.rescanQueued) {
        this.rescanQueued = false;
        void this.rescan().catch(() => undefined);
      }
    });
    return this.scanning;
  }

  /** The projects in Cherry, with absolute paths (ADR-0032). */
  listed(): { id: string; dir: string }[] {
    return this.config
      .get()
      .projects.map((f) => ({ id: f.id, dir: path.resolve(expandHome(f.path)) }));
  }

  /**
   * Adds a folder to Cherry's list and returns its id: the folder name, made unique. A folder
   * already listed keeps its id. Open folder, `cherry .` and Start project all come here.
   */
  add(raw: string): { id: string } {
    const dir = checkOpenable(path.resolve(expandHome(raw.trim())), { cherryHome: this.home });
    const list = this.config.get().projects;
    const known = list.find((f) => safeReal(path.resolve(expandHome(f.path))) === dir);
    if (known) return { id: known.id };
    const id = folderId(path.basename(dir), new Set(list.map((f) => f.id)));
    this.config.setProjects([...list, { id, path: tildify(dir) }]);
    this.onListChange?.();
    return { id };
  }

  /** Open folder / `cherry .`: adds the folder and refreshes Home. */
  async open(raw: string): Promise<{ id: string }> {
    const r = this.add(raw);
    await this.rescan();
    return r;
  }

  /** Remove from Cherry: the project leaves the list. Nothing on disk changes. */
  async remove(id: string): Promise<void> {
    const list = this.config.get().projects;
    if (!list.some((f) => f.id === id)) throw notFound(`No project called ${id}`);
    this.config.setProjects(list.filter((f) => f.id !== id));
    this.onListChange?.();
    await this.rescan();
  }

  /** The daemon re-watches the project folders when the list changes. */
  onListChange: (() => void) | null = null;

  private async doScan(): Promise<ProjectCard[]> {
    const cards = await scanProjects(this.listed());
    const changed = JSON.stringify(cards) !== JSON.stringify(this.cards);
    this.cards = cards;
    if (changed) {
      this.save(cards);
      writeProjectsMd(this.home, cards);
      this.hub.publish('projects', 'projects.updated', { cards });
    }
    return cards;
  }

  private save(cards: ProjectCard[]): void {
    const now = Date.now();
    const insert = this.db.prepare(
      'INSERT INTO projects (id, path, card_json, last_worked, scanned_at) VALUES (?, ?, ?, ?, ?)',
    );
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM projects').run();
      for (const c of cards) insert.run(c.id, c.path, JSON.stringify(c), c.lastWorked, now);
    })();
  }
}
