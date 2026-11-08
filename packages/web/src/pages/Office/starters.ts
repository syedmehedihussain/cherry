import type { OfficeStage } from '@cherry/shared';

/** What the Development Team is asked first, once the design is approved. */
export const BUILD_FROM_HANDOFF =
  'The design is approved. Read design/handoff/README.md, design/handoff/components.md and the screens in design/handoff/screens/, then the roadmap. Build the shared components first, then the first roadmap task, to match the screens. Use design/handoff/tokens.css.';

/**
 * The first job of each room, from what the stage before it signed off (findings #15, #38). The
 * empty room offers it; a click puts it in the box and nothing is sent (ADR-0055). Idea gets its
 * job from New project.
 */
export const STARTER_JOB: Partial<Record<OfficeStage, string>> = {
  requirements:
    'Read the signed-off brief in docs/idea/. Write the questions for the client in docs/requirements/technical/questions.md, then tell me when they are ready to ask.',
  plan: 'Read the signed-off requirements in docs/requirements/. Write the architecture, the data model, the roadmap in milestones and the test notes, and propose a decision for each real choice.',
  design:
    'Read the requirements and the plan. Write the design system in design/tokens.css, then draw the main screens one by one, numbered in the order a user meets them.',
  development: BUILD_FROM_HANDOFF,
  testing:
    'Read the SRS and the test notes in the plan. Write the test plan, run the tests the project has, add the missing ones for the main flows, and write one issue per bug in docs/issues/.',
  deployment:
    'Read the plan and the test results. Write the deployment plan: where the app runs, the accounts and keys needed, and the steps. Do not create anything or publish yet.',
};
