// ==UserScript==
// @name         Claude Code: session title in tab
// @namespace    claude-code-tab-title
// @version      2.0
// @description  Sets the browser tab title to the current Claude Code session title on claude.ai/code
// @author       Lukasz Lew
// @match        https://claude.ai/*
// @run-at       document-start
// @noframes
// @grant        none
// @homepageURL  https://github.com/lukaszlew/userscripts
// @downloadURL  https://raw.githubusercontent.com/lukaszlew/userscripts/main/claude-code-tab-title.user.js
// @updateURL    https://raw.githubusercontent.com/lukaszlew/userscripts/main/claude-code-tab-title.user.js
// ==/UserScript==

// How it finds the title, most trusted first:
//   1. CUSTOM_SELECTOR below, if you set one.
//   2. The app's own API responses: any JSON the page fetches that contains
//      {id: "session_…", title: "…"} is remembered (session list, rename, etc.).
//   3. The sidebar link that points at the current session.
//   4. A title remembered from earlier visits (localStorage), so the tab stays
//      right when the sidebar is hidden, e.g. while an artifact pane is open.
// Among 2–3 the most recently *changed* value wins, so renames show up from
// whichever source notices them first.
//
// The session is identified by a session ID anywhere in the URL (path, query or
// hash), so extra parameters such as ?artifact=… or #… don't matter. On pages
// without a session ID the site's own title is left alone.
//
// Debugging: run  ccTabTitle.why()  in the page's DevTools console, or set
// localStorage['cc-tab-title:debug'] = '1' to log every change.

(function () {
  'use strict';

  // Text appended to the tab title, e.g. ' · Claude Code'. Leave '' for title only.
  const SUFFIX = '';
  // Optional: a CSS selector for the title element, if everything below misses it.
  const CUSTOM_SELECTOR = '';

  const ID_RE = /\bsession_[A-Za-z0-9]{8,}\b/;
  const STORE_KEY = 'cc-tab-title:v2';
  const MAX_STORED = 500;

  const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  const usable = (t) => t && t.length <= 300;
  const debugOn = () => { try { return localStorage.getItem('cc-tab-title:debug') === '1'; } catch { return false; } };
  const log = (...a) => { if (debugOn()) console.log('[cc-tab-title]', ...a); };

  // ---- title cache: id -> {title, t, src} -------------------------------------

  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
  }

  // Pull in titles other tabs stored, keeping whichever is newer per session.
  function mergeStored() {
    let changed = false;
    const stored = readStore();
    for (const id in stored) {
      const s = stored[id];
      if (!s || typeof s.title !== 'string' || typeof s.t !== 'number') continue;
      if (!titles[id] || titles[id].t < s.t) { titles[id] = { title: s.title, t: s.t, src: 'stored' }; changed = true; }
    }
    return changed;
  }

  let titles = {};
  mergeStored();

  let saveTimer = null;
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        mergeStored(); // another tab may have written in the meantime
        const ids = Object.keys(titles).sort((a, b) => titles[b].t - titles[a].t).slice(0, MAX_STORED);
        const out = {};
        for (const id of ids) out[id] = { title: titles[id].title, t: titles[id].t };
        localStorage.setItem(STORE_KEY, JSON.stringify(out));
      } catch { /* storage full or blocked: in-memory cache still works */ }
    }, 300);
  }

  // A rename noticed in one tab updates the others.
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY && mergeStored()) schedule(); });

  function remember(id, title, src) {
    title = clean(title);
    if (!id || !usable(title)) return;
    const cur = titles[id];
    if (cur && cur.title === title) { if (src !== 'stored') cur.src = src; return; }
    titles[id] = { title, t: Date.now(), src };
    log('title for', id, '=', JSON.stringify(title), 'from', src);
    save();
    schedule();
  }

  // ---- source 2: the app's API responses --------------------------------------

  // Walks parsed JSON and records every object that looks like a session with a title.
  function harvest(node, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) { for (const x of node) harvest(x, depth + 1); return; }
    const id = [node.id, node.session_id, node.sessionId, node.uuid].find((v) => typeof v === 'string' && ID_RE.test(v));
    const title = [node.title, node.name, node.session_title].find((v) => typeof v === 'string' && clean(v));
    if (id && title) remember(id.match(ID_RE)[0], title, 'api');
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') harvest(v, depth + 1);
    }
  }

  function inspectText(text) {
    if (typeof text !== 'string' || text.length > 20e6) return;
    if (!text.includes('session_') || !/"(title|name|session_title)"/.test(text)) return;
    try { harvest(JSON.parse(text), 0); } catch { /* not plain JSON */ }
  }

  const isJson = (ct) => /json/i.test(ct || '');

  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (...args) {
        const p = origFetch.apply(this, args);
        p.then((res) => {
          try {
            if (res && isJson(res.headers.get('content-type'))) res.clone().text().then(inspectText, () => {});
          } catch { /* never break the page */ }
        }, () => {});
        return p;
      };
    }
  } catch { /* ignore */ }

  try {
    const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (XHR) {
      const origSend = XHR.send;
      XHR.send = function (...args) {
        try {
          this.addEventListener('load', () => {
            try {
              if (!isJson(this.getResponseHeader('content-type'))) return;
              if (this.responseType === '' || this.responseType === 'text') inspectText(this.responseText);
              else if (this.responseType === 'json' && this.response) harvest(this.response, 0);
            } catch { /* ignore */ }
          });
        } catch { /* ignore */ }
        return origSend.apply(this, args);
      };
    }
  } catch { /* ignore */ }

  // ---- source 3: the page itself ----------------------------------------------

  function currentId() {
    const m = (location.pathname + ' ' + location.search + ' ' + location.hash).match(ID_RE);
    return m ? m[0] : null;
  }

  // A sidebar entry usually holds the title plus short extras (age, status, branch).
  // Take the longest piece of text in it; that is the title in practice.
  function textOf(el) {
    if (!el) return '';
    const withTitle = el.matches('[title]') ? el : el.querySelector('[title]');
    const t = clean(withTitle && withTitle.getAttribute('title'));
    if (usable(t)) return t;
    const pieces = [];
    for (const leaf of [el, ...el.querySelectorAll('*')]) {
      if (leaf.children.length === 0 || [...leaf.childNodes].some((n) => n.nodeType === 3 && clean(n.nodeValue))) {
        for (const line of (leaf.innerText || leaf.textContent || '').split('\n')) pieces.push(clean(line));
      }
    }
    const best = pieces.filter(usable).sort((a, b) => b.length - a.length)[0];
    return best || '';
  }

  function titleFromCustomSelector() {
    if (!CUSTOM_SELECTOR) return '';
    const el = document.querySelector(CUSTOM_SELECTOR);
    return el ? clean(el.value || el.getAttribute('title') || el.textContent) : '';
  }

  // Any link (or element carrying the ID in an attribute) that points at this session.
  // Links inside dialogs are skipped: a share or artifact dialog may link to the
  // session under some other name.
  function titleFromDom(id) {
    if (!id || !document.body) return '';
    const sel = `a[href*="${id}"], [data-session-id="${id}"], [data-id="${id}"]`;
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[role="dialog"], [aria-modal="true"]')) continue;
      const t = textOf(el);
      if (t && !ID_RE.test(t)) return t;
    }
    return '';
  }

  // The sidebar wins when it is the only thing we have, when we only have a
  // stored title from an earlier visit, or when its text changes while we watch
  // (a rename). Merely seeing an old sidebar label does not override a title
  // the API delivered during this visit.
  const lastDom = {};
  function observeDom(id) {
    const t = titleFromDom(id);
    if (!t || t === lastDom[id]) return;
    const seenBefore = id in lastDom;
    lastDom[id] = t;
    const rec = titles[id];
    if (!rec || rec.src === 'stored' || seenBefore) remember(id, t, 'sidebar');
  }

  // ---- applying it --------------------------------------------------------------

  let wanted = '';
  let whyText = 'not started';

  function update() {
    const id = currentId();
    if (!id) { wanted = ''; whyText = 'no session ID in URL: leaving the site title alone'; return; }

    const custom = titleFromCustomSelector();
    let title = '';
    if (custom) { title = custom; whyText = `custom selector → "${custom}"`; }
    else {
      observeDom(id);
      const rec = titles[id];
      if (rec) { title = rec.title; whyText = `${id} → "${rec.title}" (from ${rec.src}, ${new Date(rec.t).toLocaleTimeString()})`; }
      else whyText = `${id}: no title found yet (not in API responses, sidebar, or storage)`;
    }

    if (title) wanted = title + SUFFIX;
    // Keep the last good title while the page is mid-render; drop it only when
    // the session changes (handled in the URL watcher below).
    if (wanted && document.title !== wanted) document.title = wanted;
  }

  let timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; try { update(); } catch (e) { log('update failed', e); } }, 200);
  }

  // React re-renders, renames and SPA navigation all show up as DOM mutations;
  // watching <html> also catches the app resetting <title>.
  function start() {
    new MutationObserver(schedule).observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['title', 'href', 'value', 'aria-current'],
    });
    schedule();
  }

  let lastId = currentId();
  function onUrlMaybeChanged() {
    const id = currentId();
    if (id !== lastId) { lastId = id; wanted = ''; }
    schedule();
  }
  for (const m of ['pushState', 'replaceState']) {
    try {
      const orig = history[m];
      history[m] = function (...args) { const r = orig.apply(this, args); onUrlMaybeChanged(); return r; };
    } catch { /* ignore */ }
  }
  window.addEventListener('popstate', onUrlMaybeChanged);
  window.addEventListener('hashchange', onUrlMaybeChanged);
  setInterval(onUrlMaybeChanged, 1000); // safety net for anything the hooks miss

  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });

  window.ccTabTitle = {
    why: () => { update(); return whyText; },
    titles: () => titles,
    forget: () => { titles = {}; try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } },
  };
})();
