import { readFileSync, rmSync } from 'node:fs';
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
