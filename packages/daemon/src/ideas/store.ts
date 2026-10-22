import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { IdeasFileSchema, type Idea, type IdeaInput, type IdeasFile } from '@cherry/shared';
import { readJsonFile, writeFileAtomic } from '../fsutil.ts';
import { notFound } from '../http.ts';

/**
 * Project ideas for later (ADR-0027), kept in `~/.cherry/ideas.json` so they do not make empty
 * folders in the projects folder. Starting one opens Start project, which deletes it.
 */
export class IdeaStore {
  private readonly file: string;

  constructor(home: string) {
    this.file = path.join(home, 'ideas.json');
  }

  private read(): IdeasFile {
    if (!existsSync(this.file)) return { schema: 1, ideas: [] };
    try {
      const parsed = IdeasFileSchema.safeParse(readJsonFile(this.file));
      if (parsed.success) return parsed.data;
    } catch {
      // Unreadable: fall through.
    }
    // Keep a broken file instead of overwriting it on the next save.
    throw new Error(`${this.file} is not valid. Fix or remove it.`);
  }

  private write(data: IdeasFile): void {
    writeFileAtomic(this.file, `${JSON.stringify(data, null, 2)}\n`, 0o600);
  }

  list(): Idea[] {
    return this.read().ideas;
  }

  add(input: Required<IdeaInput>): Idea {
    const data = this.read();
    const now = new Date().toISOString();
    const idea: Idea = {
      id: `idea_${randomBytes(5).toString('hex')}`,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    data.ideas.unshift(idea);
    this.write(data);
    return idea;
  }

  update(id: string, input: Required<IdeaInput>): Idea {
    const data = this.read();
    const idea = data.ideas.find((i) => i.id === id);
    if (!idea) throw notFound('That idea is gone.');
    idea.name = input.name;
    idea.description = input.description;
    idea.updatedAt = new Date().toISOString();
    this.write(data);
    return idea;
  }

  remove(id: string): void {
    const data = this.read();
    const next = data.ideas.filter((i) => i.id !== id);
    if (next.length === data.ideas.length) throw notFound('That idea is gone.');
    this.write({ ...data, ideas: next });
  }
}
