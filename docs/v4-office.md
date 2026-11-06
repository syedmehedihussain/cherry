# V4 — The Office: Cherry works like a software company

Written 2026-11-06 from the user's brief. This page is the plan. The decision is
[ADR-0052](adr/0052-the-office-gated-stages.md). Tasks go in [`roadmap.md`](roadmap.md) under
**V4** (accepted 2026-11-06).

## Why

V3 (ADR-0045) gave Cherry four stages that are always open. The user wants Cherry to work
like a real software company that builds an app for a client. Each stage has a staff member
(an agent) who is an expert in that job. The work moves through the stages in order. The
client sees and approves the work at every gate, so there are no surprises at the end and the
code does not need to change because the plan was not clear.

**Example.** A gym called Fitness Master wants a mobile app for its members: subscription,
diet plan, workouts and progress. The user talks to the client, opens Cherry, and starts a
project. The Business Analyst helps him get a clear idea. Then the stages follow, one by one,
until the app is live. After that, the project is in maintenance.

## Rules for the whole office

1. **Agents only work when the user gives them a job.** No agent starts work alone: it does
   not write the SRS, the plan or any code until the user asks. No background runs or
   scheduled jobs. (The user is on a $20 plan; tokens are spent only when he asks.)
2. **Auto mode stays** (ADR-0025). Once the user gives a job ("write the SRS"), the agent can
   finish it without asking him to approve each command, so he does not have to watch every
   step. Deploy, push and publish still always ask.
3. **Stages open in order.** A new project shows only **Idea**. The next stage opens when the
   current one is signed off.
4. **The agent says when a stage is ready; the user signs it off.** The agent writes, for
   example, "The idea is clear. We can start Requirements." The user clicks **Sign off**.
5. **The client approves at every gate.** The user shows the stage's documents to the client
   and records the approval in Cherry (who, date, notes). A stage cannot be signed off without
   a client approval, unless the user marks it "internal only".
6. **Two kinds of documents.** Every stage writes:
   - **Client documents**: plain language, diagrams, no code. For the client to read and
     approve.
   - **Technical documents**: for the next agents (architect, designer, developers, DevOps).
7. **Signed-off stages can still be opened and read.** Changes after sign-off go through
   change control (below).
8. The old rules stay: the browser never touches the disk, and deploy or push always asks.

## The stages and the staff

| # | Stage | Agent (staff) | What the stage does | Client documents | Technical documents |
|---|---|---|---|---|---|
| 1 | **Idea** | Business Analyst | Talk about the idea until the vision is clear: who it is for, the problem, the main features, what is out of scope. | Project brief (vision, users, scope) | Idea notes |
| 2 | **Requirements** | System Analyst | Gather requirements. The agent gives the user questions to ask the client; the user brings back the answers. Feasibility check. | Requirements summary, user stories | SRS (functional and non-functional requirements, use cases), interview log, feasibility notes |
| 3 | **Plan** | System Architect | System analysis and design: architecture, tech stack, data, APIs, scalability, risks, timeline. | Plan summary, simple diagrams, timeline | System design doc, architecture and data diagrams, API spec, ADRs, roadmap |
| 4 | **Design** | UI/UX Designer | Design system and screens (Claude Design). Iterate until the user and client are happy. | Screens and flows to review | Design system, design handoff |
| 5 | **Development** | Development Team | Set up the project (old "Preparation"), build a **first prototype**, show it to the client, then build the full app and connect the backend. | Prototype demo, progress notes | Code, tests, changelog |
| 6 | **Testing** | QA Engineer | Test plan, test runs, bug list, client acceptance test (UAT). | Test summary, UAT sign-off | Test plan, test reports |
| 7 | **Deployment** | DevOps Engineer | CI/CD, environments, secrets, hosting or app-store release. | Release notes, "how to use" guide | CI/CD config, deploy runbook |

Development has an inside gate: the **prototype** must be approved by the client before the
full build starts.

## Project status

The project home shows one status: `Idea` → `Requirements` → `Plan` → `Design` →
`Development` → `Testing` → `Deployment` → **`Live`**.

## The project page

The design is the clickable prototype `design/screens/v4/office-prototype.html` (open it in a
browser; the **Demo** button jumps to any state). It is the source of truth for V4 screens.

- The top shows only the project name. Tabs: **Stages** (Maintenance once Live), **Meeting**,
  **Docs**, **Code**, **Version control**, **Claude usage**, **Invoice** (Costs for a personal
  project).
- **Stages:** the seven stages as square cards with the stage name, its agent and its state:
  **locked**, **active**, **waiting for client**, **signed off**, or **needs update**. The eighth
  card is **Live**. Click a card to open the stage room.
- **Stage room:** the chat with the stage's agent and its documents (Client / Technical), Auto
  mode, Sign off. Each room also has its own **Version control** and **Claude usage** tabs,
  filtered to that stage.
- **Meeting:** every agent with what it has done, what it is on and what it needs from the user;
  an agenda, action items, and questions to one agent or to Magnet. Built from the files, so
  opening it costs no tokens (ADR-0055).
- **Docs:** an Obsidian-like vault of the project's documents only (no code): tree, search, read
  and edit, links and backlinks, outline, graph.
- **Code:** a VS Code-like editor (Monaco, ADR-0048): explorer, tabs, search, terminal panel,
  status bar. Secret files stay blocked.
- **Version control:** branch, staged and changed files, commit message (**Write message** on a
  click), commit as the user, history with the agent and stage of each commit; push always asks.
- **Claude usage:** the 5-hour and weekly limits, the context window, the project's token budget,
  and tokens by stage, agent and model.
- **Invoice:** time by stage, every cost (hosting, domain, store accounts, the Claude share of the
  plan), the total, and the client invoice at the user's hourly rate.
- Under every chat, a status line: Auto mode, model, context window, 5-hour and weekly usage.

## Magnet, the project manager

Magnet is on every project screen (ADR-0056). It answers about progress, costs, time and what
is next, and runs the Meeting. It never gives a job to an agent.

## Personal projects

Same stages (ADR-0057). The user signs off each stage himself; there is no client, no
"waiting for client" and no invoice, only Costs. The Projects page lists **Client projects** and
**Personal projects**.

## Settings, Agents

Each agent is a Markdown file `~/.cherry/agents/<name>.md` with its role, stage, model, tools
and rules. Settings, Agents shows them and lets the user edit them.

## After deployment: Maintenance

When Deployment is signed off, the project is **Live** and the home changes to the
maintenance office:

- **Support**: client requests and questions.
- **QA**: regression checks.
- **Issues**: flag a bug, find issues, triage.
- **Bug fixing**: small fixes go straight to a fix chat with the Development Team.
- **Upgrades**: dependency and platform updates.
- **New version**: "Start v2.0" opens a new cycle (Requirements → Plan → Design →
  Development → Testing → Deployment) for that version. v1 stays live and in maintenance
  while v2 is built.

## Change control

Requirements can change after a later stage has started.

- **Small change** (wording, a small field, a label): the agent edits the document and writes
  a line in the change log. Nothing else changes.
- **Big change** (a new feature, a different data model or architecture): it becomes a
  **change request**.
  1. The Business Analyst writes an impact note: which documents, screens and code it touches.
  2. The user (and the client, if needed) approves or rejects it.
  3. If approved, every affected stage gets a **needs update** flag. The user opens each one
     and its agent syncs it. The flag clears when the user signs that stage off again.
- The agent suggests "small" or "big". The user decides.

## Decided

- State: `_project/office.json`, never committed (ADR-0054).
- Every model call starts from a click, Haiku included (ADR-0055).
- Stage documents: `docs/<stage>/client|technical/` (ADR-0053).

## Open questions

- How client documents are shared with the client: export to PDF, a shared link, or both (o10).
