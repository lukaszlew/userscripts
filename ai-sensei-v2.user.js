// ==UserScript==
// @name         Hide and show variations (Clean Architecture)
// @version      5.0
// @description  Clean architecture implementation for variation visualization on AI Sensei
// @author       Lukasz Lew
// @match        https://*.ai-sensei.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    const SCRIPT_VERSION = '5.0';
    console.log(`🎯 Variation Visualizer v${SCRIPT_VERSION} loading...`);

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
            
            // Create a copy to avoid mutating input parameter
            const changesCopy = { ...changes };
            
            // Deep merge for nested objects
            if (changesCopy.settings) {
                this.data.settings = { ...this.data.settings, ...changesCopy.settings };
                delete changesCopy.settings;
            }
            if (changesCopy.animation) {
                this.data.animation = { ...this.data.animation, ...changesCopy.animation };
                delete changesCopy.animation;
            }
            
            // Shallow merge for remaining top-level properties
            this.data = { ...this.data, ...changesCopy };
            
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
                        // WHY SPECIAL MOVES COMPARISON: moves array contains DOM elements (labelElement, stoneElement)
                        // JSON.stringify would fail due to circular references in DOM nodes
                        // We only care if the actual move sequence changed, not DOM element references
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
            this.documentObserver = null;
            this.lastBoardState = null;
            this.isMonitoring = false;
            this.boardCheckInterval = null;
            this.uiCheckInterval = null;
            this.boundHandleNavigationClick = null;
            
            this.setupCSS();
        }

        setupCSS() {
            // WHY CSS CLASSES INSTEAD OF INLINE STYLES: 
            // 1. Completely reversible - can restore original state perfectly
            // 2. No interference with AI Sensei's own style calculations
            // 3. Clean separation between our modifications and original DOM
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

            // Store bound function reference for proper cleanup
            this.boundHandleNavigationClick = this.handleNavigationClick.bind(this);
            document.addEventListener('click', this.boundHandleNavigationClick);
            
            // Store interval IDs for proper cleanup
            this.boardCheckInterval = setInterval(() => this.checkForBoardChanges(), 250);
            this.uiCheckInterval = setInterval(() => this.eventBus.emit('ui-check-needed'), 500);
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
            
            // Clear intervals
            if (this.boardCheckInterval) {
                clearInterval(this.boardCheckInterval);
                this.boardCheckInterval = null;
            }
            
            if (this.uiCheckInterval) {
                clearInterval(this.uiCheckInterval);
                this.uiCheckInterval = null;
            }
            
            // Remove event listener using stored reference
            if (this.boundHandleNavigationClick) {
                document.removeEventListener('click', this.boundHandleNavigationClick);
                this.boundHandleNavigationClick = null;
            }
            
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

                // WHY THIS COMPLEX PARSING: AI Sensei uses CSS classes to encode board positions
                // Example: class="label-10-15-3" means row=10, col=15, move=3
                // We need to extract move numbers and find corresponding stone elements
                for (let i = 0; i < labelParent.children.length; i++) {
                    const label = labelParent.children[i];
                    const classLabel = Array.from(label.classList).find(s => s.startsWith('label'));
                    
                    if (!classLabel) continue;
                    
                    // Parse "label-row-col-moveNumber" format (numbers) or "label-row-col-letter" (A,B,C,D)
                    const parts = classLabel.split('-');
                    const labelText = parts[parts.length - 1];  // Last part is move number or letter
                    const moveNumber = parseInt(labelText) || 0;
                    const isLetterMove = /^[A-Z]$/.test(labelText);
                    
                    // Include both numbered moves and letter moves (variation candidates)
                    if (moveNumber > 0 || isLetterMove) {
                        // Find the corresponding stone element using same row/col coordinates
                        const rowS = parts[1];
                        const colS = parts[2];
                        const stoneClass = 'stone-' + rowS + '-' + colS;
                        const stones = board.getElementsByClassName(stoneClass);
                        
                        const moveData = {
                            moveNumber: isLetterMove ? 999 : moveNumber,  // Letters get high number to show last
                            labelElement: label,
                            stoneElement: stones.length > 0 ? stones[0] : null,
                            isLetter: isLetterMove,
                            letterText: isLetterMove ? labelText : null
                        };
                        
                        
                        moves.push(moveData);
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

            // Calculate maxMoves excluding letter moves (which have artificial moveNumber 999)
            const numberedMoves = moves.filter(m => !m.isLetter);
            const maxMoves = numberedMoves.length > 0 ? Math.max(...numberedMoves.map(m => m.moveNumber)) : 0;

            moves.forEach(moveData => {
                let shouldShow;
                
                if (moveData.isLetter) {
                    // LETTER MOVES: Show only when we're at the "live" end of the sequence
                    // These represent current AI suggestions, not historical moves
                    shouldShow = currentMove >= maxMoves - 1; // Show only when at end position
                } else if (settings.showPrefix) {
                    // PREFIX MODE: Show entire variation sequence (all numbered moves)
                    shouldShow = moveData.moveNumber <= maxMoves;
                } else {
                    // DEFAULT MODE: Show only current + next move for cleaner visualization
                    // WHY TWO MOVES: In Go variations, seeing the immediate next move provides context
                    // When currentMove = maxMoves-1, this shows the last two moves of the sequence
                    shouldShow = moveData.moveNumber === currentMove || moveData.moveNumber === currentMove + 1;
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
            // WHY NULL/UNDEFINED CHECK: targetMove could legitimately be 0 (animate to beginning)
            // Using truthy check would incorrectly treat 0 as "no target specified"
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

    // ===== CONSTANTS =====
    const ANIMATION_SPEEDS = [0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0, 5.0];
    const SPEED_LABELS = ['0.1s', '0.15s', '0.2s', '0.3s', '0.5s', '0.7s', '1.0s', '1.5s', '2.0s', '3.0s', '5.0s'];

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
            // Handle Shift+key and Alt+key combinations, avoid input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // WHY ALT+A: Easy one-handed shortcut for most common action (toggle show/hide modes)
            // WHY NO SHIFT: Alt+A is simpler than Shift+Alt+A for frequent use
            // WHY BOTH 'a'/'A': event.key can be either depending on caps lock state
            if (event.altKey && (event.key === 'a' || event.key === 'A') && !event.shiftKey) {
                event.preventDefault();
                this.togglePrefix();
                console.log('🎯 Alt+A pressed - toggling prefix');
                return;
            }
            
            // Only handle remaining shortcuts when Shift is pressed
            if (!event.shiftKey) {
                return;
            }

            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    this.prevMove();
                    break;
                case 'ArrowRight':
                    // Shift+Alt+Right for animation, Shift+Right for next move
                    if (event.altKey) {
                        event.preventDefault();
                        this.animateToCurrentMove();
                    } else {
                        event.preventDefault();
                        this.nextMove();
                    }
                    break;
                case 'ArrowUp':
                    // Shift+Alt+Up for faster speed
                    if (event.altKey) {
                        event.preventDefault();
                        this.decreaseSpeed();
                    }
                    break;
                case 'ArrowDown':
                    // Shift+Alt+Down for slower speed
                    if (event.altKey) {
                        event.preventDefault();
                        this.increaseSpeed();
                    }
                    break;
            }
        }


        updateView(newState, changes) {
            if (!this.elements) return;

            // Update button states
            if (changes.settings) {
                if ('showPrefix' in changes.settings && this.elements.buttons && this.elements.buttons.prefix) {
                    this.updateButtonState(this.elements.buttons.prefix, newState.settings.showPrefix);
                }
            }

            // Update speed controls
            if (changes.animation && 'speed' in changes.animation) {
                this.updateSpeedControls();
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

            try {
                this.elements = this.createSidebarControls();
                
                // Insert at the end of the sidebar top card
                sidebarTopCard.appendChild(this.elements);
                
                console.log('UI controls installed successfully');
            } catch (error) {
                console.error('Error installing UI controls:', error);
                setTimeout(() => this.install(retryCount + 1), 200);
            }
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
            this.elements = { 
                buttons: {}, 
                container, 
                speedDropdown: null 
            };
            
            // Prefix toggle button (inverted logic: ON = hide moves, OFF = show all)
            this.elements.buttons.prefix = this.createCompactButton('🟢', () => this.togglePrefix());
            this.elements.buttons.prefix.title = 'Hide/show moves: ON = last moves only, OFF = all moves (Alt+A)';
            this.updateButtonState(this.elements.buttons.prefix, currentState.settings.showPrefix);
            
            // Animate button
            this.elements.buttons.animateToHere = this.createCompactButton('▶️', () => this.animateToCurrentMove());
            this.elements.buttons.animateToHere.title = 'Animate variation up to current move (Shift+Alt+→)';
            
            // Speed dropdown
            this.elements.speedDropdown = this.createSpeedDropdown(currentState);
            
            // Animation button
            this.elements.buttons.animate = this.createAnimationButton(currentState);
            
            // Navigation buttons
            this.elements.buttons.prev = this.createCompactButton('⏴', () => this.prevMove());
            this.elements.buttons.prev.title = 'Previous move (Shift+←)';
            
            this.elements.buttons.next = this.createCompactButton('⏵', () => this.nextMove());
            this.elements.buttons.next.title = 'Next move (Shift+→)';
            
            // Add controls to row
            controlsRow.appendChild(this.elements.buttons.prefix);
            
            // Add separator
            const separator1 = document.createElement('span');
            separator1.className = 'text-muted';
            separator1.textContent = '|';
            controlsRow.appendChild(separator1);
            
            controlsRow.appendChild(this.elements.buttons.prev);
            controlsRow.appendChild(this.elements.buttons.next);
            
            // Add separator
            const separator2 = document.createElement('span');
            separator2.className = 'text-muted';
            separator2.textContent = '|';
            controlsRow.appendChild(separator2);
            
            controlsRow.appendChild(this.elements.speedDropdown);
            controlsRow.appendChild(this.elements.buttons.animate);
            
            // Assemble container
            container.appendChild(header);
            container.appendChild(controlsRow);
            
            return container;
        }

        createSpeedDropdown(currentState) {
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm';
            select.style.fontSize = '0.8em';
            select.style.padding = '0.25rem 0.5rem';
            select.style.minWidth = '4em';
            select.style.maxWidth = '4.5em';
            select.style.border = '1px solid #dee2e6';
            select.style.borderRadius = '0.375rem';
            select.style.backgroundColor = '#6c757d';
            select.style.color = '#fff';
            select.style.appearance = 'none';
            select.style.backgroundImage = 'none';
            select.style.cursor = 'pointer';
            select.title = 'Animation speed (Shift+Alt+↑/↓)';
            
            ANIMATION_SPEEDS.forEach((speed, index) => {
                const option = document.createElement('option');
                option.value = speed * 1000;
                option.textContent = SPEED_LABELS[index];
                // WHY 50ms TOLERANCE: Floating-point precision can cause exact matches to fail
                // e.g. speed might be 999.999ms instead of exactly 1000ms due to calculations
                if (Math.abs(speed * 1000 - currentState.animation.speed) < 50) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            
            select.addEventListener('change', () => {
                const newSpeed = parseInt(select.value);
                this.animationEngine.setSpeed(newSpeed);
            });
            
            return select;
        }

        createAnimationButton(currentState) {
            // Create a simple animation button
            const button = document.createElement('button');
            button.className = 'btn btn-outline-secondary btn-sm';
            button.style.fontSize = '0.8em';
            button.style.padding = '0.25rem 0.5rem';
            button.style.minWidth = '2.2em';
            button.title = 'Animate variation up to current move (Shift+Alt+→)';
            button.textContent = '▶️';
            
            button.addEventListener('click', () => this.animateToCurrentMove());
            
            return button;
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

        updateButtonState(button, isPressed) {
            // WHY INVERTED LOGIC: Button represents "filter active" not "show all active"
            // Green ON = filtering active (hiding older moves) = cleaner default view
            // Light OFF = no filtering (show all moves) = detailed analysis mode
            // This matches traffic light metaphor: green = go/active, dark = inactive
            if (!isPressed) {
                // DEFAULT STATE: Filter active, showing only recent moves (green light ON)
                button.className = 'btn btn-success btn-sm';
                button.style.backgroundColor = '#28a745';
                button.style.borderColor = '#28a745';
                button.style.color = '#fff';
                button.innerHTML = '🟢'; // Green light ON = filter active
                console.log('🎯 Hide mode ON - showing last moves only (green light)');
            } else {
                // PREFIX MODE: No filtering, showing all moves (light OFF)
                button.className = 'btn btn-outline-secondary btn-sm';
                button.style.backgroundColor = '';
                button.style.borderColor = '';
                button.style.color = '';
                button.innerHTML = '⚫'; // Light OFF = no filtering
                console.log('🎯 Show all mode ON - showing all moves (light off)');
            }
            
            // Remove all the flashy effects
            button.style.boxShadow = 'none';
            button.style.transform = 'scale(1)';
            button.style.animation = 'none';
            button.style.transition = 'all 0.2s ease-in-out';
        }


        // Action methods
        togglePrefix() {
            this.animationEngine.stop();
            const currentState = this.state.get();
            const newPrefixState = !currentState.settings.showPrefix;
            console.log(`🔄 Toggling prefix from ${currentState.settings.showPrefix} to ${newPrefixState}`);
            
            this.state.update({
                settings: { showPrefix: newPrefixState }
            });
            
            this.forceUpdatePrefixButton(newPrefixState);
        }

        forceUpdatePrefixButton(newPrefixState) {
            const prefixButton = this.findPrefixButton();
            if (prefixButton) {
                console.log('🎯 Force updating prefix button style');
                this.updateButtonState(prefixButton, newPrefixState);
            } else {
                console.warn('⚠️ Prefix button element not found anywhere!');
            }
        }

        findPrefixButton() {
            // Try stored reference first
            if (this.elements && this.elements.buttons && this.elements.buttons.prefix) {
                console.log('🎯 Found prefix button via stored reference');
                return this.elements.buttons.prefix;
            }
            
            // Fallback: search DOM for button with light emojis
            const buttons = document.querySelectorAll('.userscript-variation-controls button');
            for (const btn of buttons) {
                if (btn.innerHTML.includes('🟢') || btn.innerHTML.includes('⚫')) {
                    console.log('🎯 Found prefix button via DOM search');
                    return btn;
                }
            }
            
            return null;
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
            // WHY ANIMATE TO maxMoves-1: This triggers our "show last 2 moves" display
            // Animation builds up the sequence, then stops at the natural viewing state
            // User sees the full variation build-up, ending with clean 2-move view
            const targetMove = Math.max(0, currentState.maxMoves - 1);
            
            // Reset to beginning first
            this.state.update({ currentMove: 0 });
            
            // Start animation after a brief delay to ensure state is updated
            setTimeout(() => {
                this.animationEngine.play('forward', targetMove);
            }, 100);
        }

        nextMove() {
            this.animationEngine.stop();
            const currentState = this.state.get();
            
            if (currentState.currentMove < currentState.maxMoves) {
                this.state.update({ currentMove: currentState.currentMove + 1 });
            }
        }

        prevMove() {
            this.animationEngine.stop();
            const currentState = this.state.get();
            
            if (currentState.currentMove > 0) {
                this.state.update({ currentMove: currentState.currentMove - 1 });
            }
        }


        findSpeedIndex(currentSpeedMs) {
            // Find closest speed index with better precision handling
            let closestIndex = 0;
            let minDiff = Infinity;
            
            ANIMATION_SPEEDS.forEach((speed, index) => {
                const diff = Math.abs(speed * 1000 - currentSpeedMs);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = index;
                }
            });
            
            return closestIndex;
        }

        increaseSpeed() {
            const currentSpeedMs = this.state.get().animation.speed;
            const currentIndex = this.findSpeedIndex(currentSpeedMs);
            
            if (currentIndex < ANIMATION_SPEEDS.length - 1) {
                const nextIndex = currentIndex + 1;
                this.animationEngine.setSpeed(ANIMATION_SPEEDS[nextIndex] * 1000);
                console.log(`⚡ Speed increased to ${ANIMATION_SPEEDS[nextIndex]}s`);
                
                // Update dropdown and display immediately
                this.updateSpeedControls();
            }
        }
        
        decreaseSpeed() {
            const currentSpeedMs = this.state.get().animation.speed;
            const currentIndex = this.findSpeedIndex(currentSpeedMs);
            
            if (currentIndex > 0) {
                const nextIndex = currentIndex - 1;
                this.animationEngine.setSpeed(ANIMATION_SPEEDS[nextIndex] * 1000);
                console.log(`🐌 Speed decreased to ${ANIMATION_SPEEDS[nextIndex]}s`);
                
                // Update dropdown and display immediately
                this.updateSpeedControls();
            }
        }
        
        updateSpeedControls() {
            this.updateSpeedDropdown();
        }
        
        updateSpeedDropdown() {
            if (this.elements && this.elements.speedDropdown) {
                const currentSpeed = this.state.get().animation.speed;
                this.elements.speedDropdown.value = currentSpeed;
                console.log(`📊 Speed dropdown updated to ${currentSpeed}ms`);
            } else {
                // Fallback: search in DOM
                const dropdown = document.querySelector('.userscript-variation-controls .form-select');
                if (dropdown) {
                    const currentSpeed = this.state.get().animation.speed;
                    dropdown.value = currentSpeed;
                    console.log(`📊 Speed dropdown updated to ${currentSpeed}ms`);
                }
            }
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
            // Calculate maxMoves excluding letter moves (which have artificial moveNumber 999)
            const numberedMoves = moves.filter(m => !m.isLetter);
            const maxMoves = numberedMoves.length > 0 ? Math.max(...numberedMoves.map(m => m.moveNumber)) : 0;
            
            // WHY maxMoves - 1: With our "show current + next" logic, this displays the last 2 moves
            // When currentMove = maxMoves-1, we show moves (maxMoves-1) and (maxMoves)
            // This provides context while keeping the board clean
            const defaultCurrentMove = Math.max(0, maxMoves - 1);
            
            this.state.update({
                moves,
                maxMoves,
                currentMove: defaultCurrentMove
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
                console.log(`🔄 Reloading VariationVisualizer v${SCRIPT_VERSION}...`);
                
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
                    console.log(`✅ VariationVisualizer v${SCRIPT_VERSION} reloaded successfully`);
                }, 100);
            };
        }
    }

    // ===== INITIALIZATION =====
    function initializeWhenReady() {
        const visualizer = new VariationVisualizer();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    visualizer.initialize();
                    console.log(`✅ Variation Visualizer v${SCRIPT_VERSION} initialized`);
                }, 1000);
            });
        } else {
            setTimeout(() => {
                visualizer.initialize();
                console.log(`✅ Variation Visualizer v${SCRIPT_VERSION} initialized`);
            }, 1000);
        }
    }

    initializeWhenReady();
})();