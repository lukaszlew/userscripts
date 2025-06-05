// ==UserScript==
// @name         Hide and show variations (Clean Architecture loader)
// @version      2.0
// @description  Loads variation visualizer from local file
// @author       Lukasz Lew
// @match        https://*.ai-sensei.com/*
// @grant        none
// ==/UserScript==

(async function() {
  'use strict';

  console.log('🔄 Loading script from localhost...');

  try {
      const response = await fetch(`http://localhost:8001/ai-sensei-v2.user.js?t=${Date.now()}`);
      if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const scriptContent = await response.text();

      // Remove the UserScript header from the loaded content
      const scriptBody = scriptContent.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

      eval(scriptBody);

  } catch (error) {
      console.error('❌ Failed to load script from localhost:', error);
      console.log('💡 Make sure you have: cd /home/lew/Downloads/userscripts && python3 -m http.server 8001');
  }
})();
