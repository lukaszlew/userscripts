// ==UserScript==
// @name         OGS Turn Reminder Beep
// @namespace    https://online-go.com/
// @version      1.0
// @description  Beeps at 10s, then every 30s while it's your turn in main time
// @match        https://online-go.com/game/*
// @match        https://www.online-go.com/game/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const FIRST_BEEP_SEC = 10;
    const INTERVAL_SEC = 30;
    // Beep schedule: 10s, 30s, 60s, 90s, 120s, 150s, ...
    // At Xm30s: 1 beep. At Xm: X beeps.

    let turnStartTime = null;
    let lastBeepIndex = -1; // which beep slot we last triggered
    let beepsRemaining = 0; // multi-beep queue
    let audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new AudioContext();
        }
        return audioCtx;
    }

    function beep(freq = 660, duration = 150) {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "square";
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(ctx.currentTime + duration / 1000);
    }

    function getBeepIndex(elapsedSec) {
        // Beep 0 at 10s, beep 1 at 30s, beep 2 at 60s, beep 3 at 90s, ...
        if (elapsedSec < FIRST_BEEP_SEC) {
            return -1;
        }
        if (elapsedSec < FIRST_BEEP_SEC + INTERVAL_SEC) {
            return 0;
        }
        return 1 + Math.floor((elapsedSec - FIRST_BEEP_SEC) / INTERVAL_SEC);
    }

    function getLoggedInUsername() {
        const el = document.querySelector(".NavBar .username");
        return el ? el.textContent.trim() : null;
    }

    function isMyTurnInMainTime() {
        const me = getLoggedInUsername();
        if (!me) {
            return false;
        }

        // Find the player container that has their-turn
        const active = document.querySelector(".player-container.their-turn");
        if (!active) {
            return false;
        }

        // Check if the active player is me
        const nameEl = active.querySelector(".Player-username");
        if (!nameEl || nameEl.textContent.trim() !== me) {
            return false;
        }

        // Determine color from the container class
        const isBlack = active.classList.contains("black");
        const color = isBlack ? "black" : "white";

        // Check not in overtime
        const clock = document.querySelector(`.${color}.Clock.in-overtime`);
        return !clock;
    }

    function tick() {
        const myTurn = isMyTurnInMainTime();

        if (!myTurn) {
            turnStartTime = null;
            lastBeepIndex = -1;
            return;
        }

        if (turnStartTime === null) {
            turnStartTime = Date.now();
            lastBeepIndex = -1;
        }

        const elapsed = (Date.now() - turnStartTime) / 1000;
        const idx = getBeepIndex(elapsed);

        if (idx > lastBeepIndex) {
            lastBeepIndex = idx;
            beep();
        }
    }

    setInterval(tick, 500);
})();
