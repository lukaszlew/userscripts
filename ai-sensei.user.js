// ==UserScript==
// @name         Hide and show variations
// @version      0.1
// @description  Hides or shows variation stones marked with numbers. Useful for practicing sequence visualization.
// @author       Lukasz Lew
// @match        https://*.ai-sensei.com/*
// @grant        none
// ==/UserScript==

// Add CSS for non-invasive hiding
const style = document.createElement('style');
style.textContent = `
  .userscript-hidden { display: none !important; }
`;
document.head.appendChild(style);

let currentMove = 0;
let maxMoves = 0;
let animationInterval = null;
let animationSpeed = 1000; // milliseconds between moves
let stonesVisible = false; // start disabled
let showPrefix = false; // start disabled 
let animateMode = false; // true = animate, false = immediate
let lastBoardState = null;
let moveElements = []; // Store original move data structure

function hideVarStones(hide) {
    console.log('hideVarStones', hide)
    let [board] = document.getElementsByClassName('board')
    let [coords, labelParent] = board.getElementsByClassName('label')
    //console.log(coords.children.length==19)
    let allClassLabels = []
    for (let label of labelParent.children) {
        let [classLabel] = Array.from(label.classList).filter(s=>s.startsWith('label'))
        let [stoneS, rowS, colS, labelS] = classLabel.split('-')
        let stoneClass = 'stone-' + rowS + '-' + colS
        let stone = board.getElementsByClassName(stoneClass)
        if (stone.length > 0) {
            let [s] = stone
            if (hide) {
                s.style='display:none'
                allClassLabels.push(label.classList)
                label.classList.remove('black-stone')
                label.classList.add('white-stone')
            } else {
                s.style=''
                label.classList.remove('black-stone')
                label.classList.remove('white-stone')
                if (label.classList.contains('black-text')) {
                    label.classList.add('black-stone')
                } else {
                    label.classList.add('white-stone')
                }
            }
        }
    }
    return [board, allClassLabels]
}

function captureOriginalState() {
    console.log('=== captureOriginalState START ===')
    
    // First, reset all our modifications to get clean state
    resetToNaturalState()
    
    moveElements = []
    maxMoves = 0
    
    let boards = document.getElementsByClassName('board')
    if (boards.length === 0) {
        console.log('ERROR: No board found!')
        return
    }
    let [board] = boards
    
    let labels = board.getElementsByClassName('label')
    if (labels.length < 2) {
        console.log('ERROR: Need at least 2 label containers!')
        return
    }
    let [coords, labelParent] = labels
    
    for (let i = 0; i < labelParent.children.length; i++) {
        let label = labelParent.children[i]
        let classLabel = Array.from(label.classList).find(s=>s.startsWith('label'))
        
        if (!classLabel) continue
        
        let parts = classLabel.split('-')
        let labelText = parts[parts.length - 1]
        let moveNumber = parseInt(labelText) || 0
        
        if (moveNumber > 0) {
            let rowS = parts[1]
            let colS = parts[2]
            let stoneClass = 'stone-' + rowS + '-' + colS
            let stones = board.getElementsByClassName(stoneClass)
            
            let moveData = {
                moveNumber,
                labelElement: label,
                stoneElement: stones.length > 0 ? stones[0] : null
            }
            
            moveElements.push(moveData)
            console.log(`Captured move ${moveNumber}:`, moveData)
            
            if (moveNumber > maxMoves) maxMoves = moveNumber
        }
    }
    
    console.log('=== captureOriginalState END ===', 'captured', moveElements.length, 'moves, maxMoves:', maxMoves)
}

function resetToNaturalState() {
    console.log('=== resetToNaturalState START ===')
    
    // Remove all our CSS classes from all elements
    let boards = document.getElementsByClassName('board')
    if (boards.length > 0) {
        let [board] = boards
        let hiddenElements = board.querySelectorAll('.userscript-hidden')
        hiddenElements.forEach(el => el.classList.remove('userscript-hidden'))
    }
    
    console.log('=== resetToNaturalState END ===')
}

function applyVisibilityRules(moveNum) {
    console.log('=== applyVisibilityRules START ===', 'moveNum:', moveNum, 'stonesVisible:', stonesVisible, 'showPrefix:', showPrefix)
    
    if (moveElements.length === 0) {
        console.log('No move elements captured, calling captureOriginalState')
        captureOriginalState()
    }
    
    // First reset to natural state
    resetToNaturalState()
    
    // If no toggles are enabled, leave everything in natural state
    if (!stonesVisible && !showPrefix) {
        console.log('No toggles enabled, leaving in natural state')
        console.log('=== applyVisibilityRules END ===')
        return
    }
    
    for (let moveData of moveElements) {
        let shouldShow
        if (showPrefix) {
            shouldShow = moveData.moveNumber <= moveNum
        } else {
            shouldShow = moveData.moveNumber === moveNum
        }
        
        console.log(`Move ${moveData.moveNumber}: shouldShow=${shouldShow}`)
        
        // Apply label visibility using CSS classes
        if (!shouldShow) {
            moveData.labelElement.classList.add('userscript-hidden')
        }
        
        // Apply stone visibility using CSS classes
        if (moveData.stoneElement) {
            if (!shouldShow || !stonesVisible) {
                moveData.stoneElement.classList.add('userscript-hidden')
            }
        }
    }
    
    console.log('=== applyVisibilityRules END ===')
}

function showOnlyMove(moveNum) {
    console.log('=== showOnlyMove START ===', 'moveNum:', moveNum, 'currentMove:', currentMove, 'maxMoves:', maxMoves)
    applyVisibilityRules(moveNum)
    console.log('=== showOnlyMove END ===')
}

function initializeMoves() {
    console.log('=== initializeMoves START ===')
    // Only capture if we don't have any moves yet, board changes will recapture
    if (moveElements.length === 0) {
        captureOriginalState()
    }
    currentMove = 0
    console.log('=== initializeMoves END ===', 'maxMoves:', maxMoves)
}

function nextMove() {
    console.log('=== nextMove clicked ===', 'currentMove:', currentMove, 'maxMoves:', maxMoves, 'animateMode:', animateMode)
    if (maxMoves === 0) initializeMoves()
    
    if (animateMode) {
        startAnimation()
    } else {
        if (currentMove < maxMoves) {
            currentMove++
            console.log('Moving to:', currentMove)
            if (stonesVisible || showPrefix) {
                showOnlyMove(currentMove)
            }
        } else {
            console.log('Already at max move')
        }
    }
}

function prevMove() {
    console.log('=== prevMove clicked ===', 'currentMove:', currentMove, 'maxMoves:', maxMoves, 'animateMode:', animateMode)
    if (maxMoves === 0) initializeMoves()
    
    if (animateMode) {
        animateBackward()
    } else {
        if (currentMove > 0) {
            currentMove--
            console.log('Moving to:', currentMove)
            if (stonesVisible || showPrefix) {
                showOnlyMove(currentMove)
            }
        } else {
            console.log('Already at move 0')
        }
    }
}

function move6Forward() {
    if (animateMode) {
        startAnimation(Math.min(currentMove + 6, maxMoves))
    } else {
        currentMove = Math.min(currentMove + 6, maxMoves)
        if (stonesVisible || showPrefix) {
            showOnlyMove(currentMove)
        }
    }
}

function move6Backward() {
    if (animateMode) {
        animateBackward(6)
    } else {
        currentMove = Math.max(currentMove - 6, 0)
        if (stonesVisible || showPrefix) {
            showOnlyMove(currentMove)
        }
    }
}

function goToEnd() {
    console.log('=== goToEnd ===')
    if (maxMoves === 0) initializeMoves()
    
    if (animateMode) {
        startAnimation()
    } else {
        currentMove = maxMoves
        if (stonesVisible || showPrefix) {
            showOnlyMove(currentMove)
        }
    }
}

function startAnimation(maxMove = null) {
    console.log('=== startAnimation ===', 'speed:', animationSpeed, 'maxMove:', maxMove)
    if (maxMoves === 0) initializeMoves()
    if (maxMoves === 0) {
        console.log('No moves found to animate')
        return
    }
    
    stopAnimation()
    currentMove = 0
    continueAnimation(maxMove)
}

function goToBeginning() {
    console.log('=== goToBeginning ===')
    stopAnimation()
    currentMove = 0
    showOnlyMove(0) // Hide all moves
}

function updateButtonStyle(button, isPressed) {
    if (isPressed) {
        button.classList.add('btn-success')
        button.classList.remove('btn-primary')
        button.style.boxShadow = 'inset 0 3px 5px rgba(0,0,0,0.3)'
    } else {
        button.classList.add('btn-primary')
        button.classList.remove('btn-success')
        button.style.boxShadow = ''
    }
}

function toggleStones() {
    stonesVisible = !stonesVisible
    console.log('=== toggleStones ===', stonesVisible)
    
    // Update button style
    let toggleButton = document.querySelector('button[title="Toggle stones visibility"]')
    if (toggleButton) {
        updateButtonStyle(toggleButton, stonesVisible)
    }
    
    // Apply visibility rules or reset to natural state
    if (currentMove > 0) {
        if (stonesVisible || showPrefix) {
            applyVisibilityRules(currentMove)
        } else {
            resetToNaturalState()
        }
    }
}

function togglePrefix() {
    showPrefix = !showPrefix
    console.log('=== togglePrefix ===', showPrefix)
    
    // Update button style
    let prefixButton = document.querySelector('button[title="Toggle prefix mode"]')
    if (prefixButton) {
        updateButtonStyle(prefixButton, showPrefix)
    }
    
    // Apply visibility rules or reset to natural state
    if (currentMove > 0) {
        if (stonesVisible || showPrefix) {
            applyVisibilityRules(currentMove)
        } else {
            resetToNaturalState()
        }
    }
}

function toggleAnimate() {
    animateMode = !animateMode
    console.log('=== toggleAnimate ===', animateMode)
    
    // Update button style
    let animateButton = document.querySelector('button[title="Toggle animation mode"]')
    if (animateButton) {
        updateButtonStyle(animateButton, animateMode)
    }
}

function animateBackward(moves = 6) {
    console.log('=== animateBackward ===', 'moves:', moves)
    if (maxMoves === 0) initializeMoves()
    if (maxMoves === 0) {
        console.log('No moves found to animate')
        return
    }
    
    stopAnimation()
    
    // Start from current position or max if at beginning
    if (currentMove === 0) {
        currentMove = Math.min(moves, maxMoves)
    }
    
    animationInterval = setInterval(() => {
        currentMove--
        console.log('Backward animation step:', currentMove)
        showOnlyMove(currentMove)
        
        if (currentMove <= 0) {
            console.log('Backward animation complete')
            stopAnimation()
        }
    }, animationSpeed)
}

function stopAnimation() {
    if (animationInterval) {
        console.log('=== stopAnimation ===')
        clearInterval(animationInterval)
        animationInterval = null
    }
}

function changeSpeed(multiplier) {
    let oldSpeed = animationSpeed
    animationSpeed = Math.max(100, Math.min(5000, animationSpeed * multiplier))
    console.log('Speed changed from:', oldSpeed, 'to:', animationSpeed, 'ms')
    updateSpeedDisplay()
    
    // If animation is running, restart with new speed
    if (animationInterval) {
        let savedMove = currentMove
        let targetMax = maxMoves // Keep same target
        stopAnimation()
        currentMove = savedMove
        continueAnimation(targetMax)
    }
}

function continueAnimation(maxMove = null) {
    if (maxMoves === 0) return
    
    let targetMax = maxMove || maxMoves
    
    animationInterval = setInterval(() => {
        currentMove++
        console.log('Animation step:', currentMove, '/', targetMax)
        showOnlyMove(currentMove)
        
        if (currentMove >= targetMax) {
            console.log('Animation complete')
            stopAnimation()
        }
    }, animationSpeed)
}

function updateSpeedDisplay() {
    let speedDisplay = document.getElementById('speed-display')
    if (speedDisplay) {
        speedDisplay.textContent = `${(animationSpeed/1000).toFixed(1)}s`
    }
}

function getBoardState() {
    let boards = document.getElementsByClassName('board')
    if (boards.length === 0) return null
    
    let [board] = boards
    let labels = board.getElementsByClassName('label')
    if (labels.length < 2) return null
    
    let [coords, labelParent] = labels
    let state = []
    
    for (let i = 0; i < labelParent.children.length; i++) {
        let label = labelParent.children[i]
        let classLabel = Array.from(label.classList).find(s=>s.startsWith('label'))
        if (classLabel) {
            state.push(classLabel)
        }
    }
    
    return state.sort().join('|')
}

function onBoardChange() {
    console.log('=== Board changed detected ===')
    stopAnimation()
    
    // Capture fresh DOM state from AI Sensei's new board
    captureOriginalState()
    
    if (maxMoves > 0) {
        currentMove = maxMoves
        console.log('Starting at end of variation, move:', currentMove)
        
        // Apply modifications if toggles enabled, otherwise stay in natural state
        if (stonesVisible || showPrefix) {
            applyVisibilityRules(currentMove)
        } else {
            // Board is already in natural state after captureOriginalState()
            console.log('No toggles enabled, staying in natural state')
        }
    }
    
    lastBoardState = getBoardState()
}

function checkForBoardChanges() {
    let currentBoardState = getBoardState()
    if (currentBoardState && currentBoardState !== lastBoardState) {
        onBoardChange()
    }
}

function startBoardMonitoring() {
    console.log('=== Starting board monitoring ===')
    
    // Initial state - capture clean DOM state from AI Sensei
    lastBoardState = getBoardState()
    if (lastBoardState) {
        captureOriginalState() // Capture fresh state initially
        if (maxMoves > 0) {
            currentMove = maxMoves
            // Only apply if toggles are enabled, otherwise stay natural
            if (stonesVisible || showPrefix) {
                applyVisibilityRules(currentMove)
            } else {
                console.log('Initial load: No toggles enabled, staying in natural state')
            }
        }
    }
    
    // Monitor for changes every 500ms
    setInterval(checkForBoardChanges, 500)
    
    // Also listen for AI Sensei's navigation button clicks
    document.addEventListener('click', (event) => {
        let target = event.target.closest('div')
        if (target && (
            target.classList.contains('navigate-next-move') ||
            target.classList.contains('navigate-previous-move') ||
            target.classList.contains('navigate-last-move') ||
            target.classList.contains('navigate-back-to-game')
        )) {
            console.log('AI Sensei navigation clicked')
            setTimeout(checkForBoardChanges, 100) // Check after navigation completes
        }
    })
}

function installButtons(n=0) {
    function stillUndefined(x) {
        if (typeof x === "undefined") {
            let delay = 200
            if (n*delay/1000 > 10) return  // give up on 10 seconds
            console.log('retry ', n)
            setTimeout(() => installButtons(n+1), delay)
            return true
        }
        return false
    }

    let problemButton = document.getElementsByClassName('tutorial-anchor-add-problem-button')[0]
    if (stillUndefined(problemButton)) return;
    window.pb = problemButton
    console.log(problemButton)

    let row = problemButton.parentElement

    function button(label, fn) {
        let b = document.createElement('button')
        b.className = "btn btn-primary"
        b.title = "Hides or shows variation stones marked with numbers. Useful for practicing sequence visualization."
        b.addEventListener("click", fn)
        let s = document.createElement('span')
        s.className = "d-flex align-items-center"
        s.innerHTML = label
        b.appendChild(s)

        return b
    }

    // Create container for first row
    let firstRow = document.createElement('div')
    firstRow.className = 'd-flex flex-wrap align-items-center mb-2'
    
    // Toggle buttons - keep same icon always
    let toggleStonesButton = button('⚫', () => toggleStones())
    toggleStonesButton.title = 'Toggle stones visibility'
    updateButtonStyle(toggleStonesButton, stonesVisible)
    
    let prefixButton = button('🔢', () => togglePrefix())
    prefixButton.title = 'Toggle prefix mode'
    updateButtonStyle(prefixButton, showPrefix)
    
    let animateToggleButton = button('⚡', () => toggleAnimate())
    animateToggleButton.title = 'Toggle animation mode'
    updateButtonStyle(animateToggleButton, animateMode)
    
    // Add toggle buttons to first row
    firstRow.appendChild(toggleStonesButton)
    firstRow.appendChild(document.createElement('span')).className = 'ms-1'
    firstRow.appendChild(prefixButton)
    firstRow.appendChild(document.createElement('span')).className = 'ms-1'
    firstRow.appendChild(animateToggleButton)
    
    // Create container for second row - navigation
    let secondRow = document.createElement('div')
    secondRow.className = 'd-flex flex-wrap align-items-center mb-2'
    
    // Navigation buttons with symmetric layout
    let beginningButton = button('⏮', () => goToBeginning())
    beginningButton.title = 'Go to beginning'
    
    let back6Button = button('⏪', () => move6Backward())
    back6Button.title = 'Move/animate 6 backward'
    
    let prevButton = button('⏴', () => prevMove())
    prevButton.title = 'Previous move/animate all'
    
    let nextButton = button('⏵', () => nextMove())
    nextButton.title = 'Next move/animate all'
    
    let forward6Button = button('⏩', () => move6Forward())
    forward6Button.title = 'Move/animate 6 forward'
    
    let endButton = button('⏭', () => goToEnd())
    endButton.title = 'Go to end'
    
    // Add navigation buttons to second row
    secondRow.appendChild(beginningButton)
    secondRow.appendChild(document.createElement('span')).className = 'ms-1'
    secondRow.appendChild(back6Button)
    secondRow.appendChild(document.createElement('span')).className = 'ms-1'
    secondRow.appendChild(prevButton)
    secondRow.appendChild(document.createElement('span')).className = 'ms-1'
    secondRow.appendChild(nextButton)
    secondRow.appendChild(document.createElement('span')).className = 'ms-1'
    secondRow.appendChild(forward6Button)
    secondRow.appendChild(document.createElement('span')).className = 'ms-1'
    secondRow.appendChild(endButton)
    
    // Create container for third row - speed controls
    let thirdRow = document.createElement('div')
    thirdRow.className = 'd-flex flex-wrap align-items-center'
    
    let slowerButton = button('🐌', () => changeSpeed(1.5))
    slowerButton.title = 'Slower animation'
    
    // Speed display
    let speedDisplay = document.createElement('span')
    speedDisplay.id = 'speed-display'
    speedDisplay.className = 'badge bg-secondary mx-2'
    speedDisplay.textContent = `${(animationSpeed/1000).toFixed(1)}s`
    speedDisplay.title = 'Animation speed'
    
    let fasterButton = button('🐰', () => changeSpeed(0.67))
    fasterButton.title = 'Faster animation'
    
    // Add speed controls to third row
    thirdRow.appendChild(slowerButton)
    thirdRow.appendChild(speedDisplay)
    thirdRow.appendChild(fasterButton)

    let top = document.getElementsByClassName('game-sidebar')[0].parentElement
    const fc = top.firstChild
    top.insertBefore(firstRow, fc)
    top.insertBefore(secondRow, fc)
    top.insertBefore(thirdRow, fc)
}

(function() {
    'use strict';
    //console.log('HI')
    window.hideVarStones = hideVarStones
    window.showOnlyMove = showOnlyMove
    window.nextMove = nextMove
    window.prevMove = prevMove
    window.startAnimation = startAnimation
    window.stopAnimation = stopAnimation
    window.changeSpeed = changeSpeed
    window.updateSpeedDisplay = updateSpeedDisplay
    window.toggleStones = toggleStones
    window.goToBeginning = goToBeginning
    window.togglePrefix = togglePrefix
    window.animateBackward = animateBackward
    window.toggleAnimate = toggleAnimate
    window.move6Forward = move6Forward
    window.move6Backward = move6Backward
    window.goToEnd = goToEnd
    window.resetToNaturalState = resetToNaturalState
    window.addEventListener('load', () => {
        installButtons(0)
        setTimeout(startBoardMonitoring, 1000) // Start monitoring after page loads
    }, false);
})();
