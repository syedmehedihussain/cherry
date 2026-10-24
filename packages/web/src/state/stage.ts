import { create } from 'zustand';
import { StageSchema, isWorkspaceStage, type Stage, type WorkspaceStage } from '@cherry/shared';

const KEY = 'cherry.stages';

function load(): Record<string, Stage> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, Stage> = {};
    for (const [id, s] of Object.entries(raw)) {
      const parsed = StageSchema.safeParse(s);
      if (parsed.success) out[id] = parsed.data;
    }
    return out;
  } catch {
    return {};
  }
}

/** The open stage tab per project (ADR-0034), remembered in this browser. */
export const useStages = create<{
  stages: Record<string, Stage>;
  set(projectId: string, stage: Stage): void;
}>((set) => ({
  stages: load(),
  set: (projectId, stage) =>
    set((s) => {
      const stages = { ...s.stages, [projectId]: stage };
      try {
        localStorage.setItem(KEY, JSON.stringify(stages));
      } catch {
        // Private window or blocked storage: the choice lasts until reload.
      }
      return { stages };
    }),
}));

/**
 * The project's open stage; Development until the user picks another. A tab kept from before
 * V3 (Preparation, Issues) opens as the stage that took its place (ADR-0045).
 */
export const toWorkspaceStage = (s: Stage | undefined): WorkspaceStage =>
  !s ? 'development' : isWorkspaceStage(s) ? s : s === 'issues' ? 'plan' : 'development';

export const useStage = (projectId: string): WorkspaceStage =>
  useStages((s) => toWorkspaceStage(s.stages[projectId]));
