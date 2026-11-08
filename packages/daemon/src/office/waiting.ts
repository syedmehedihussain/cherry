import {
  OFFICE_AGENT,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  type OfficeStage,
  type WaitingItem,
} from '@cherry/shared';
import type { AdrService } from '../adr/service.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import type { ChatService } from '../chat/service.ts';
import type { OfficeService } from './service.ts';

const nnnn = (n: number) => String(n).padStart(4, '0');

/**
 * Everything that waits for the user in one project, in one list (finding #26): the stage gates
 * from office.json, and from each room's chat the pending approvals, the open decision cards and
 * the ADRs it proposed. A background agent's approvals and ADRs from elsewhere have no room.
 */
export function waitingOnYou(
  projectId: string,
  deps: { office: OfficeService; chat: ChatService; approvals: ApprovalBroker; adrs: AdrService },
): WaitingItem[] {
  const office = deps.office.get(projectId);
  const items: WaitingItem[] = [];
  const adrRoom = new Map<number, OfficeStage>();
  const seenApprovals = new Set<string>();
  if (office) {
    const cycle = office.cycles[office.cycles.length - 1]!;
    for (const s of OFFICE_STAGES) {
      const r = cycle.stages[s];
      const label = OFFICE_STAGE_LABEL[s];
      if (r.state === 'active' && r.ready)
        items.push({
          kind: 'sign-off',
          stage: s,
          title: `${label} is ready to sign off`,
          at: null,
        });
      if (r.state === 'waiting')
        items.push({
          kind: 'client',
          stage: s,
          title: `${label} waits for the client's approval`,
          at: r.sentAt ? Date.parse(r.sentAt) : null,
        });
      if (r.state === 'update')
        items.push({ kind: 'update', stage: s, title: `${label} needs an update`, at: null });
      if (r.state === 'locked') continue;
      for (const i of deps.chat.state(projectId, s).items) {
        if (i.kind === 'approval' && i.approval.status === 'pending') {
          seenApprovals.add(i.approval.id);
          items.push({ kind: 'approval', stage: s, title: i.approval.title, at: i.at });
        } else if (i.kind === 'decision' && i.status === 'open')
          items.push({
            kind: 'decision',
            stage: s,
            title: `${OFFICE_AGENT[s]} asks: ${i.card.question}`,
            at: i.at,
          });
        else if (i.kind === 'tool' && i.tool === 'mcp__cherry__propose_decision') {
          const n = Number(/ADR-(\d{4})/.exec(i.meta ?? '')?.[1]);
          if (n) adrRoom.set(n, s);
        }
      }
    }
  }
  for (const a of deps.approvals.list('pending'))
    if (a.projectId === projectId && !seenApprovals.has(a.id))
      items.push({ kind: 'approval', stage: null, title: a.title, at: a.createdAt });
  for (const d of deps.adrs.list(projectId).decisions)
    if (d.state === 'pending')
      items.push({
        kind: 'adr',
        stage: adrRoom.get(d.number) ?? null,
        title: `ADR-${nnnn(d.number)} ${d.title}`,
        at: null,
      });
  return items;
}
