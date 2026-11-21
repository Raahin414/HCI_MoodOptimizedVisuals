import { test, expect } from '@playwright/test';
for (const mood of [
  { id: 'positive', label: /Positive \/ Energetic/ },
  { id: 'neutral', label: /Neutral \/ Balanced/ },
  { id: 'stressed', label: /Stressed \/ Overwhelmed/ },
])
  test(`new ${mood.id} user: sourced recommendation, rendered override, persistent actions, feedback and deletion`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/adapt');
    await page.getByLabel('Workspace record purpose').selectOption('automated_test');
    await page.getByLabel('Your preferred structure').selectOption('U08');
    await page.getByLabel('I voluntarily agree to this local workspace').check();
    await page.getByRole('button', { name: 'Assess my current mood' }).click();
    await page.getByRole('radio', { name: mood.label }).check();
    if (mood.id === 'positive') {
      await page.getByLabel('In a sentence').fill('I am happy and excited');
      await page.getByLabel('I explicitly agree to save this text').check();
      await page.getByRole('button', { name: 'Predict from consented text' }).click();
      await expect(
        page.getByText(/^(rule-based demonstration|public-corpus-model)$/),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Keep my own selection' }).click();
    }
    if (mood.id === 'stressed')
      await page.getByLabel('In a sentence').fill('THIS MUST NOT BE STORED');
    await page.getByRole('button', { name: 'Find my workspace suggestion' }).click();
    await expect(
      page.getByText('Your preference · insufficient evidence', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Active mood:', { exact: false })).toContainText(mood.id);
    await page.getByRole('combobox', { name: 'Override workspace' }).selectOption('U03');
    await page.getByRole('button', { name: 'Open my chosen layout' }).click();
    await expect(page.getByRole('heading', { name: 'Weekly Planner', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All tasks', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find a task' }).fill('Prototype walkthrough');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Prototype walkthrough/ })
      .click();
    await page.getByRole('button', { name: 'Mark complete', exact: true }).click();
    await expect(page.getByText('Task marked complete.')).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByLabel('Workspace satisfaction').selectOption('4');
    await page.getByLabel('Workspace mental effort').selectOption('3');
    await page.getByRole('button', { name: 'Save workspace feedback' }).click();
    await expect(page.getByText('Workspace feedback saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Weekly Planner', exact: true })).toBeVisible();
    const creds = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('moodspace-adaptive-session')!),
    );
    const headers = { Authorization: 'Bearer ' + creds.token };
    const state = await (
      await request.get('http://127.0.0.1:3011/api/sessions/' + creds.id, { headers })
    ).json();
    expect(state).toMatchObject({ active_mood: mood.id, active_ui: 'U03', mode: 'workspace' });
    expect(state.sandbox.find((t: any) => t.id === 'T02').status).toBe('done');
    if (mood.id === 'neutral') {
      await page.evaluate(() => localStorage.removeItem('moodspace-adaptive-session'));
      await page.reload();
      await page
        .getByText('Resume a personal workspace with a private code', { exact: true })
        .click();
      await page.getByLabel('Workspace resume code').fill(creds.id + '.' + creds.token);
      await page.getByRole('button', { name: 'Resume personal workspace' }).click();
      await expect(
        page.getByRole('heading', { name: 'Weekly Planner', exact: true }),
      ).toBeVisible();
    }
    const admin = { Authorization: 'Bearer automated-browser-only-password' };
    const excluded = await (
      await request.get('http://127.0.0.1:3011/api/research/export', { headers: admin })
    ).json();
    expect(excluded.tables.sessions).toHaveLength(0);
    const included = await (
      await request.get('http://127.0.0.1:3011/api/research/export?include_synthetic=true', {
        headers: admin,
      })
    ).json();
    expect(included.manifest.excluded_synthetic).toBe(false);
    const row = included.tables.sessions.find((s: any) => s.id === creds.id);
    expect(row.source_type).toBe('automated_test');
    expect(included.tables.workspace_feedback.some((f: any) => f.session_id === creds.id)).toBe(
      true,
    );
    expect(included.tables.trials.some((t: any) => t.session_id === creds.id)).toBe(false);
    if (mood.id === 'stressed')
      expect(JSON.stringify(included)).not.toContain('THIS MUST NOT BE STORED');
    await page.getByText('Workspace controls', { exact: true }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete workspace data' }).click();
    await expect(page.getByRole('heading', { name: 'Find your space for today.' })).toBeVisible();
    expect(
      (await request.get('http://127.0.0.1:3011/api/sessions/' + creds.id, { headers })).status(),
    ).toBe(401);
    expect(errors).toEqual([]);
  });
test('accepted fallback renders suggested UI; all eight can be switched without affecting study allocations', async ({
  page,
}) => {
  await page.goto('/adapt');
  await page.getByLabel('Workspace record purpose').selectOption('automated_test');
  await page.getByLabel('I voluntarily agree').check();
  await page.getByRole('button', { name: 'Assess my current mood' }).click();
  await page.getByRole('radio', { name: /Neutral \/ Balanced/ }).check();
  await page.getByRole('button', { name: 'Find my workspace suggestion' }).click();
  await expect(page.getByText('Neutral starting interface · insufficient evidence')).toBeVisible();
  await page.getByRole('button', { name: 'Use suggested workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Quiet Focus', exact: true })).toBeVisible();
  for (let i = 1; i <= 8; i++) {
    const response =
      i === 1
        ? null
        : page.waitForResponse(
            (r) => r.url().endsWith('/recommendation') && r.request().method() === 'POST',
          );
    await page.getByLabel('Switch adaptive interface').selectOption('U0' + i);
    if (response) expect((await response).status()).toBe(200);
    await expect(page.locator('.workspace-U0' + i)).toBeVisible();
  }
  await page.getByText('Workspace controls', { exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete workspace data' }).click();
});
