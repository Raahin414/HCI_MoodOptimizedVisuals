import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const examples = [
  ['positive', 'I am happy and excited about a wonderful day.'],
  ['neutral', 'The meeting starts at noon in the office.'],
  ['stressed', 'I am scared and nervous about what might happen.'],
];
const browser = await chromium.launch();
try {
  for (const [reference, text] of examples) {
    const page = await browser.newPage();
    let credentials;
    try {
      await page.goto(base + '/adapt');
      await page.getByLabel('Try mood-guided design suggestions').check();
      await page.getByLabel('I voluntarily agree').check();
      await page.getByRole('button', { name: 'Assess my current mood' }).click();
      credentials = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('moodspace-adaptive-session')),
      );
      await page
        .getByRole('radio', {
          name: new RegExp(
            reference === 'positive'
              ? 'Positive /'
              : reference === 'neutral'
                ? 'Neutral /'
                : 'Stressed /',
          ),
        })
        .check();
      await page.getByLabel('In a sentence').fill(text);
      await page.getByLabel('I explicitly agree to save this text').check();
      const response = page.waitForResponse(
        (r) => r.url().endsWith('/predict') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Predict from consented text' }).click();
      const prediction = await (await response).json();
      if (prediction.method !== 'public-corpus-model' || !prediction.predicted_mood)
        throw new Error('Trained public model is unavailable: ' + prediction.reason);
      await page.getByRole('button', { name: 'Use this label' }).click();
      await page.getByRole('button', { name: 'Find my workspace suggestion' }).click();
      await page.getByRole('button', { name: 'Use suggested workspace' }).click();
      const mapping = { positive: 'U02', neutral: 'U08', stressed: 'U01' };
      await page.locator('.workspace-' + mapping[prediction.predicted_mood]).waitFor();
      await page.screenshot({
        path: 'work/screenshots/live-' + reference + '.png',
        fullPage: false,
      });
      console.log(
        JSON.stringify({
          input_context: reference,
          prediction: prediction.predicted_mood,
          method: prediction.method,
          rendered_ui: mapping[prediction.predicted_mood],
          source_type: 'demo',
          verified: true,
        }),
      );
    } finally {
      if (credentials)
        await page.request.delete(base + '/api/sessions/' + credentials.id, {
          headers: { Authorization: 'Bearer ' + credentials.token },
        });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
