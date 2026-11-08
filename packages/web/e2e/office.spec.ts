import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// Each test has its own project: the e2e daemon keeps chats and usage by project id.
test.afterEach(() => {
  for (const name of readdirSync(E2E_PROJECTS))
    if (name.startsWith('gym-app-'))
      rmSync(path.join(E2E_PROJECTS, name), { recursive: true, force: true });
});

// V4 o5, o6: a client project starts with only Idea open, on the project page.
test('a new client project opens on the project page with only Idea open', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await expect(page.getByRole('radio', { name: 'Client project' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Create project' })).toBeDisabled();
  await page.getByLabel('Client', { exact: true }).fill('Fitness Master Gym');
  await page.getByLabel('Client contact').fill('Nusrat Jahan');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app for a gym');
  await page.getByLabel('Folder name').fill('gym-app-2');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/p\/gym-app-2$/);
  await expect(page.getByRole('heading', { level: 1, name: 'gym-app-2' })).toBeVisible();
  const status = page.getByRole('list', { name: 'Project status' });
  await expect(status).toContainText('Idea');
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  for (const s of ['Requirements', 'Plan', 'UI/UX design', 'Development', 'Testing', 'Deployment'])
    await expect(page.getByRole('button', { name: `${s}, locked` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live, after Deployment' })).toBeVisible();
  // A locked stage does not open.
  await page.getByRole('button', { name: 'Plan, locked' }).click({ force: true });
  await expect(page).toHaveURL(/\/p\/gym-app-2$/);
  await expect(page.getByRole('region', { name: 'Waiting on you' })).toContainText(
    'Give the Business Analyst a job in Idea.',
  );

  const office = JSON.parse(
    readFileSync(path.join(E2E_PROJECTS, 'gym-app-2', '_project', 'office.json'), 'utf8'),
  );
  expect(office.client).toEqual({ name: 'Fitness Master Gym', contact: 'Nusrat Jahan' });

  // Home lists it under Client projects, on Idea.
  await page.getByRole('link', { name: 'Projects' }).click();
  const client = page.getByRole('region', { name: 'Client projects' });
  await expect(client.getByRole('row', { name: /gym-app-2/ })).toContainText('Fitness Master Gym');
  await expect(client.getByRole('row', { name: /gym-app-2/ })).toContainText('Idea');
});

// V4 o7: a stage room is the agent's chat and the stage's documents.
test('the Idea room: the Business Analyst writes the brief and says the stage is ready', async ({
  page,
}) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-4');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Idea, On-going' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-4\/s\/idea$/);
  await expect(page.getByText('Business Analyst', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign off' })).toBeDisabled();
  const docs = page.getByRole('complementary', { name: 'Documents' });
  await expect(docs.getByRole('tab', { name: /Summary/ })).toBeVisible();
  await expect(docs).toContainText('docs/idea/client/');

  const box = page.getByLabel('Message Claude');
  await box.fill('A gym wants a members app');
  await box.press('Enter');
  await expect(page.getByText('The idea is clear. We can start Requirements.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign off' })).toBeEnabled();
  await expect(docs.getByRole('button', { name: /Fitness Master: members app/ })).toBeVisible();
  await expect(docs.getByRole('heading', { name: 'Fitness Master: members app' })).toBeVisible();
  await page.getByRole('link', { name: 'Office' }).click();
  await expect(page.getByRole('button', { name: 'Idea, ready to sign off' })).toBeVisible();

  // o8: a personal project signs off itself; Requirements opens.
  await page.getByRole('button', { name: 'Idea, ready to sign off' }).click();
  await page.getByRole('button', { name: 'Sign off' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign off Idea' });
  await expect(dialog).toContainText('you approve it yourself');
  await dialog.getByRole('button', { name: 'Sign off' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-4$/);
  await expect(page.getByRole('button', { name: 'Idea, complete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Requirements, On-going' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent' })).toContainText(
    'Idea signed off by you',
  );
});

// o8: a client project waits for the client, then records who approved it.
test('a client stage is sent, waits for the client, then is signed off', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Client', { exact: true }).fill('Fitness Master Gym');
  await page.getByLabel('Client contact').fill('Nusrat Jahan');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-6');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Idea, On-going' }).click();
  const box = page.getByLabel('Message Claude');
  await box.fill('A gym wants a members app');
  await box.press('Enter');
  await expect(page.getByRole('button', { name: 'Sign off' })).toBeEnabled();

  await page.getByRole('button', { name: 'Sign off' }).click();
  let dialog = page.getByRole('dialog', { name: 'Sign off Idea' });
  await expect(dialog).toContainText('Fitness Master: members app');
  await dialog.getByRole('button', { name: 'Sent, waiting for client' }).click();
  await expect(page.getByText('waiting for client')).toBeVisible();

  await page.getByRole('button', { name: 'Record approval' }).click();
  dialog = page.getByRole('dialog', { name: 'Sign off Idea' });
  await expect(dialog.getByLabel('Approved by')).toHaveValue('Nusrat Jahan');
  await dialog.getByLabel('Notes').fill('Approved in the meeting.');
  await dialog.getByRole('button', { name: 'Sign off' }).click();
  await expect(page.getByRole('button', { name: 'Requirements, On-going' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent' })).toContainText(
    'Idea signed off by Nusrat Jahan',
  );
  const office = JSON.parse(
    readFileSync(path.join(E2E_PROJECTS, 'gym-app-6', '_project', 'office.json'), 'utf8'),
  );
  expect(office.cycles[0].stages.idea.signOffs[0]).toMatchObject({
    by: 'Nusrat Jahan',
    notes: 'Approved in the meeting.',
    internal: false,
  });
});

// o9: Requirements prepares the client interview; the answers go back into the file.
test('Requirements: questions for the client, answered and sent back', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-8');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Idea, On-going' }).click();
  const box = page.getByLabel('Message Claude');
  await box.fill('A gym wants a members app');
  await box.press('Enter');
  await page.getByRole('button', { name: 'Sign off' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign off' }).click();
  await page.getByRole('button', { name: 'Requirements, On-going' }).click();

  // An empty room offers its first job; a click puts it in the box, nothing is sent (#15).
  await page.getByRole('button', { name: /^Read the signed-off brief in docs\/idea\// }).click();
  await expect(box).toHaveValue(/^Read the signed-off brief in docs\/idea\//);
  await box.fill('');

  const docs = page.getByRole('complementary', { name: 'Documents' });
  await docs.getByRole('tab', { name: 'Questions' }).click();
  await docs.getByRole('button', { name: 'Ask for the questions' }).click();
  await expect(box).toHaveValue('Write the questions I should ask the client.');
  await box.press('Enter');
  await expect(page.getByText('Two questions are in the Questions tab.')).toBeVisible();
  await expect(docs.getByText('Does each branch have its own trainers?')).toBeVisible();
  await docs.getByLabel('Does each branch have its own trainers?').fill('Own trainers.');
  await docs.getByLabel('Which payment plans do members have?').fill('Monthly and 3 months.');
  await docs.getByRole('button', { name: 'Send answers to the agent' }).click();
  await expect(box).toHaveValue(/2 of 2 questions are answered/);
  expect(
    readFileSync(
      path.join(E2E_PROJECTS, 'gym-app-8', 'docs/requirements/technical/questions.md'),
      'utf8',
    ),
  ).toContain('   Answer: Monthly and 3 months.');
});

// o10: Development waits for the prototype; client documents print to PDF.
test('Development: the prototype gate, and client documents to save as PDF', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Client', { exact: true }).fill('Fitness Master Gym');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-10');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();

  // Jump to Development: the earlier stages signed off in the file.
  const dir = path.join(E2E_PROJECTS, 'gym-app-10');
  const file = path.join(dir, '_project', 'office.json');
  const office = JSON.parse(readFileSync(file, 'utf8'));
  const signed = {
    by: 'you',
    date: '2026-11-06',
    notes: '',
    internal: true,
    at: new Date().toISOString(),
  };
  for (const s of ['idea', 'requirements', 'plan', 'design'])
    office.cycles[0].stages[s] = { state: 'signed', ready: true, sentAt: null, signOffs: [signed] };
  office.cycles[0].stages.development.state = 'active';
  writeFileSync(file, JSON.stringify(office));
  mkdirSync(path.join(dir, 'docs/development/client'), { recursive: true });
  writeFileSync(
    path.join(dir, 'docs/development/client/progress.md'),
    '# Progress\n\nWeek 3: workouts are built.\n',
  );

  await page.goto('/p/gym-app-10/s/development');
  const docs = page.getByRole('complementary', { name: 'Documents' });
  const gate = docs.getByRole('list', { name: 'Prototype gate' });
  await expect(gate).toContainText('Client approves the prototype');
  await docs.getByRole('button', { name: 'Sent to client' }).click();
  await expect(gate).toContainText('Waiting for the answer');
  await docs.getByRole('button', { name: 'Client wants changes' }).click();
  await docs.getByRole('button', { name: 'Sent to client' }).click();
  // The same who, date and notes as a sign-off (finding #42).
  await docs.getByRole('button', { name: 'Record approval' }).click();
  const approval = page.getByRole('dialog', { name: 'Record the prototype approval' });
  await expect(approval.getByLabel('Approved by')).toHaveValue('Fitness Master Gym');
  await approval.getByLabel('Notes').fill('Liked the workouts screen.');
  await approval.getByRole('button', { name: 'Record approval' }).click();
  await expect(gate).toContainText('Approved.');
  expect(JSON.parse(readFileSync(file, 'utf8')).changelog[0].text).toMatch(
    /^Prototype approved by Fitness Master Gym on \d{4}-\d{2}-\d{2}: Liked the workouts screen\.$/,
  );
  await expect(docs.getByRole('button', { name: 'Give the next job' })).toBeVisible();

  await docs.getByRole('tab', { name: /Client/ }).click();
  await expect(docs.getByRole('link', { name: 'Export PDF' })).toHaveAttribute(
    'href',
    '/p/gym-app-10/print/development',
  );
  await page.addInitScript(() => {
    window.print = () => document.body.setAttribute('data-printed', 'yes');
  });
  await page.goto('/p/gym-app-10/print/development');
  await expect(page.getByRole('heading', { level: 1, name: 'gym-app-10' })).toBeVisible();
  await expect(page.getByText('for Fitness Master Gym', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'yes');
});

// o11: Version control on the project page and in a stage room.
test('Version control: changes, commit, and the history by stage', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-12');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();

  const dir = path.join(E2E_PROJECTS, 'gym-app-12');
  mkdirSync(path.join(dir, 'docs/idea/client'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/idea/client/brief.md'), '# Brief\n');

  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Version control' })
    .click();
  await expect(page).toHaveURL(/\/p\/gym-app-12\/vc$/);
  const history = page.getByRole('region', { name: 'History' });
  await expect(history).toBeVisible();

  await page.goto('/p/gym-app-12/s/idea/vc');
  await expect(page.getByRole('radio', { name: 'Idea' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('region', { name: 'History' })).toContainText(
    'No commits for Idea yet.',
  );
  await page.getByRole('radio', { name: 'All' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Stage' }).getByRole('link', { name: 'Idea' }),
  ).toBeVisible();
});

// o12: Claude usage on the project page and in a stage room.
test('Claude usage: the turns by stage and the project budget', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-14');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Idea, On-going' }).click();
  const box = page.getByLabel('Message Claude');
  await box.fill('A gym wants a members app');
  await box.press('Enter');
  await expect(page.getByText('The idea is clear. We can start Requirements.')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Stage' })
    .getByRole('link', { name: 'Claude usage' })
    .click();
  await expect(page).toHaveURL(/\/s\/idea\/usage$/);
  const byStage = page.getByRole('region', { name: 'By stage' });
  await expect(byStage.getByRole('row', { name: /^Idea Business Analyst/ })).toContainText('1');
  await expect(page.getByRole('region', { name: 'Business Analyst' })).toContainText('turns');

  await page.goto('/p/gym-app-14/usage');
  const limits = page.getByRole('region', { name: 'Limits' });
  await expect(limits).toContainText('of 6.00M');
  await limits.getByRole('button', { name: 'Change budget' }).click();
  await limits.getByLabel(/Budget, millions of tokens/).fill('8');
  await limits.getByRole('button', { name: 'Save' }).click();
  await expect(limits).toContainText('of 8.00M');
});

// o13: the Invoice tab: costs, time, and the invoice for the client.
test('Invoice: costs, time and the invoice at the rate', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Client', { exact: true }).fill('Fitness Master Gym');
  await page.getByLabel('Client contact').fill('Nusrat Jahan');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-16');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Invoice' })
    .click();
  await expect(page).toHaveURL(/\/p\/gym-app-16\/invoice$/);

  const costs = page.getByRole('region', { name: 'Costs' });
  await costs.getByLabel('Cost').fill('Domain');
  await costs.getByLabel('Vendor').fill('Namecheap');
  await costs.getByLabel('Amount').fill('14.99');
  await costs.getByRole('button', { name: 'Add cost' }).click();
  await expect(costs.getByRole('row', { name: /Domain/ })).toContainText('$14.99');

  const time = page.getByRole('region', { name: 'Time' });
  await time.getByLabel('Stage').selectOption('idea');
  await time.getByLabel('Hours').fill('2');
  await time.getByLabel('Note').fill('Client call');
  await time.getByRole('button', { name: 'Add time' }).click();
  await expect(time.getByRole('row', { name: /^Idea/ })).toContainText('2.0h');

  const invoice = page.getByRole('complementary', { name: 'Invoice for the client' });
  await expect(invoice).toContainText('Fitness Master Gym');
  // 2 h at $25, plus the domain billed to the client.
  await expect(invoice).toContainText('$64.99');
  await costs.getByLabel('Bill Domain to the client').click();
  await expect(invoice).toContainText('$50.00');
  await invoice.getByLabel('Rate per hour').fill('30');
  await invoice.getByRole('button', { name: 'Update' }).click();
  await expect(invoice).toContainText('$60.00');

  await page.addInitScript(() => {
    window.print = () => document.body.setAttribute('data-printed', 'yes');
  });
  await page.goto('/p/gym-app-16/print/invoice');
  await expect(page.getByRole('heading', { level: 1, name: 'Invoice' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('$60.00');
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'yes');
});

// o14: the Docs tab, a vault of the project's documents.
test('Docs: the tree, links and backlinks, search, graph and a new note', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-18');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  const dir = path.join(E2E_PROJECTS, 'gym-app-18');
  mkdirSync(path.join(dir, 'docs/idea/client'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/requirements/technical'), { recursive: true });
  writeFileSync(
    path.join(dir, 'docs/idea/client/brief.md'),
    '# Project brief\n\n## Users\n\nSee [[SRS]].\n',
  );
  writeFileSync(
    path.join(dir, 'docs/requirements/technical/srs.md'),
    '# SRS\n\nFR-01 renew with bKash.\n',
  );

  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Docs' })
    .click();
  const tree = page.getByRole('complementary', { name: 'Documents' });
  await tree.getByRole('button', { name: 'brief.md' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-18\/docs\/docs\/idea\/client\/brief\.md$/);
  const about = page.getByRole('complementary', { name: 'About this document' });
  await expect(about).toContainText('Users');
  await about.getByRole('button', { name: 'SRS' }).click();
  await expect(page).toHaveURL(/srs\.md$/);
  await expect(about.getByRole('button', { name: 'Project brief' })).toBeVisible();

  await tree.getByLabel('Search documents').fill('bkash');
  await expect(tree.getByRole('button', { name: 'srs.md' })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'brief.md' })).toHaveCount(0);
  await tree.getByLabel('Search documents').fill('');

  await page.getByRole('radio', { name: 'Graph' }).click();
  await page.getByRole('button', { name: 'Open Project brief' }).locator('circle').click();
  await expect(page).toHaveURL(/brief\.md$/);

  await tree.getByRole('button', { name: 'New note' }).click();
  await tree.getByLabel('Note name').fill('Call with Nusrat');
  await tree.getByLabel('Note name').press('Enter');
  await expect(page).toHaveURL(/docs\/notes\/call-with-nusrat\.md$/);
  expect(readFileSync(path.join(dir, 'docs/notes/call-with-nusrat.md'), 'utf8')).toBe(
    '# Call with Nusrat\n\n',
  );
});

// o15: the Code tab, like VS Code: the explorer, file tabs and terminals, no Claude tab.
test('Code: open a file from the explorer, edit it in a tab, close it', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-20');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  const dir = path.join(E2E_PROJECTS, 'gym-app-20');
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src/app.ts'), 'export const app = 1;\n');

  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Code' })
    .click();
  await expect(page).toHaveURL(/\/p\/gym-app-20\/code$/);
  await expect(page.getByText('No file open.')).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Open tabs' });
  await expect(tabs.getByRole('tab', { name: 'Claude' })).toHaveCount(0);

  const files = page.getByRole('complementary', { name: 'Files' });
  await files.getByRole('treeitem', { name: /src/ }).click();
  await files.getByRole('treeitem', { name: /app\.ts/ }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-20\/code\/files\/src\/app\.ts$/);
  await expect(tabs.getByRole('tab', { name: /app\.ts/ })).toHaveAttribute('aria-selected', 'true');
  // Monaco loads with the first file tab; the first load can be slow.
  await expect(page.getByRole('region', { name: 'Contents of src/app.ts' })).toContainText(
    /app\s=\s1/,
    { timeout: 20_000 },
  );

  await tabs.getByRole('button', { name: 'Close app.ts' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-20\/code$/);
  await expect(page.getByText('No file open.')).toBeVisible();
});

// o16: the Meeting tab: the staff at one table, action items, notes, and Ask.
test('Meeting: the staff, action items, notes, and asking an agent', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-22');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Meeting' })
    .click();
  await expect(page).toHaveURL(/\/p\/gym-app-22\/meeting$/);

  const staff = page.getByRole('list', { name: 'Staff' });
  const ba = staff.getByRole('listitem', { name: 'Business Analyst' });
  await expect(ba).toContainText('Waiting for a job.');
  await expect(staff.getByRole('listitem', { name: 'QA Engineer' })).toContainText(
    'Opens when Development is signed off',
  );

  const actions = page.getByRole('region', { name: 'Action items' });
  await actions.getByLabel('New action item').fill('Ask for the bKash keys');
  await actions.getByRole('button', { name: 'Add action item' }).click();
  await expect(actions).toContainText('Ask for the bKash keys');
  await expect(page.getByRole('region', { name: 'Agenda' })).toContainText('1 open action item');

  await page.getByRole('button', { name: 'Save notes' }).click();
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await expect(page.getByText(`docs/meetings/${day}.md`)).toBeVisible();
  const notes = readFileSync(
    path.join(E2E_PROJECTS, 'gym-app-22', `docs/meetings/${day}.md`),
    'utf8',
  );
  expect(notes).toContain('- [ ] Ask for the bKash keys (you)');

  await ba.getByRole('button', { name: 'Ask' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-22\/s\/idea$/);
  await expect(page.getByLabel('Message Claude')).toHaveValue(/Where are we on Idea\?/);
});

// o18: change control: a small change is logged; a big one flags the stages it touches.
test('Change control: a small change, a change request, approve, needs update', async ({
  page,
}) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-24');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  const file = path.join(E2E_PROJECTS, 'gym-app-24', '_project', 'office.json');
  const office = JSON.parse(readFileSync(file, 'utf8'));
  const signed = {
    by: 'you',
    date: '2026-11-06',
    notes: '',
    internal: true,
    at: new Date().toISOString(),
  };
  for (const s of ['idea', 'requirements'])
    office.cycles[0].stages[s] = { state: 'signed', ready: true, sentAt: null, signOffs: [signed] };
  office.cycles[0].stages.plan.state = 'active';
  writeFileSync(file, JSON.stringify(office));

  await page.goto('/p/gym-app-24/s/requirements');
  await page.getByRole('button', { name: 'Request change' }).click();
  let dialog = page.getByRole('dialog', { name: 'Request a change' });
  await dialog.getByLabel('What should change?').fill('Call it membership plan, not package.');
  await dialog.getByRole('button', { name: 'Log the change' }).click();

  await page.getByRole('button', { name: 'Request change' }).click();
  dialog = page.getByRole('dialog', { name: 'Request a change' });
  await dialog.getByRole('radio', { name: 'Big change' }).click();
  await dialog.getByLabel('Title').fill('Family memberships');
  await dialog.getByLabel('What should change?').fill('One account pays for up to 4 members.');
  await expect(dialog.getByRole('checkbox', { name: 'Requirements' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Make change request' }).click();

  await page.getByRole('link', { name: 'Office' }).click();
  await page.getByRole('button', { name: /^Changes/ }).click();
  const changes = page.getByRole('dialog', { name: 'Changes' });
  await expect(changes).toContainText('Call it membership plan, not package.');
  await changes
    .getByRole('listitem', { name: 'CR-001 Family memberships' })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(changes).toContainText('approved');
  await changes.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Requirements, needs update' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Idea, complete' })).toBeVisible();

  await page.getByRole('button', { name: 'Requirements, needs update' }).click();
  await expect(page.getByRole('status')).toContainText('CR-001 Family memberships was approved');
  await page.getByRole('button', { name: 'Ask to sync' }).click();
  await expect(page.getByLabel('Message Claude')).toHaveValue(/Sync this stage with CR-001/);
});

// o19: Deployment signed off: Live, and the project page becomes the maintenance office.
test('Go Live: the moment, then the maintenance office', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-26');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  const file = path.join(E2E_PROJECTS, 'gym-app-26', '_project', 'office.json');
  const office = JSON.parse(readFileSync(file, 'utf8'));
  const signed = {
    by: 'you',
    date: '2026-11-06',
    notes: '',
    internal: true,
    at: new Date().toISOString(),
  };
  for (const s of ['idea', 'requirements', 'plan', 'design', 'development', 'testing'])
    office.cycles[0].stages[s] = { state: 'signed', ready: true, sentAt: null, signOffs: [signed] };
  office.cycles[0].stages.deployment = { state: 'active', ready: true, sentAt: null, signOffs: [] };
  office.cycles[0].devGate = 'approved';
  writeFileSync(file, JSON.stringify(office));

  await page.goto('/p/gym-app-26/s/deployment');
  await page.getByRole('button', { name: 'Sign off' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign off Deployment' });
  await expect(dialog).toContainText('The project goes Live.');
  await dialog.getByRole('button', { name: 'Sign off' }).click();

  const moment = page.getByRole('dialog', { name: 'The project is live' });
  await expect(moment).toContainText('gym-app-26 v1.0 is live');
  await moment.getByRole('button', { name: 'Open the maintenance office' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Project' }).getByRole('link', { name: 'Maintenance' }),
  ).toBeVisible();
  await expect(page.getByText('v1.0 live', { exact: true })).toBeVisible();

  const bugs = page.getByRole('region', { name: 'Bugs' });
  await bugs.getByLabel('Flag a bug').fill('bKash paid but the app says expired');
  await bugs.getByRole('button', { name: 'Flag' }).click();
  await expect(bugs).toContainText('bKash paid but the app says expired');
  await bugs.getByRole('button', { name: 'Fix now' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-26\/s\/development$/);
  await expect(page.getByLabel('Message Claude')).toHaveValue(/Fix issue #1: bKash paid/);

  await page.goto('/p/gym-app-26/stages');
  await expect(page.getByRole('button', { name: 'Live, v1.0 is live' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'The project is live' })).toHaveCount(0);
});

// o20: a new version runs its own cycle next to the live one.
test('New version: Start v2.0 next to the live v1.0', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-28');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  const file = path.join(E2E_PROJECTS, 'gym-app-28', '_project', 'office.json');
  const office = JSON.parse(readFileSync(file, 'utf8'));
  const signed = {
    by: 'you',
    date: '2026-11-06',
    notes: '',
    internal: true,
    at: new Date().toISOString(),
  };
  for (const s of Object.keys(office.cycles[0].stages))
    office.cycles[0].stages[s] = { state: 'signed', ready: true, sentAt: null, signOffs: [signed] };
  office.cycles[0].devGate = 'approved';
  office.cycles[0].liveAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(office));

  await page.goto('/p/gym-app-28');
  await page.getByRole('button', { name: 'Open the maintenance office' }).click();
  await page.getByRole('button', { name: /New version/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a new version' });
  await expect(dialog.getByLabel('Version')).toHaveValue('2.0');
  await dialog.getByLabel('What it is about').fill('Class booking');
  await dialog.getByRole('button', { name: 'Start v2.0' }).click();

  await expect(page).toHaveURL(/\/p\/gym-app-28\/stages$/);
  await expect(page.getByRole('button', { name: 'Idea, from the last version' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Requirements, On-going' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live, v2.0 after Deployment' })).toBeVisible();
  await page.getByRole('link', { name: 'v1.0 live, in maintenance' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app-28\/maintenance$/);
  await expect(page.getByRole('region', { name: 'Version history' })).toContainText(
    'v2.0 Class booking',
  );
  await expect(page.getByRole('button', { name: /New version/ })).toContainText('v2.0 in progress');
});

// Findings #34, #35: one gate in Design. Sign off writes the handoff, then Development opens
// with the Development Team's first message; the Designer's box never gets it.
test('Design sign-off writes the handoff and opens Development with the first message', async ({
  page,
}) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Client', { exact: true }).fill('Fitness Master Gym');
  await page.getByLabel('Client contact').fill('Nusrat Jahan');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-30');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();

  const dir = path.join(E2E_PROJECTS, 'gym-app-30');
  const file = path.join(dir, '_project', 'office.json');
  const office = JSON.parse(readFileSync(file, 'utf8'));
  const signed = {
    by: 'you',
    date: '2026-11-06',
    notes: '',
    internal: true,
    at: new Date().toISOString(),
  };
  for (const s of ['idea', 'requirements', 'plan'])
    office.cycles[0].stages[s] = { state: 'signed', ready: true, sentAt: null, signOffs: [signed] };
  office.cycles[0].stages.design = { state: 'active', ready: true, sentAt: null, signOffs: [] };
  writeFileSync(file, JSON.stringify(office));
  mkdirSync(path.join(dir, 'design', 'screens'), { recursive: true });
  writeFileSync(path.join(dir, 'design', 'screens', 'home.html'), '<title>Home</title><h1>Hi</h1>');

  await page.goto('/p/gym-app-30/s/design');
  const canvas = page.getByRole('region', { name: 'Design canvas' });
  await expect(canvas.getByRole('link', { name: 'Export' })).toBeVisible();
  await expect(canvas.getByRole('button', { name: 'Approve design' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign off' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign off Design' });
  await expect(dialog).toContainText('design/handoff/');
  await expect(page.getByLabel('Message Claude')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Sign off' }).click();

  await expect(page).toHaveURL(/\/p\/gym-app-30\/s\/development$/);
  await expect(page.getByLabel('Message Claude')).toHaveValue(/^The design is approved\./);
  expect(existsSync(path.join(dir, 'design', 'handoff', 'README.md'))).toBe(true);
});

// The agent's task list in the room's chat, ticked off as it works, like the CLI.
test('the stage agent lists its steps and ticks them off in the chat', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app-32');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Idea, On-going' }).click();
  const box = page.getByLabel('Message Claude');
  await box.fill('List the members app screens');
  await box.press('Enter');

  const tasks = page.getByRole('list', { name: 'Tasks, 1 of 3 done' });
  await expect(tasks).toBeVisible();
  await expect(tasks.getByRole('listitem')).toHaveText([
    /^✓Read the brief/,
    /^■List the screens/,
    /^□Write the summary/,
  ]);
  await expect(page.getByRole('status', { name: 'Claude is working' })).toContainText(
    'Listing the screens',
  );

  // Done: one line that opens the finished list.
  await page.getByRole('button', { name: 'Tasks · 3 of 3 done' }).click();
  await expect(
    page.getByRole('list', { name: 'Tasks, 3 of 3 done' }).getByRole('listitem'),
  ).toHaveCount(3);
});
