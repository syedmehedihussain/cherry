# Prompt for Claude Design — Cherry V4 "The Office"

Design the full UI for **Cherry V4**, a desktop web app. Build every screen and make it a clickable prototype.

## What Cherry is
Cherry is a local workspace that runs Claude Code on my computer to build software projects. In V4, Cherry works like a **software company building an app for a client**. I am the boss and I talk to the client. Cherry is my office, and the AI agents are my staff. A project moves through the classic software engineering stages in order. The client sees and approves the work at every gate, so there are no surprises at the end.

**Example project used in every screen:** **Fitness Master**, a gym that wants a mobile app (Expo + React Native, iOS and Android) where its members track their subscription, diet plan, workouts and progress.

## The stages and the staff
| # | Stage | Agent | What happens | Client documents | Technical documents |
|---|---|---|---|---|---|
| 1 | Idea | Business Analyst | Talk until the vision is clear | Project brief | Idea notes |
| 2 | Requirements | System Analyst | Agent gives me questions to ask the client; I bring back the answers; feasibility check | Requirements summary, user stories | SRS, interview log, feasibility notes |
| 3 | Plan | System Architect | Architecture, tech stack, data, APIs, scalability, risks, timeline | Plan summary, simple diagrams, timeline | System design doc, diagrams, API spec, ADRs, roadmap |
| 4 | Design | UI/UX Designer | Design system and screens | Screens and flows to review | Design system, handoff |
| 5 | Development | Development Team | Project setup → first prototype → client approves prototype → full build and backend | Prototype demo, progress notes | Code, tests, changelog |
| 6 | Testing | QA Engineer | Test plan, test runs, bug list, client acceptance test (UAT) | Test summary, UAT sign-off | Test plan, reports |
| 7 | Deployment | DevOps Engineer | CI/CD, environments, app-store release | Release notes, user guide | CI/CD config, deploy runbook |

## Rules the UI must show
- **Stages unlock in order.** A new project has only **Idea** open. The other stages are visibly locked.
- **Gates.** When the work is done, the agent says "This stage is ready." I click **Sign off**. A modal records the client approval (client name, date, notes, attached documents), or I tick "internal only". Then the next stage unlocks, with a satisfying moment.
- **Agents only work when I give them a job.** There is an **Auto mode** toggle: once I give a job ("write the SRS"), the agent finishes it without asking me to approve each command. Deploy, push and publish always ask.
- **Two kinds of documents** in every stage: **Client documents** (plain language, diagrams, made to share) and **Technical documents** (for the next agents).
- **Change control.** I can open any signed-off stage and request a change.
  - **Small change:** edit the document and add a line to the change log.
  - **Big change:** a change request with an impact note ("touches Plan: auth, data model; Design: 3 screens"). After I approve it, the affected stages get a **needs update** flag until they are signed off again.
- **Stage states:** locked, active, waiting for client, signed off, needs update.
- **Project status:** Idea → Requirements → Plan → Design → Development → Testing → Deployment → **Live**.

## Screens to design
1. **Projects list (app home):** the projects, each with its client, status and current stage, plus "New project". (Keep this simple; it will be redesigned later.)
2. **New project:** project name, client name, one line about the idea.
3. **Project home: the office.** There are no stage tabs. The seven stages are **windows/rooms** that I open. Each one shows the stage, its agent, its state, the last activity and the documents count. The project status, client and version (v1.0) sit at the top. This screen should feel like walking into my office and seeing my team at their desks. Show it in three states: brand-new (only Idea open), mid-project (Plan active, two signed off, one waiting for client), and with a "needs update" flag.
4. **Stage room:** the main work screen. Show it for Idea, Requirements and Plan:
   - **Centre:** the chat with the stage's agent. Show a realistic Fitness Master conversation. The chat must look like the **Claude Code CLI**: monospace, calm, tool work folded into single lines.
   - **Side:** the documents panel with **Client / Technical** tabs and a document preview (the SRS, the system design with an architecture diagram).
   - **Top:** the stage name, the agent, the Auto mode toggle, a "Sign off" button (disabled until the agent says the stage is ready), and the way back to the office.
   - **Requirements extra:** a "Questions for the client" checklist that I fill in after the interview.
5. **Sign-off modal:** the client approval form and the "internal only" option, then the unlock moment.
6. **Change request flow:** choose small or big, the impact note, approve, and the office with the affected stages flagged.
7. **Development room:** a file explorer, the agent chat and the code editor, plus a **Prototype** step with "Send to client" and an approval inside the stage.
8. **Testing room:** the test plan, the run results, the bug list and the UAT checklist.
9. **Deployment room:** the CI/CD pipeline view, the environments (staging, production), the app-store release checklist, and a deploy button that always asks first.
10. **Go live:** after Deployment is signed off, the project status becomes **Live** and the whole office changes.
11. **Maintenance office (after Live):** a different home with rooms for **Support** (client requests), **QA**, **Issues** (flag a bug, triage), **Bug fixing**, **Upgrades** and **New version**. Also show the live app's health and the version history.
12. **New version:** "Start v2.0" opens a new cycle (Requirements → Deployment) shown next to live v1, which stays in maintenance.

## Look and feel
- A dark developer tool, calm and minimal. Show only what the screen needs; everything else is one click away. No clutter, no walls of cards and pills.
- **Colours:**
  - Page `#0B0B0C`, panels `#141416`, inner boxes `#1C1C1F`, selected `#26262A`, hairlines `rgba(255,255,255,0.08)`.
  - Text `#EDEDEF` / `#A1A1AA` / `#85858F`.
  - Accent blue `#5B8DEF` for focus, links and the current stage.
  - Status: success `#3FB950`, warning `#D29922` (waiting for client, needs update), danger `#F85149`, purple `#A371F7` for AI edits.
- **Brand** (logo and wordmark only, never UI states): cherry burgundy `#5A0F17`, cream `#F5EEE4`, coral `#E07A5F`, leaf `#2F5D3A`. The wordmark is `cherry_` in lower-case JetBrains Mono, with a blinking coral underscore cursor.
- **Fonts:** Geist for the UI, Geist Mono / JetBrains Mono for chat and code.
- Give each agent a simple, distinct avatar or icon and a role title, so the office feels like a team. Keep it professional, not cartoonish.
- Accessible contrast (WCAG AA), visible keyboard focus.

## Deliverables
- All the screens above as one connected, clickable prototype using the Fitness Master data.
- A small **component sheet**: stage window (all 5 states), agent avatar set, chat message types, document card, sign-off modal, change-request card, status badges.
- A short **handoff note** listing the screens, components and states, so the Development agent can build it in Cherry's React code.
