// Runs the userscript in headless Chromium on a fake claude.ai page:  node tests/claude-code-tab-title.test.js
// Needs the `playwright` package. No request leaves the machine: every URL is answered here.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'claude-code-tab-title.user.js'), 'utf8');
const ID = 'session_01TESTtestTESTtest';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const apiBody = { data: [{ id: ID, title: 'My task' }] };
  await page.route('**/*', (route) => {
    if (route.request().url().includes('/api/')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(apiBody) });
    }
    return route.fulfill({ contentType: 'text/html', body: '<title>Claude</title><body></body>' });
  });
  // The test decides whether the user is looking at the tab.
  await page.addInitScript(() => {
    window.testLooking = true;
    document.hasFocus = () => window.testLooking;
    Object.defineProperty(document, 'visibilityState', { get: () => (window.testLooking ? 'visible' : 'hidden') });
  });
  await page.addInitScript(SCRIPT);

  const settledTitle = async () => {
    await page.waitForTimeout(400); // update() runs 200 ms after a change
    return page.title();
  };
  async function setLooking(looking) {
    await page.evaluate((v) => {
      window.testLooking = v;
      document.dispatchEvent(new Event('visibilitychange'));
    }, looking);
    return settledTitle();
  }
  // The page renders the prompt box, with the Stop button while a turn runs.
  async function promptBox(turnRunning) {
    await page.evaluate((running) => {
      document.body.innerHTML = '<button data-testid="epitaxy-cds-model-selector"></button>'
        + (running ? '<button data-testid="code-prompt-stop"></button>' : '');
    }, turnRunning);
    return settledTitle();
  }

  await page.goto(`https://claude.ai/code/${ID}`);
  await page.evaluate(() => fetch('/api/sessions').then((r) => r.text()));

  // Before the prompt box is rendered the status is unknown: no icon.
  assert.strictEqual(await setLooking(false), 'My task');
  const why = await page.evaluate(() => window.ccTabTitle.why());
  assert.ok(why.includes('status unknown'), why);

  // The first status seen is no change, so no unseen mark even when not looking.
  assert.strictEqual(await promptBox(false), '✅ My task');
  assert.strictEqual(await promptBox(true), '⏳ My task');

  // The turn ending while not looking is marked until looked at.
  assert.strictEqual(await promptBox(false), '🔴✅ My task');
  assert.strictEqual(await setLooking(true), '✅ My task');
  assert.strictEqual(await setLooking(false), '✅ My task');

  // A mark not looked at goes away when the session works again.
  assert.strictEqual(await promptBox(true), '⏳ My task');
  assert.strictEqual(await promptBox(false), '🔴✅ My task');
  assert.strictEqual(await promptBox(true), '⏳ My task');

  // The turn ending while looking is never marked.
  await setLooking(true);
  assert.strictEqual(await promptBox(false), '✅ My task');

  await browser.close();
  console.log('ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
