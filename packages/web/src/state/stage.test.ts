import { describe, expect, it } from 'vitest';
import { nextStage } from '../api/stages.ts';
import { toWorkspaceStage } from './stage.ts';

describe('V3 stages (ADR-0045)', () => {
  it('opens a remembered Preparation or Issues tab as a V3 stage', () => {
    expect(toWorkspaceStage('preparation')).toBe('development');
    expect(toWorkspaceStage('issues')).toBe('plan');
    expect(toWorkspaceStage('design')).toBe('design');
    expect(toWorkspaceStage(undefined)).toBe('development');
  });

  it('moves through the four stages; Deployment is last', () => {
    expect(nextStage('plan')).toBe('design');
    expect(nextStage('design')).toBe('development');
    expect(nextStage('development')).toBe('deployment');
    expect(nextStage('deployment')).toBeNull();
  });
});
