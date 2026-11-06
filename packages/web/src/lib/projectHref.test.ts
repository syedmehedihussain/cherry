import { describe, expect, it } from 'vitest';
import type { ProjectCard } from '@cherry/shared';
import { projectHref } from './projectHref.ts';

const card = (over: Partial<ProjectCard>): ProjectCard => ({
  id: 'gym app',
  name: 'gym app',
  path: '/p',
  state: 'ready',
  phase: null,
  summary: '',
  stack: [],
  nextStep: null,
  leftOff: null,
  git: null,
  lastWorked: null,
  projectJsonError: false,
  missing: false,
  office: null,
  ...over,
});

describe('projectHref', () => {
  it('opens a project, Calibrate for a folder not set up, and the page for one with an office', () => {
    expect(projectHref(card({}))).toBe('/p/gym%20app');
    expect(projectHref(card({ state: 'uncalibrated' }))).toBe('/p/gym%20app/calibrate');
    expect(
      projectHref(
        card({
          state: 'uncalibrated',
          office: {
            kind: 'personal',
            client: null,
            version: '1.0',
            stage: 'idea',
            stages: [],
            live: false,
          },
        }),
      ),
    ).toBe('/p/gym%20app');
  });
});
