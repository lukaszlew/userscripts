// Runs the userscript in headless Chromium on a fake claude.ai page:  node tests/claude-code-tab-title.test.js
// Needs the `playwright` package. No request leaves the machine: every URL is answered here.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'claude-code-tab-title.user.js'), 'utf8');
const ID = 'session_01TESTtestTESTtest';
const OTHER_ID = 'session_02OTHERotherOTHER';
const NO_BUCKET_ID = 'session_03NOBUCKETnobucket';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let apiBody = {};
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

  async function setLooking(looking) {
    await page.evaluate((v) => {
      window.testLooking = v;
      document.dispatchEvent(new Event('visibilitychange'));
    }, looking);
  }
  // The app fetches a session list holding this session, then the tab title settles.
  async function appFetches(session) {
    apiBody = { data: [{ id: OTHER_ID, title: 'Other', status_bucket: 'SESSION_STATUS_BUCKET_FAILED' }, session] };
    await page.evaluate(() => fetch('/api/sessions').then((r) => r.text()));
    await page.waitForTimeout(400); // update() runs 200 ms after a change
    return page.title();
  }
  const session = (bucket) => ({ id: ID, title: 'My task', status_bucket: `SESSION_STATUS_BUCKET_${bucket}` });

  await page.goto(`https://claude.ai/code/${ID}`);

  // The first status seen is no change, so no unseen mark even when not looking.
  await setLooking(false);
  assert.strictEqual(await appFetches(session('REVIEW_READY')), '✅ My task');
  assert.strictEqual(await appFetches(session('WORKING')), '⏳ My task');

  // A change to a non-working status while not looking is marked until looked at.
  assert.strictEqual(await appFetches(session('REVIEW_READY')), '🔴✅ My task');
  await setLooking(true);
  await page.waitForTimeout(400);
  assert.strictEqual(await page.title(), '✅ My task');
  await setLooking(false);
  await page.waitForTimeout(400);
  assert.strictEqual(await page.title(), '✅ My task');

  // A change while looking is never marked.
  await setLooking(true);
  assert.strictEqual(await appFetches(session('BLOCKED')), '❓ My task');

  // A mark not looked at goes away when the session works again.
  await setLooking(false);
  assert.strictEqual(await appFetches(session('FAILED')), '🔴❌ My task');
  assert.strictEqual(await appFetches(session('WORKING')), '⏳ My task');
  assert.strictEqual(await appFetches(session('COMPLETED')), '🔴🏁 My task');

  // A status missing from STATUS_ICONS is shown as unknown, not hidden.
  await setLooking(true);
  assert.strictEqual(await appFetches(session('PAUSED')), '❔ My task');

  // Without status_bucket the title has no icon, and why() lists the status fields there are.
  await page.goto(`https://claude.ai/code/${NO_BUCKET_ID}`);
  assert.strictEqual(await appFetches({ id: NO_BUCKET_ID, title: 'Old API', session_status: 'RUNNING' }), 'Old API');
  const why = await page.evaluate(() => window.ccTabTitle.why());
  assert.ok(why.includes('no status_bucket seen') && why.includes('{"session_status":"RUNNING"}'), why);

  await browser.close();
  console.log('ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
