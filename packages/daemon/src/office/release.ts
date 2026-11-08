import { z } from 'zod';
import type { CustomTool } from '../claude/runner.ts';

export const RELEASE_TOOL = 'confirm_release';

/**
 * Commands that make a repository or put the app where others can reach it (V4 section 4,
 * ADR-0060). In the Deployment room they wait for the user's go-ahead on a release card.
 */
const PUBLISH =
  /\b(gh\s+repo\s+(create|edit)|git\s+push|gh\s+(release|pages|workflow\s+run)|gh\s+api\s+\S*pages|netlify\s+deploy|vercel(\s+(deploy|--prod)|\s*$)|firebase\s+deploy|wrangler\s+(deploy|publish|pages)|surge\b|fly\s+deploy|flyctl\s+deploy|heroku\s+|(npm|pnpm|yarn)\s+publish)\b/;

export const isPublishCommand = (command: string): boolean => PUBLISH.test(command);

/** Refuses publish commands until the release card was approved in this turn. */
export function releaseGuard(approved: () => boolean) {
  return (tool: string, input: Record<string, unknown>): string | null => {
    if (tool !== 'Bash' || typeof input.command !== 'string') return null;
    if (!isPublishCommand(input.command) || approved()) return null;
    return `This creates a repository or publishes the app. Call ${RELEASE_TOOL} first with the owner, public or private, what is pushed and where it goes live; the user approves it on a card. Then run the command again.`;
  };
}

const ReleaseSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  visibility: z.enum(['public', 'private']),
  what: z.string().min(1).max(300),
  where: z.string().min(1).max(200),
});

/**
 * The release card (V4 section 4): before anything leaves the computer, the user sees who owns
 * it, public or private, what is pushed and where it goes live, and says Publish or Not now.
 */
export function releaseTool(
  ask: (card: unknown) => Promise<{ ok: true; text: string } | { ok: false; error: string }>,
  onApproved: () => void,
): CustomTool {
  return {
    name: RELEASE_TOOL,
    description:
      'Ask the user to approve a release before you create a repository, push, or publish. Show the GitHub owner, the repository, public or private, what is pushed, and where it goes live. Publishing commands are refused until the user approves.',
    shape: {
      owner: z.string().describe('GitHub account or organisation that will own the repository'),
      repo: z.string().describe('Repository name'),
      visibility: z.enum(['public', 'private']).describe('public or private'),
      what: z.string().describe('What is pushed or published, in one line'),
      where: z.string().describe('Where it goes live (a URL or host)'),
    },
    handler: async (args) => {
      const parsed = ReleaseSchema.safeParse(args);
      if (!parsed.success)
        return {
          ok: false,
          text: `Not shown, fix it and call ${RELEASE_TOOL} again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        };
      const r = parsed.data;
      const reply = await ask({
        topic: 'Release',
        question: `Publish ${r.what}?`,
        context: `${r.visibility === 'public' ? 'Public' : 'Private'} repository ${r.owner}/${r.repo}. Goes live at ${r.where}.`,
        options: [
          {
            id: 'publish',
            title: 'Publish',
            tradeoff:
              r.visibility === 'public'
                ? 'It leaves this computer and anyone can see the code.'
                : 'It leaves this computer.',
          },
          {
            id: 'not-now',
            title: 'Not now',
            tradeoff: 'Nothing is created or pushed.',
            recommended: true,
          },
        ],
        allowCustom: false,
      });
      if (!reply.ok) return { ok: false, text: reply.error };
      if (reply.text !== 'User chose: Publish')
        return {
          ok: true,
          text: 'The user said not now. Do not create, push or publish anything.',
        };
      onApproved();
      return {
        ok: true,
        text: `Approved: ${r.visibility} ${r.owner}/${r.repo}, ${r.what}, live at ${r.where}. Go ahead for this turn only.`,
      };
    },
  };
}
