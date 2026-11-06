import type { ProjectCard } from '@cherry/shared';

/** Where a project opens: its page, or Calibrate for a folder not set up and with no office. */
export function projectHref(card: ProjectCard): string {
  return card.state === 'uncalibrated' && !card.office
    ? `/p/${encodeURIComponent(card.id)}/calibrate`
    : `/p/${encodeURIComponent(card.id)}`;
}
