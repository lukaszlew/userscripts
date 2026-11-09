// ==UserScript==
// @name         Claude Code: session title in tab
// @namespace    claude-code-tab-title
// @version      1.0
// @description  Sets the browser tab title to the current Claude Code session title on claude.ai/code
// @match        https://claude.ai/code*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Text appended to the tab title, e.g. ' · Claude Code'. Leave '' for title only.
  const SUFFIX = '';
  // Optional: a CSS selector for the title element, if the heuristics below miss it.
  const CUSTOM_SELECTOR = '';

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function sessionIdFromUrl() {
    const m = location.pathname.match(/\/code\/(session_[A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  function titleFromCustomSelector() {
    if (!CUSTOM_SELECTOR) return '';
    const el = document.querySelector(CUSTOM_SELECTOR);
    return el ? clean(el.value || el.getAttribute('title') || el.textContent) : '';
  }

  // The sidebar links to every session; the link for the current session carries its title.
  function titleFromSidebar(id) {
    if (!id) return '';
    for (const a of document.querySelectorAll(`a[href*="${id}"]`)) {
      const withTitle = a.matches('[title]') ? a : a.querySelector('[title]');
      const t = clean(withTitle && withTitle.getAttribute('title'));
      if (t) return t;
      const firstLine = (a.innerText || '').split('\n').map(clean).find(Boolean);
      if (firstLine) return firstLine;
    }
    return '';
  }

  // Fallback: the heading / editable title in the main pane.
  function titleFromHeader() {
    const candidates = [
      'main header h1', 'header h1', 'main h1', 'h1',
      'input[aria-label*="title" i]',
      '[data-testid*="session-title" i]', '[data-testid*="title" i]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      const t = el && clean(el.value || el.textContent);
      if (t && t.length < 200) return t;
    }
    return '';
  }

  function findTitle() {
    return titleFromCustomSelector() ||
           titleFromSidebar(sessionIdFromUrl()) ||
           titleFromHeader();
  }

  let wanted = '';
  function update() {
    const t = findTitle();
    if (t) wanted = t + SUFFIX;
    else if (!sessionIdFromUrl()) wanted = ''; // not on a session page: leave the site's own title
    if (wanted && document.title !== wanted) document.title = wanted;
  }

  let timer = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; update(); }, 250);
  };

  // React re-renders, renames and SPA navigation all show up as DOM mutations;
  // the <title> element is in <head>, so watching the whole document also catches
  // the app resetting the title.
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['title', 'value', 'href'],
  });

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; wanted = ''; }
    schedule();
  }, 1000);

  update();
})();
