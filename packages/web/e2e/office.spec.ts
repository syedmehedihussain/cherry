import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.afterEach(() => rmSync(path.join(E2E_PROJECTS, 'gym-app'), { recursive: true, force: true }));

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
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/p\/gym-app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'gym-app' })).toBeVisible();
  const status = page.getByRole('list', { name: 'Project status' });
  await expect(status).toContainText('Idea');
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  for (const s of ['Requirements', 'Plan', 'UI/UX design', 'Development', 'Testing', 'Deployment'])
    await expect(page.getByRole('button', { name: `${s}, locked` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live, after Deployment' })).toBeVisible();
  // A locked stage does not open.
  await page.getByRole('button', { name: 'Plan, locked' }).click({ force: true });
  await expect(page).toHaveURL(/\/p\/gym-app$/);
  await expect(page.getByRole('region', { name: 'Waiting on you' })).toContainText(
    'Give the Business Analyst a job in Idea.',
  );

  const office = JSON.parse(
    readFileSync(path.join(E2E_PROJECTS, 'gym-app', '_project', 'office.json'), 'utf8'),
  );
  expect(office.client).toEqual({ name: 'Fitness Master Gym', contact: 'Nusrat Jahan' });

  // Home lists it under Client projects, on Idea.
  await page.getByRole('link', { name: 'Projects' }).click();
  const client = page.getByRole('region', { name: 'Client projects' });
  await expect(client.getByRole('row', { name: /gym-app/ })).toContainText('Fitness Master Gym');
  await expect(client.getByRole('row', { name: /gym-app/ })).toContainText('Idea');
});

// V4 o7: a stage room is the agent's chat and the stage's documents.
test('the Idea room: the Business Analyst writes the brief and says the stage is ready', async ({
  page,
}) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('textbox', { name: 'Idea' }).fill('A members app');
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Idea, On-going' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app\/s\/idea$/);
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
  await expect(page).toHaveURL(/\/p\/gym-app$/);
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
  await page.getByLabel('Folder name').fill('gym-app');
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
    readFileSync(path.join(E2E_PROJECTS, 'gym-app', '_project', 'office.json'), 'utf8'),
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
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('button', { name: 'Idea, On-going' }).click();
  const box = page.getByLabel('Message Claude');
  await box.fill('A gym wants a members app');
  await box.press('Enter');
  await page.getByRole('button', { name: 'Sign off' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign off' }).click();
  await page.getByRole('button', { name: 'Requirements, On-going' }).click();

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
      path.join(E2E_PROJECTS, 'gym-app', 'docs/requirements/technical/questions.md'),
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
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();

  // Jump to Development: the earlier stages signed off in the file.
  const dir = path.join(E2E_PROJECTS, 'gym-app');
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

  await page.goto('/p/gym-app/s/development');
  const docs = page.getByRole('complementary', { name: 'Documents' });
  const gate = docs.getByRole('list', { name: 'Prototype gate' });
  await expect(gate).toContainText('Client approves the prototype');
  await docs.getByRole('button', { name: 'Sent to client' }).click();
  await expect(gate).toContainText('Waiting for the answer');
  await docs.getByRole('button', { name: 'Client wants changes' }).click();
  await docs.getByRole('button', { name: 'Sent to client' }).click();
  await docs.getByRole('button', { name: 'Record approval' }).click();
  await expect(gate).toContainText('Approved.');
  await expect(docs.getByRole('button', { name: 'Give the next job' })).toBeVisible();

  await docs.getByRole('tab', { name: /Client/ }).click();
  await expect(docs.getByRole('link', { name: 'Export PDF' })).toHaveAttribute(
    'href',
    '/p/gym-app/print/development',
  );
  await page.addInitScript(() => {
    window.print = () => document.body.setAttribute('data-printed', 'yes');
  });
  await page.goto('/p/gym-app/print/development');
  await expect(page.getByRole('heading', { level: 1, name: 'gym-app' })).toBeVisible();
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
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();

  const dir = path.join(E2E_PROJECTS, 'gym-app');
  mkdirSync(path.join(dir, 'docs/idea/client'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/idea/client/brief.md'), '# Brief\n');

  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Version control' })
    .click();
  await expect(page).toHaveURL(/\/p\/gym-app\/vc$/);
  const history = page.getByRole('region', { name: 'History' });
  await expect(history).toBeVisible();

  await page.goto('/p/gym-app/s/idea/vc');
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
  await page.getByLabel('Folder name').fill('gym-app');
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

  await page.goto('/p/gym-app/usage');
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
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Invoice' })
    .click();
  await expect(page).toHaveURL(/\/p\/gym-app\/invoice$/);

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
  await page.goto('/p/gym-app/print/invoice');
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
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  const dir = path.join(E2E_PROJECTS, 'gym-app');
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
  await expect(page).toHaveURL(/\/p\/gym-app\/docs\/docs\/idea\/client\/brief\.md$/);
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
  await page.getByLabel('Folder name').fill('gym-app');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  const dir = path.join(E2E_PROJECTS, 'gym-app');
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src/app.ts'), 'export const app = 1;\n');

  await page
    .getByRole('navigation', { name: 'Project' })
    .getByRole('link', { name: 'Code' })
    .click();
  await expect(page).toHaveURL(/\/p\/gym-app\/code$/);
  await expect(page.getByText('No file open.')).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Open tabs' });
  await expect(tabs.getByRole('tab', { name: 'Claude' })).toHaveCount(0);

  const files = page.getByRole('complementary', { name: 'Files' });
  await files.getByRole('treeitem', { name: /src/ }).click();
  await files.getByRole('treeitem', { name: /app\.ts/ }).click();
  await expect(page).toHaveURL(/\/p\/gym-app\/code\/files\/src\/app\.ts$/);
  await expect(tabs.getByRole('tab', { name: /app\.ts/ })).toHaveAttribute('aria-selected', 'true');
  // Monaco loads with the first file tab; the first load can be slow.
  await expect(page.getByRole('region', { name: 'Contents of src/app.ts' })).toContainText(
    /app\s=\s1/,
    { timeout: 20_000 },
  );

  await tabs.getByRole('button', { name: 'Close app.ts' }).click();
  await expect(page).toHaveURL(/\/p\/gym-app\/code$/);
  await expect(page.getByText('No file open.')).toBeVisible();
});
