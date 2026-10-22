import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { ProjectCard } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import type { EventHub } from '../events.ts';
import { writeProjectsMd } from '../magnet/files.ts';
import { notFound } from '../http.ts';
import { expandHome, tildify } from '../paths.ts';
import { checkOpenable, folderId } from './opened.ts';
import { listProjectDirs, scanProjects } from './scanner.ts';

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

  /** Opened folders with absolute paths (ADR-0031). */
  opened(): { id: string; dir: string }[] {
    return this.config
      .get()
      .openFolders.map((f) => ({ id: f.id, dir: path.resolve(expandHome(f.path)) }));
  }

  /**
   * Open folder / `cherry .`: adds a folder from anywhere to Home. A direct child of the
   * projects folder is already a project; its id comes back unchanged.
   */
  async open(raw: string): Promise<{ id: string }> {
    const projectsDir = this.config.projectsDir();
    const target = path.resolve(expandHome(raw.trim()));
    let realProjects = projectsDir;
    try {
      realProjects = realpathSync(projectsDir);
    } catch {
      // not there yet
    }
    let realTarget = target;
    try {
      realTarget = realpathSync(target);
    } catch {
      // checkOpenable says it is not a folder
    }
    if (path.dirname(realTarget) === realProjects && !path.basename(realTarget).startsWith('.')) {
      await this.rescan();
      return { id: path.basename(realTarget) };
    }
    const dir = checkOpenable(target, { projectsDir, cherryHome: this.home });
    const list = this.config.get().openFolders;
    const known = list.find((f) => path.resolve(expandHome(f.path)) === dir);
    if (known) return { id: known.id };
    const taken = new Set([
      ...listProjectDirs(projectsDir, []).map((d) => path.basename(d)),
      ...list.map((f) => f.id),
    ]);
    const id = folderId(path.basename(dir), taken);
    this.config.setOpenFolders([...list, { id, path: tildify(dir) }]);
    this.onOpenedChange?.();
    await this.rescan();
    return { id };
  }

  /** Remove from list: Home forgets the folder. Nothing on disk changes. */
  async close(id: string): Promise<void> {
    const list = this.config.get().openFolders;
    if (!list.some((f) => f.id === id)) throw notFound(`${id} was not opened from another folder.`);
    this.config.setOpenFolders(list.filter((f) => f.id !== id));
    this.onOpenedChange?.();
    await this.rescan();
  }

  /** The daemon re-watches opened folders when the list changes. */
  onOpenedChange: (() => void) | null = null;

  private async doScan(): Promise<ProjectCard[]> {
    const cfg = this.config.get();
    const cards = await scanProjects(this.config.projectsDir(), cfg.scan.ignore, this.opened());
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
