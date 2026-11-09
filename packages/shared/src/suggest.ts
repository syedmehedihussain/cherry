/**
 * Which skills or specialists fit a job, by the words they share (ADR-0062). No model call
 * (ADR-0055): the job text is matched against each item's name and description.
 */

const STOP = new Set(
  'about add after again all also always and any are before being both but can cannot does done each for from get had has have her here his how into its just let like make may more most must need never new not now one only other our out over own put same see set should some such than that the their them then there these they this those through too two use used uses using very was way what when where which while who why will with without would yes yet you your'.split(
    ' ',
  ),
);

/** Lower-case word stems of three letters or more, without the most common words. */
export function keywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  return new Set(words.filter((w) => !STOP.has(w)).map(stem));
}

function stem(w: string): string {
  return w.replace(/(ing|ers|er|es|ed|s)$/, '').slice(0, 8);
}

export interface Suggestible {
  name: string;
  description: string;
}

/** The items that fit the text best: a word in the name counts twice. Best first. */
export function suggest<T extends Suggestible>(text: string, items: T[], max = 3, min = 2): T[] {
  const job = keywords(text);
  if (!job.size) return [];
  return items
    .map((item) => {
      const name = keywords(item.name.replace(/[-_:]/g, ' '));
      const desc = keywords(item.description);
      let score = 0;
      for (const w of job) score += (name.has(w) ? 2 : 0) + (desc.has(w) ? 1 : 0);
      return { item, score };
    })
    .filter((s) => s.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.item);
}
