import { test, expect, type Page } from '@playwright/test';
import { challenge, fixtureTasks, VARIANTS, MOODS } from '../../src/domain';
async function saved(page: Page, path: string, action: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (r) => r.url().includes('/' + path) && r.request().method() === 'POST',
  );
  await action();
  expect((await response).status()).toBe(200);
}
async function consent(page: Page) {
  await page.goto('/study');
  await page.getByLabel('Session purpose').selectOption('automated_test');
  await page.getByLabel('I understand this information').check();
  await page.getByRole('button', { name: 'Begin session' }).click();
  await expect(page.getByRole('heading', { name: 'How are you arriving today?' })).toBeVisible();
  await page.getByRole('radio', { name: /Neutral \/ Balanced/ }).check();
  await page.getByLabel('In a sentence').fill('THIS MUST NOT BE SAVED');
  await page.getByRole('button', { name: 'Continue to the designs' }).click();
  await expect(page.getByRole('heading', { name: 'Eight ways to find your flow.' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose Daily Brief', exact: true }).click();
  await page.getByRole('button', { name: 'Save first preference' }).click();
  await expect(
    page.getByRole('heading', { name: 'Find “Editorial storyboard” and mark it complete.' }),
  ).toBeVisible();
}
async function completeTask(page: Page, title: string, network = true) {
  await page.getByRole('button', { name: 'All tasks', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find a task' }).fill(title);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(title) })
    .click();
  if (network)
    await saved(page, 'event', () =>
      page.getByRole('button', { name: 'Mark complete', exact: true }).click(),
    );
  else await page.getByRole('button', { name: 'Mark complete', exact: true }).click();
  await expect(page.getByText('Task marked complete.')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
}
test('complete participant workflow: consent, all previews, practice, eight scored tasks, feedback, final mood, recommendation and deletion', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await consent(page);
  await completeTask(page, 'Editorial storyboard');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  for (let i = 0; i < 8; i++) {
    await expect(
      page.getByText(`Task ${i + 1} of 8 · Design ${Math.floor(i / 2) + 1} of 4`),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Start task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'All tasks', exact: true })).toBeVisible();
    if (i === 0) {
      await page.reload();
      await expect(page.getByRole('button', { name: 'All tasks', exact: true })).toBeVisible();
    }
    const creds = await page.evaluate(() => JSON.parse(localStorage.getItem('moodspace-session')!));
    const s = await (
      await request.get('http://127.0.0.1:3011/api/sessions/' + creds.id, {
        headers: { Authorization: 'Bearer ' + creds.token },
      })
    ).json();
    const c = challenge(s.assignments[i].task_id);
    const target = fixtureTasks.find((t) => t.id === c.targetId)!;
    if (c.family === 'complete') await completeTask(page, target.title);
    else {
      await page.getByRole('button', { name: 'All tasks', exact: true }).click();
      await page.getByRole('textbox', { name: 'Find a task' }).fill(target.title);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: new RegExp(target.title) })
        .click();
      await expect(page.getByRole('button', { name: new RegExp(target.due) })).toBeVisible();
      await page.getByRole('button', { name: 'Close dialog' }).click();
      await page.getByRole('combobox', { name: 'Your answer' }).selectOption(target.due);
    }
    await page.getByRole('button', { name: 'Record response', exact: true }).click();
    if (i % 2) {
      await expect(page.getByRole('heading', { name: /How was/ })).toBeVisible();
      for (const name of ['satisfaction', 'clarity', 'reuse_intent'])
        await page.locator(`input[name="${name}"][value="4"]`).check();
      await page.locator('input[name="effort"][value="3"]').check();
      await page.getByRole('button', { name: 'Save feedback & continue' }).click();
    }
  }
  await expect(page.getByRole('heading', { name: 'What fits you now?' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose Kanban Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Save final preference' }).click();
  await expect(page.getByRole('heading', { name: 'How are you feeling now?' })).toBeVisible();
  await page.getByRole('radio', { name: /Positive \/ Energetic/ }).check();
  await page.getByRole('button', { name: 'Finish check-in' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for making space.' })).toBeVisible();
  const creds = await page.evaluate(() => JSON.parse(localStorage.getItem('moodspace-session')!));
  const s = await (
    await request.get('http://127.0.0.1:3011/api/sessions/' + creds.id, {
      headers: { Authorization: 'Bearer ' + creds.token },
    })
  ).json();
  expect(s.status).toBe('complete');
  expect(s.trials).toHaveLength(8);
  expect(s.trials.every((t: any) => t.status === 'success')).toBe(true);
  expect(s.choices.map((c: any) => c.ui_variant)).toEqual(['U08', 'U02']);
  expect(s.feedback).toHaveLength(4);
  await page.getByRole('link', { name: 'See my workspace suggestion' }).click();
  await expect(page.getByText('Your preference · insufficient evidence')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kanban Flow', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Alternative workspace' }).selectOption('U07');
  await page.getByRole('button', { name: 'Keep my choice / try this design' }).click();
  await expect(page.getByRole('heading', { name: 'Guided Assistant', exact: true })).toBeVisible();
  await expect(page.getByText('After the experiment · active mood: positive')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Guided Assistant', exact: true })).toBeVisible();
  const research = await (
    await request.get('http://127.0.0.1:3011/api/research', {
      headers: { Authorization: 'Bearer automated-browser-only-password' },
    })
  ).json();
  expect(research.participant_count).toBe(0);
  expect(research.coverage.every((c: any) => c.unique_participants === 0)).toBe(true);
  await page.goto('/study');
  await page.getByText('Session controls', { exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete my data' }).click();
  await expect(
    page.getByRole('heading', { name: 'Help shape a better study space.' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('eight layouts × three moods keep fixture parity and support real actions', async ({
  page,
}) => {
  for (const v of VARIANTS) {
    await page.goto('/workspace/' + v.id);
    await expect(page.getByRole('heading', { name: v.name, exact: true })).toBeVisible();
    for (const m of MOODS) {
      await page.getByRole('combobox', { name: 'Current mood' }).selectOption(m.id);
      await expect(
        page.getByText('Manual selection · self-reported ' + m.id + ' · no mood-to-layout rule'),
      ).toBeVisible();
    }
    await completeTask(page, 'Prototype walkthrough', false);
    await page.getByRole('button', { name: 'Courses', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button')).toHaveCount(7);
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
});
test('responsive gallery and workspace have no page overflow; reduced-motion and keyboard dialogs work', async ({
  page,
}) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/gallery');
    await expect(
      page.getByRole('heading', { name: 'Eight ways to find your flow.' }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `work/screenshots/gallery-${width}.png`, fullPage: true });
    for (const id of VARIANTS.map((v) => v.id)) {
      await page.goto('/workspace/' + id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width === 390)
        await page.screenshot({ path: `work/screenshots/${id}-mobile.png`, fullPage: false });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/workspace/U01');
  await page.getByRole('button', { name: 'All tasks', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'All tasks', exact: true })).toBeFocused();
});
test('research access, empty evidence, exports, and lock', async ({ page }) => {
  await page.goto('/research');
  await page.getByLabel('Administrator password').fill('automated-browser-only-password');
  await page.getByRole('button', { name: 'Open research console' }).click();
  await expect(page.getByRole('heading', { name: 'Evidence, as it stands.' })).toBeVisible();
  await expect(page.getByText('No genuine observations yet.', { exact: false })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV archive' }).click();
  expect((await download).suggestedFilename()).toBe('moodspace-csv.zip');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Research console' })).toBeVisible();
});
test('failed save warns, retries the original operation and stores no unconsented text', async ({
  page,
  request,
}) => {
  await page.goto('/study');
  await page.getByLabel('Session purpose').selectOption('automated_test');
  await page.getByLabel('I understand this information').check();
  await page.getByRole('button', { name: 'Begin session' }).click();
  await page.getByRole('radio', { name: /Stressed \/ Overwhelmed/ }).check();
  await page.getByLabel('In a sentence').fill('PRIVATE UNSAVED TEXT');
  let failed = false;
  await page.route('**/api/sessions/*/mood', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Continue to the designs' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Eight ways to find your flow.' })).toBeVisible();
  const c = await page.evaluate(() => JSON.parse(localStorage.getItem('moodspace-session')!));
  const session = await (
    await request.get('http://127.0.0.1:3011/api/sessions/' + c.id, {
      headers: { Authorization: 'Bearer ' + c.token },
    })
  ).json();
  expect(session.phase).toBe('gallery');
  await request.delete('http://127.0.0.1:3011/api/sessions/' + c.id, {
    headers: { Authorization: 'Bearer ' + c.token },
  });
  await page.evaluate(() => localStorage.removeItem('moodspace-session'));
});
