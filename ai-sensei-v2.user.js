// ==UserScript==
// @name         Hide and show variations (Clean Architecture)
// @version      2.0
// @description  Clean architecture implementation for variation visualization on AI Sensei
// @author       Lukasz Lew
// @match        https://*.ai-sensei.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ===== EVENT BUS =====
    class EventBus {
        constructor() {
            this.listeners = new Map();
        }

        on(event, callback) {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, []);
            }
            this.listeners.get(event).push(callback);
        }

        off(event, callback) {
            if (this.listeners.has(event)) {
                const callbacks = this.listeners.get(event);
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            }
        }

        emit(event, data) {
            if (this.listeners.has(event)) {
                this.listeners.get(event).forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`EventBus error in ${event}:`, error);
                    }
                });
            }
        }
    }

    // ===== VARIATION STATE =====
    class VariationState {
        constructor(eventBus) {
            this.eventBus = eventBus;
            this.data = {
                moves: [],
                maxMoves: 0,
                currentMove: 0,
                settings: {
                    showPrefix: false
                },
                animation: {
                    speed: 1000,
                    isPlaying: false,
                    direction: 'forward',
                    targetMove: null
                }
            };
        }

        update(changes) {
            const oldState = { ...this.data };
            
            // Deep merge for nested objects
            if (changes.settings) {
                this.data.settings = { ...this.data.settings, ...changes.settings };
                delete changes.settings;
            }
            if (changes.animation) {
                this.data.animation = { ...this.data.animation, ...changes.animation };
                delete changes.animation;
            }
            
            // Shallow merge for top-level properties
            this.data = { ...this.data, ...changes };
            
            // Validate state
            this.validateState();
            
            this.eventBus.emit('state-changed', {
                oldState,
                newState: this.data,
                changes: this.getChanges(oldState, this.data)
            });
        }

        validateState() {
            // Ensure currentMove is within bounds
            this.data.currentMove = Math.max(0, Math.min(this.data.currentMove, this.data.maxMoves));
        }

        getChanges(oldState, newState) {
            const changes = {};
            
            // Check top-level changes
            for (const key in newState) {
                if (typeof newState[key] === 'object' && newState[key] !== null) {
                    // Avoid circular reference issues with DOM elements by doing shallow comparison
                    if (key === 'moves') {
                        // For moves array, compare length and move numbers only
                        if (!oldState[key] || oldState[key].length !== newState[key].length ||
                            !oldState[key].every((move, i) => move.moveNumber === newState[key][i]?.moveNumber)) {
                            changes[key] = newState[key];
                        }
                    } else {
                        // For other objects, use shallow comparison
                        try {
                            if (JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])) {
                                changes[key] = newState[key];
                            }
                        } catch (error) {
                            // Fallback to reference comparison if JSON.stringify fails
                            if (oldState[key] !== newState[key]) {
                                changes[key] = newState[key];
                            }
                        }
                    }
                } else if (oldState[key] !== newState[key]) {
                    changes[key] = newState[key];
                }
            }
            
            return changes;
        }

        get() {
            return { ...this.data };
        }
    }

    // ===== AI SENSEI ADAPTER =====
    class AISenseiAdapter {
        constructor(eventBus) {
            this.eventBus = eventBus;
            this.observer = null;
            this.lastBoardState = null;
            this.isMonitoring = false;
            
            this.setupCSS();
        }

        setupCSS() {
            const style = document.createElement('style');
            style.textContent = `
                .userscript-hidden { display: none !important; }
            `;
            document.head.appendChild(style);
        }

        startMonitoring() {
            if (this.isMonitoring) return;
            
            this.isMonitoring = true;
            this.lastBoardState = this.getBoardState();
            
            // Use MutationObserver for efficient change detection
            this.observer = new MutationObserver(() => {
                this.checkForBoardChanges();
            });

            const boardElement = this.getBoardElement();
            if (boardElement) {
                this.observer.observe(boardElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'style'],
                    characterData: true
                });
            }

            // Also observe the entire document body for broader changes
            this.documentObserver = new MutationObserver(() => {
                this.eventBus.emit('ui-check-needed');
            });
            
            this.documentObserver.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Also listen for AI Sensei navigation clicks
            document.addEventListener('click', this.handleNavigationClick.bind(this));
            
            // Fallback polling every 250ms for better responsiveness
            setInterval(() => this.checkForBoardChanges(), 250);
            
            // Also poll for UI restoration every 500ms
            setInterval(() => this.eventBus.emit('ui-check-needed'), 500);
        }

        stopMonitoring() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            
            if (this.documentObserver) {
                this.documentObserver.disconnect();
                this.documentObserver = null;
            }
            
            // Remove click event listener
            document.removeEventListener('click', this.handleNavigationClick.bind(this));
            
            this.isMonitoring = false;
        }

        handleNavigationClick(event) {
            const target = event.target.closest('div');
            if (target && (
                target.classList.contains('navigate-next-move') ||
                target.classList.contains('navigate-previous-move') ||
                target.classList.contains('navigate-last-move') ||
                target.classList.contains('navigate-back-to-game')
            )) {
                // Check immediately for instant response
                this.checkForBoardChanges();
                // Follow up checks to catch delayed DOM updates
                setTimeout(() => this.checkForBoardChanges(), 5);
                setTimeout(() => this.checkForBoardChanges(), 25);
            }
        }

        checkForBoardChanges() {
            const currentBoardState = this.getBoardState();
            if (currentBoardState && currentBoardState !== this.lastBoardState) {
                this.lastBoardState = currentBoardState;
                this.eventBus.emit('board-changed');
            }
        }

        getBoardElement() {
            const boards = document.getElementsByClassName('board');
            return boards.length > 0 ? boards[0] : null;
        }

        getBoardState() {
            const board = this.getBoardElement();
            if (!board) return null;

            const labels = board.getElementsByClassName('label');
            if (labels.length < 2) return null;

            const [coords, labelParent] = labels;
            const state = [];

            for (let i = 0; i < labelParent.children.length; i++) {
                const label = labelParent.children[i];
                const classLabel = Array.from(label.classList).find(s => s.startsWith('label'));
                if (classLabel) {
                    state.push(classLabel);
                }
            }

            return state.sort().join('|');
        }

        getMoves() {
            try {
                const board = this.getBoardElement();
                if (!board) return [];

                const labels = board.getElementsByClassName('label');
                if (labels.length < 2) return [];

                const [coords, labelParent] = labels;
                const moves = [];

                for (let i = 0; i < labelParent.children.length; i++) {
                    const label = labelParent.children[i];
                    const classLabel = Array.from(label.classList).find(s => s.startsWith('label'));
                    
                    if (!classLabel) continue;
                    
                    const parts = classLabel.split('-');
                    const labelText = parts[parts.length - 1];
                    const moveNumber = parseInt(labelText) || 0;
                    
                    if (moveNumber > 0) {
                        const rowS = parts[1];
                        const colS = parts[2];
                        const stoneClass = 'stone-' + rowS + '-' + colS;
                        const stones = board.getElementsByClassName(stoneClass);
                        
                        moves.push({
                            moveNumber,
                            labelElement: label,
                            stoneElement: stones.length > 0 ? stones[0] : null
                        });
                    }
                }

                return moves.sort((a, b) => a.moveNumber - b.moveNumber);
            } catch (error) {
                this.eventBus.emit('error', { type: 'parse-failed', error });
                return [];
            }
        }

        resetToNaturalState() {
            const board = this.getBoardElement();
            if (!board) return;

            const hiddenElements = board.querySelectorAll('.userscript-hidden');
            hiddenElements.forEach(el => el.classList.remove('userscript-hidden'));
        }

        applyVisibility(moves, currentMove, settings) {
            this.resetToNaturalState();

            moves.forEach(moveData => {
                let shouldShow;
                if (settings.showPrefix) {
                    shouldShow = moveData.moveNumber <= currentMove;
                } else {
                    shouldShow = moveData.moveNumber === currentMove;
                }

                // Hide labels that shouldn't be shown
                if (!shouldShow) {
                    moveData.labelElement.classList.add('userscript-hidden');
                }

                // Hide stones that shouldn't be shown
                if (moveData.stoneElement && !shouldShow) {
                    moveData.stoneElement.classList.add('userscript-hidden');
                }
            });
        }
    }

    // ===== ANIMATION ENGINE =====
    class AnimationEngine {
        constructor(eventBus, state) {
            this.eventBus = eventBus;
            this.state = state;
            this.timer = null;
        }

        play(direction = 'forward', targetMove = null) {
            this.stop();
            
            const currentState = this.state.get();
            const finalTarget = targetMove !== null && targetMove !== undefined ? targetMove : 
                (direction === 'forward' ? currentState.maxMoves : 0);

            this.state.update({
                animation: {
                    isPlaying: true,
                    direction,
                    targetMove: finalTarget
                }
            });

            if (direction === 'forward') {
                this.animateForward(finalTarget);
            } else {
                this.animateBackward(finalTarget);
            }
        }

        animateForward(targetMove) {
            const currentState = this.state.get();
            
            this.timer = setInterval(() => {
                const state = this.state.get();
                const nextMove = state.currentMove + 1;
                
                if (state.currentMove >= targetMove) {
                    this.stop();
                    return;
                }
                
                this.state.update({ currentMove: nextMove });
            }, currentState.animation.speed);
        }

        animateBackward(targetMove) {
            const currentState = this.state.get();
            
            this.timer = setInterval(() => {
                const state = this.state.get();
                const nextMove = state.currentMove - 1;
                
                if (nextMove < targetMove) {
                    this.stop();
                    return;
                }
                
                this.state.update({ currentMove: nextMove });
            }, currentState.animation.speed);
        }

        stop() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            this.state.update({
                animation: { isPlaying: false }
            });
        }

        setSpeed(speed) {
            const currentState = this.state.get();
            const newSpeed = Math.max(100, Math.min(5000, speed));
            
            this.state.update({
                animation: { speed: newSpeed }
            });
            
            // Restart animation with new speed if currently playing
            if (currentState.animation.isPlaying) {
                const { direction, targetMove } = currentState.animation;
                this.play(direction, targetMove);
            }
        }
    }

    // ===== UI CONTROLLER =====
    class UIController {
        constructor(eventBus, state, gameAdapter, animationEngine) {
            this.eventBus = eventBus;
            this.state = state;
            this.gameAdapter = gameAdapter;
            this.animationEngine = animationEngine;
            this.elements = null;
            
            this.setupEventListeners();
        }

        setupEventListeners() {
            this.eventBus.on('state-changed', ({ newState, changes }) => {
                this.updateView(newState, changes);
            });
            
            this.eventBus.on('ui-check-needed', () => {
                this.checkAndRestoreUI();
            });
            
            // Add keyboard shortcuts
            document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        }

        checkAndRestoreUI() {
            // Check if our controls are still present and the sidebar exists
            const existingControls = document.querySelector('.userscript-variation-controls');
            const sidebarTopCard = document.querySelector('.sidebar-top-card');
            
            if (!existingControls && sidebarTopCard) {
                // Controls were removed but sidebar exists, re-install them
                console.log('UI controls missing, restoring...');
                setTimeout(() => this.install(), 50);
            }
        }

        handleKeyboardShortcuts(event) {
            // Only handle when Shift is pressed and we're not in an input field
            if (!event.shiftKey || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    this.prevMove();
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    this.nextMove();
                    break;
                case 'KeyP':
                    event.preventDefault();
                    this.togglePrefix();
                    break;
                case 'KeyA':
                    event.preventDefault();
                    this.animateToCurrentMove();
                    break;
            }
        }

        createUI() {
            const elements = {
                container: document.createElement('div'),
                rows: {
                    toggles: document.createElement('div'),
                    navigation: document.createElement('div'),
                    speed: document.createElement('div')
                },
                buttons: {}
            };

            // Setup container
            elements.container.className = 'userscript-variation-controls';

            // Setup rows
            elements.rows.toggles.className = 'd-flex flex-wrap align-items-center mb-2';
            elements.rows.navigation.className = 'd-flex flex-wrap align-items-center mb-2';
            elements.rows.speed.className = 'd-flex flex-wrap align-items-center';

            // Create buttons
            this.createToggleButtons(elements);
            this.createNavigationButtons(elements);
            this.createSpeedControls(elements);

            // Assemble UI
            elements.container.appendChild(elements.rows.toggles);
            elements.container.appendChild(elements.rows.navigation);
            elements.container.appendChild(elements.rows.speed);

            return elements;
        }

        createToggleButtons(elements) {
            const currentState = this.state.get();

            elements.buttons.prefix = this.createButton('🔢', () => this.togglePrefix());
            elements.buttons.prefix.title = 'Toggle prefix mode';
            this.updateButtonStyle(elements.buttons.prefix, currentState.settings.showPrefix);

            elements.buttons.animateToHere = this.createButton('▶️', () => this.animateToCurrentMove());
            elements.buttons.animateToHere.title = 'Animate variation up to current move';

            elements.rows.toggles.appendChild(elements.buttons.prefix);
            elements.rows.toggles.appendChild(this.createSpacer());
            elements.rows.toggles.appendChild(elements.buttons.animateToHere);
        }

        createNavigationButtons(elements) {
            const navButtons = [
                { key: 'beginning', icon: '⏮', action: () => this.goToBeginning(), title: 'Go to beginning' },
                { key: 'back6', icon: '⏪', action: () => this.move6Backward(), title: 'Move 6 backward' },
                { key: 'prev', icon: '⏴', action: () => this.prevMove(), title: 'Previous move (Shift+←)' },
                { key: 'next', icon: '⏵', action: () => this.nextMove(), title: 'Next move (Shift+→)' },
                { key: 'forward6', icon: '⏩', action: () => this.move6Forward(), title: 'Move 6 forward' },
                { key: 'end', icon: '⏭', action: () => this.goToEnd(), title: 'Go to end' }
            ];

            navButtons.forEach((btn, index) => {
                elements.buttons[btn.key] = this.createButton(btn.icon, btn.action);
                elements.buttons[btn.key].title = btn.title;
                elements.rows.navigation.appendChild(elements.buttons[btn.key]);
                
                if (index < navButtons.length - 1) {
                    elements.rows.navigation.appendChild(this.createSpacer());
                }
            });
        }

        createSpeedControls(elements) {
            const currentState = this.state.get();

            elements.buttons.slower = this.createButton('🐌', () => this.changeSpeed(1.5));
            elements.buttons.slower.title = 'Slower animation';

            elements.speedDisplay = document.createElement('span');
            elements.speedDisplay.className = 'badge bg-secondary mx-2';
            elements.speedDisplay.textContent = `${(currentState.animation.speed / 1000).toFixed(1)}s`;
            elements.speedDisplay.title = 'Animation speed';

            elements.buttons.faster = this.createButton('🐰', () => this.changeSpeed(0.67));
            elements.buttons.faster.title = 'Faster animation';

            elements.rows.speed.appendChild(elements.buttons.slower);
            elements.rows.speed.appendChild(elements.speedDisplay);
            elements.rows.speed.appendChild(elements.buttons.faster);
        }

        createButton(label, onClick) {
            const button = document.createElement('button');
            button.className = 'btn btn-primary';
            button.addEventListener('click', onClick);
            
            const span = document.createElement('span');
            span.className = 'd-flex align-items-center';
            span.innerHTML = label;
            button.appendChild(span);
            
            return button;
        }

        createSpacer() {
            const spacer = document.createElement('span');
            spacer.className = 'ms-1';
            return spacer;
        }

        updateButtonStyle(button, isPressed) {
            if (isPressed) {
                button.classList.add('btn-success');
                button.classList.remove('btn-primary');
                button.style.boxShadow = 'inset 0 3px 5px rgba(0,0,0,0.3)';
            } else {
                button.classList.add('btn-primary');
                button.classList.remove('btn-success');
                button.style.boxShadow = '';
            }
        }

        updateView(newState, changes) {
            if (!this.elements) return;

            // Update button states
            if (changes.settings) {
                if ('showPrefix' in changes.settings) {
                    this.updateCompactButtonStyle(this.elements.buttons.prefix, newState.settings.showPrefix);
                }
            }

            // Update speed display
            if (changes.animation && 'speed' in changes.animation) {
                this.elements.speedDisplay.textContent = `${(newState.animation.speed / 1000).toFixed(1)}s`;
            }

            // Update visibility
            if ('currentMove' in changes || 'moves' in changes || changes.settings) {
                this.gameAdapter.applyVisibility(newState.moves, newState.currentMove, newState.settings);
            }
        }

        install(retryCount = 0) {
            if (retryCount * 200 > 10000) {
                console.warn('VariationVisualizer: Failed to install UI after 10 seconds');
                return;
            }
            
            // Remove any existing controls first
            const existingControls = document.querySelector('.userscript-variation-controls');
            if (existingControls) {
                existingControls.remove();
            }
            
            // Look for a stable location - the sidebar top area
            const sidebarTopCard = document.querySelector('.sidebar-top-card');
            if (!sidebarTopCard) {
                setTimeout(() => this.install(retryCount + 1), 200);
                return;
            }

            this.elements = this.createSidebarControls();
            
            // Insert at the end of the sidebar top card
            sidebarTopCard.appendChild(this.elements);
        }

        createSidebarControls() {
            const currentState = this.state.get();
            
            // Create main container with class for detection
            const container = document.createElement('div');
            container.className = 'userscript-variation-controls mt-2';
            container.style.borderTop = '1px solid #dee2e6';
            container.style.paddingTop = '0.5rem';
            
            // Create header
            const header = document.createElement('div');
            header.className = 'd-flex align-items-center justify-content-between mb-2';
            header.innerHTML = '<small class="text-muted fw-bold">VARIATION TOOLS</small>';
            
            // Create controls row
            const controlsRow = document.createElement('div');
            controlsRow.className = 'd-flex align-items-center gap-2 flex-wrap';
            
            // Create button elements object for compatibility
            this.elements = { buttons: {}, container, speedDisplay: null };
            
            // Prefix toggle button
            this.elements.buttons.prefix = this.createCompactButton('🔢', () => this.togglePrefix());
            this.elements.buttons.prefix.title = 'Toggle prefix mode - show all moves up to current (Shift+P)';
            this.updateCompactButtonStyle(this.elements.buttons.prefix, currentState.settings.showPrefix);
            
            // Animate button
            this.elements.buttons.animateToHere = this.createCompactButton('▶️', () => this.animateToCurrentMove());
            this.elements.buttons.animateToHere.title = 'Animate variation up to current move (Shift+A)';
            
            // Navigation buttons
            this.elements.buttons.prev = this.createCompactButton('⏴', () => this.prevMove());
            this.elements.buttons.prev.title = 'Previous move (Shift+←)';
            
            this.elements.buttons.next = this.createCompactButton('⏵', () => this.nextMove());
            this.elements.buttons.next.title = 'Next move (Shift+→)';
            
            // Speed display
            this.elements.speedDisplay = document.createElement('span');
            this.elements.speedDisplay.className = 'badge bg-secondary text-white';
            this.elements.speedDisplay.textContent = `${(currentState.animation.speed / 1000).toFixed(1)}s`;
            this.elements.speedDisplay.title = 'Animation speed - click to change';
            this.elements.speedDisplay.style.fontSize = '0.65em';
            this.elements.speedDisplay.style.cursor = 'pointer';
            this.elements.speedDisplay.style.minWidth = '2.2em';
            this.elements.speedDisplay.style.textAlign = 'center';
            
            // Add click handler to cycle through speeds
            this.elements.speedDisplay.addEventListener('click', () => {
                const speeds = [0.5, 1.0, 1.5, 2.0];
                const current = currentState.animation.speed / 1000;
                const currentIndex = speeds.findIndex(s => Math.abs(s - current) < 0.1);
                const nextIndex = (currentIndex + 1) % speeds.length;
                this.animationEngine.setSpeed(speeds[nextIndex] * 1000);
            });
            
            // Add controls to row
            controlsRow.appendChild(this.elements.buttons.prefix);
            controlsRow.appendChild(this.elements.buttons.animateToHere);
            controlsRow.appendChild(this.elements.speedDisplay);
            
            // Add separator
            const separator = document.createElement('span');
            separator.className = 'text-muted';
            separator.textContent = '|';
            controlsRow.appendChild(separator);
            
            controlsRow.appendChild(this.elements.buttons.prev);
            controlsRow.appendChild(this.elements.buttons.next);
            
            // Assemble container
            container.appendChild(header);
            container.appendChild(controlsRow);
            
            return container;
        }

        createVariationControls(container) {
            const currentState = this.state.get();
            
            // Create button elements object for compatibility
            this.elements = { buttons: {} };
            
            // Prefix toggle button
            this.elements.buttons.prefix = this.createAISenseiButton('🔢', () => this.togglePrefix());
            this.elements.buttons.prefix.title = 'Toggle prefix mode - show all moves up to current';
            this.updateButtonStyle(this.elements.buttons.prefix, currentState.settings.showPrefix);
            
            // Animate button
            this.elements.buttons.animateToHere = this.createAISenseiButton('▶️', () => this.animateToCurrentMove());
            this.elements.buttons.animateToHere.title = 'Animate variation up to current move';
            
            // Navigation buttons
            const navButtons = [
                { key: 'beginning', icon: '⏮', action: () => this.goToBeginning(), title: 'Go to beginning' },
                { key: 'prev', icon: '⏴', action: () => this.prevMove(), title: 'Previous move (Shift+←)' },
                { key: 'next', icon: '⏵', action: () => this.nextMove(), title: 'Next move (Shift+→)' },
                { key: 'end', icon: '⏭', action: () => this.goToEnd(), title: 'Go to end' }
            ];
            
            navButtons.forEach(btn => {
                this.elements.buttons[btn.key] = this.createAISenseiButton(btn.icon, btn.action);
                this.elements.buttons[btn.key].title = btn.title;
            });
            
            // Speed controls
            this.elements.buttons.slower = this.createAISenseiButton('🐌', () => this.changeSpeed(1.5));
            this.elements.buttons.slower.title = 'Slower animation';
            
            this.elements.speedDisplay = document.createElement('span');
            this.elements.speedDisplay.className = 'badge bg-secondary mx-1';
            this.elements.speedDisplay.textContent = `${(currentState.animation.speed / 1000).toFixed(1)}s`;
            this.elements.speedDisplay.title = 'Animation speed';
            this.elements.speedDisplay.style.fontSize = '0.7em';
            
            this.elements.buttons.faster = this.createAISenseiButton('🐰', () => this.changeSpeed(0.67));
            this.elements.buttons.faster.title = 'Faster animation';
            
            // Add all buttons to container with proper spacing
            const buttonOrder = [
                'prefix', 'animateToHere', 'speedDisplay', 
                'beginning', 'prev', 'next', 'end',
                'slower', 'speedDisplay', 'faster'
            ];
            
            // Add main controls
            container.appendChild(this.elements.buttons.prefix);
            container.appendChild(this.createSpacer());
            container.appendChild(this.elements.buttons.animateToHere);
            container.appendChild(this.createSpacer());
            
            // Add navigation
            container.appendChild(this.elements.buttons.beginning);
            container.appendChild(this.createSpacer());
            container.appendChild(this.elements.buttons.prev);
            container.appendChild(this.createSpacer());
            container.appendChild(this.elements.buttons.next);
            container.appendChild(this.createSpacer());
            container.appendChild(this.elements.buttons.end);
            container.appendChild(this.createSpacer());
            
            // Add speed controls
            container.appendChild(this.elements.buttons.slower);
            container.appendChild(this.createSpacer());
            container.appendChild(this.elements.speedDisplay);
            container.appendChild(this.createSpacer());
            container.appendChild(this.elements.buttons.faster);
        }

        createCompactButton(label, onClick) {
            const button = document.createElement('button');
            button.className = 'btn btn-outline-secondary btn-sm';
            button.style.fontSize = '0.8em';
            button.style.padding = '0.25rem 0.5rem';
            button.style.minWidth = '2.2em';
            button.addEventListener('click', onClick);
            button.textContent = label;
            return button;
        }

        updateCompactButtonStyle(button, isPressed) {
            if (isPressed) {
                button.className = 'btn btn-secondary btn-sm';
            } else {
                button.className = 'btn btn-outline-secondary btn-sm';
            }
        }

        // Action methods
        togglePrefix() {
            const currentState = this.state.get();
            this.state.update({
                settings: { showPrefix: !currentState.settings.showPrefix }
            });
        }

        animateToCurrentMove() {
            const currentState = this.state.get();
            
            // Check if we have moves to animate
            if (currentState.maxMoves === 0) {
                console.warn('No moves available to animate');
                return;
            }
            
            // Stop any existing animation
            this.animationEngine.stop();
            
            // Get the target move (where we want to animate to)
            const targetMove = Math.max(1, currentState.currentMove);
            
            // Reset to beginning first
            this.state.update({ currentMove: 0 });
            
            // Start animation after a brief delay to ensure state is updated
            setTimeout(() => {
                this.animationEngine.play('forward', targetMove);
            }, 100);
        }

        nextMove() {
            const currentState = this.state.get();
            
            if (currentState.currentMove < currentState.maxMoves) {
                this.state.update({ currentMove: currentState.currentMove + 1 });
            }
        }

        prevMove() {
            const currentState = this.state.get();
            
            if (currentState.currentMove > 0) {
                this.state.update({ currentMove: currentState.currentMove - 1 });
            }
        }

        move6Forward() {
            const currentState = this.state.get();
            const targetMove = Math.min(currentState.currentMove + 6, currentState.maxMoves);
            
            this.state.update({ currentMove: targetMove });
        }

        move6Backward() {
            const currentState = this.state.get();
            const targetMove = Math.max(currentState.currentMove - 6, 0);
            
            this.state.update({ currentMove: targetMove });
        }

        goToBeginning() {
            this.animationEngine.stop();
            this.state.update({ currentMove: 0 });
        }

        goToEnd() {
            const currentState = this.state.get();
            
            this.state.update({ currentMove: currentState.maxMoves });
        }

        changeSpeed(multiplier) {
            const currentState = this.state.get();
            const newSpeed = currentState.animation.speed * multiplier;
            this.animationEngine.setSpeed(newSpeed);
        }
    }

    // ===== MAIN CONTROLLER =====
    class VariationVisualizer {
        constructor() {
            this.eventBus = new EventBus();
            this.state = new VariationState(this.eventBus);
            this.gameAdapter = new AISenseiAdapter(this.eventBus);
            this.animationEngine = new AnimationEngine(this.eventBus, this.state);
            this.ui = new UIController(this.eventBus, this.state, this.gameAdapter, this.animationEngine);
            
            this.setupEventListeners();
        }

        setupEventListeners() {
            this.eventBus.on('board-changed', () => {
                this.handleBoardChange();
            });

            this.eventBus.on('error', ({ type, error }) => {
                console.error(`VariationVisualizer error (${type}):`, error);
            });
        }

        handleBoardChange() {
            this.animationEngine.stop();
            
            const moves = this.gameAdapter.getMoves();
            const maxMoves = moves.length > 0 ? Math.max(...moves.map(m => m.moveNumber)) : 0;
            
            this.state.update({
                moves,
                maxMoves,
                currentMove: maxMoves
            });
        }

        initialize() {
            // Start monitoring the board
            this.gameAdapter.startMonitoring();
            
            // Initial board state
            this.handleBoardChange();
            
            // Install UI
            this.ui.install();
            
            // Expose methods for debugging
            window.variationVisualizer = this;
            
            // Add reload function for development
            window.reloadVariationVisualizer = () => {
                console.log('Reloading VariationVisualizer...');
                
                // Cleanup existing instance
                if (window.variationVisualizer) {
                    window.variationVisualizer.gameAdapter.stopMonitoring();
                    window.variationVisualizer.animationEngine.stop();
                    
                    // Remove UI elements
                    const existingUI = document.querySelector('.userscript-variation-controls');
                    if (existingUI) {
                        existingUI.remove();
                    }
                }
                
                // Create new instance
                setTimeout(() => {
                    const newVisualizer = new VariationVisualizer();
                    newVisualizer.initialize();
                    console.log('VariationVisualizer reloaded successfully');
                }, 100);
            };
        }
    }

    // ===== INITIALIZATION =====
    function initializeWhenReady() {
        const visualizer = new VariationVisualizer();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => visualizer.initialize(), 1000);
            });
        } else {
            setTimeout(() => visualizer.initialize(), 1000);
        }
    }

    initializeWhenReady();
})();