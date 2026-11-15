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
  // The session's event socket: the test plays the server.
  let socket = null;
  await page.routeWebSocket(/\/v1\/sessions\/ws\//, (ws) => { socket = ws; });
  async function socketSends(event) {
    socket.send(JSON.stringify(event));
    return settledTitle();
  }
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

  await page.goto(`https://claude.ai/code/${ID}`);
  await page.evaluate(() => fetch('/api/sessions').then((r) => r.text()));
  await page.evaluate((id) => { window.testSocket = new WebSocket(`wss://claude.ai/v1/sessions/ws/${id}/subscribe?organization_uuid=x`); }, ID);
  await page.waitForTimeout(300);

  const toolCall = { message: { type: 'message', content: [{ type: 'tool_use' }] }, type: 'assistant' };
  const text = { message: { type: 'message', content: [{ type: 'text' }] }, type: 'assistant' };
  const result = { type: 'result', result: { type: 'message' } };
  const toolResult = { type: 'user', message: { content: [{ type: 'tool_result', content: '{"type":"result"} and "type":"result"' }] } };

  // Events while looking leave no mark, also after looking away.
  assert.strictEqual(await socketSends(text), 'My task');
  assert.strictEqual(await socketSends(result), 'My task');
  assert.strictEqual(await setLooking(false), 'My task');

  // Not looking: Claude works, writes a message, works on, and the turn ends;
  // other events change nothing.
  assert.strictEqual(await socketSends({ type: 'system' }), 'My task');
  assert.strictEqual(await socketSends(toolCall), '⏳ My task');
  assert.strictEqual(await socketSends(toolResult), '⏳ My task');
  assert.strictEqual(await socketSends(text), '⏳💬 My task');
  assert.strictEqual(await socketSends(toolCall), '⏳💬 My task');
  assert.strictEqual(await socketSends(result), '🔴 My task');
  assert.strictEqual(await socketSends({ type: 'system' }), '🔴 My task');

  // Looking removes the mark for good.
  assert.strictEqual(await setLooking(true), 'My task');
  assert.strictEqual(await setLooking(false), 'My task');

  // A turn that ends with nothing seen first, and a new turn after it.
  assert.strictEqual(await socketSends(result), '🔴 My task');
  assert.strictEqual(await socketSends(toolCall), '⏳ My task');
  const why = await page.evaluate(() => window.ccTabTitle.why());
  assert.ok(why.includes('mark: working; last event: working at ') && why.includes('tab hidden, window not focused'), why);

  // Another session's socket does not mark this tab.
  await setLooking(true);
  await setLooking(false);
  await page.evaluate(() => { window.testSocket = new WebSocket('wss://claude.ai/v1/sessions/ws/session_02OTHERotherOTHER/subscribe'); });
  await page.waitForTimeout(300);
  assert.strictEqual(await socketSends(result), 'My task');

  await browser.close();
  console.log('ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
