// ==UserScript==
// @name         Hide and show variations
// @version      0.1
// @description  Hides or shows variation stones marked with numbers. Useful for practicing sequence visualization.
// @author       Lukasz Lew
// @match        https://*.ai-sensei.com/*
// @grant        none
// ==/UserScript==

let currentMove = 0;
let maxMoves = 0;
let animationInterval = null;
let animationSpeed = 1000; // milliseconds between moves
let stonesVisible = true;
let showPrefix = false; // true = show moves 1 to current, false = show only current move

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

function showOnlyMove(moveNum) {
    console.log('=== showOnlyMove START ===', 'moveNum:', moveNum, 'currentMove:', currentMove, 'maxMoves:', maxMoves)
    
    let boards = document.getElementsByClassName('board')
    console.log('Found boards:', boards.length)
    if (boards.length === 0) {
        console.log('ERROR: No board found!')
        return
    }
    let [board] = boards
    
    let labels = board.getElementsByClassName('label')
    console.log('Found label containers:', labels.length)
    if (labels.length === 0) {
        console.log('ERROR: No label containers found!')
        return
    }
    let [coords, labelParent] = labels
    
    if (!labelParent) {
        console.log('ERROR: No labelParent found!')
        return
    }
    
    console.log('labelParent children count:', labelParent.children.length)
    
    let foundLabels = []
    let labelActions = []
    maxMoves = 0;
    
    for (let i = 0; i < labelParent.children.length; i++) {
        let label = labelParent.children[i]
        let classLabel = Array.from(label.classList).find(s=>s.startsWith('label'))
        
        if (!classLabel) {
            console.log(`Child ${i}: no label class found, classes:`, Array.from(label.classList))
            continue
        }
        
        let parts = classLabel.split('-')
        let labelText = parts[parts.length - 1]
        let moveNumber = parseInt(labelText) || 0
        
        console.log(`Child ${i}: classLabel="${classLabel}", parts=[${parts.join(',')}], labelText="${labelText}", moveNumber=${moveNumber}`)
        
        foundLabels.push({index: i, classLabel, moveNumber, labelText})
        
        if (moveNumber > maxMoves) maxMoves = moveNumber
        
        if (moveNumber > 0) {
            let shouldShow
            if (showPrefix) {
                shouldShow = moveNumber <= moveNum
            } else {
                shouldShow = moveNumber === moveNum
            }
            let action = shouldShow ? 'SHOW' : 'HIDE'
            
            console.log(`  Label action: ${action} (moveNumber ${moveNumber} ${shouldShow ? (showPrefix ? '<=' : '===') : (showPrefix ? '>' : '!==')} moveNum ${moveNum})`)
            
            // Show/hide labels
            if (shouldShow) {
                label.style.display = ''
            } else {
                label.style.display = 'none'
            }
            
            // Show/hide stones if stones are visible
            if (stonesVisible) {
                let rowS = parts[1]
                let colS = parts[2]
                let stoneClass = 'stone-' + rowS + '-' + colS
                let stones = board.getElementsByClassName(stoneClass)
                
                if (stones.length > 0) {
                    let [stone] = stones
                    if (shouldShow) {
                        stone.style.display = ''
                    } else {
                        stone.style.display = 'none'
                    }
                }
            }
            
            labelActions.push({moveNumber, action})
        }
    }
    
    console.log('=== SUMMARY ===')
    console.log('maxMoves found:', maxMoves)
    console.log('foundLabels:', foundLabels)
    console.log('labelActions:', labelActions)
    console.log('=== showOnlyMove END ===')
}

function initializeMoves() {
    console.log('=== initializeMoves START ===')
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
    
    maxMoves = 0
    currentMove = 0
    
    console.log('labelParent children count:', labelParent.children.length)
    
    for (let i = 0; i < labelParent.children.length; i++) {
        let label = labelParent.children[i]
        let classLabel = Array.from(label.classList).find(s=>s.startsWith('label'))
        
        if (!classLabel) continue
        
        let parts = classLabel.split('-')
        let labelText = parts[parts.length - 1]
        let moveNumber = parseInt(labelText) || 0
        
        console.log(`Child ${i}: classLabel="${classLabel}", labelText="${labelText}", moveNumber=${moveNumber}`)
        
        if (moveNumber > maxMoves) maxMoves = moveNumber
    }
    
    console.log('=== initializeMoves END ===', 'maxMoves:', maxMoves)
}

function nextMove() {
    console.log('=== nextMove clicked ===', 'currentMove:', currentMove, 'maxMoves:', maxMoves)
    if (maxMoves === 0) initializeMoves()
    if (currentMove < maxMoves) {
        currentMove++
        console.log('Moving to:', currentMove)
        showOnlyMove(currentMove)
    } else {
        console.log('Already at max move')
    }
}

function prevMove() {
    console.log('=== prevMove clicked ===', 'currentMove:', currentMove, 'maxMoves:', maxMoves)
    if (maxMoves === 0) initializeMoves()
    if (currentMove > 0) {
        currentMove--
        console.log('Moving to:', currentMove)
        showOnlyMove(currentMove)
    } else {
        console.log('Already at move 0')
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

function toggleStones() {
    stonesVisible = !stonesVisible
    console.log('=== toggleStones ===', stonesVisible)
    
    // Update button icon
    let toggleButton = document.querySelector('button[title="Toggle stones visibility"]')
    if (toggleButton) {
        toggleButton.querySelector('span').textContent = stonesVisible ? '⚫' : '🔢'
    }
    
    // Show/hide ALL stones immediately, regardless of current move
    let boards = document.getElementsByClassName('board')
    if (boards.length > 0) {
        let [board] = boards
        let labels = board.getElementsByClassName('label')
        if (labels.length >= 2) {
            let [coords, labelParent] = labels
            
            for (let i = 0; i < labelParent.children.length; i++) {
                let label = labelParent.children[i]
                let classLabel = Array.from(label.classList).find(s=>s.startsWith('label'))
                
                if (classLabel) {
                    let parts = classLabel.split('-')
                    let moveNumber = parseInt(parts[parts.length - 1]) || 0
                    
                    if (moveNumber > 0) {
                        let rowS = parts[1]
                        let colS = parts[2]
                        let stoneClass = 'stone-' + rowS + '-' + colS
                        let stones = board.getElementsByClassName(stoneClass)
                        
                        if (stones.length > 0) {
                            let [stone] = stones
                            if (stonesVisible) {
                                stone.style.display = ''
                            } else {
                                stone.style.display = 'none'
                            }
                        }
                    }
                }
            }
        }
    }
    
    // If currently showing a move, refresh the display
    if (currentMove > 0) {
        showOnlyMove(currentMove)
    }
}

function togglePrefix() {
    showPrefix = !showPrefix
    console.log('=== togglePrefix ===', showPrefix)
    
    // Update button icon
    let prefixButton = document.querySelector('button[title="Toggle prefix mode"]')
    if (prefixButton) {
        prefixButton.querySelector('span').textContent = showPrefix ? '🔢' : '1️⃣'
    }
    
    // If currently showing a move, refresh the display
    if (currentMove > 0) {
        showOnlyMove(currentMove)
    }
}

function animateBackward(moves = 5) {
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

    // Toggle stones visibility
    let toggleButton = button('⚫', () => toggleStones())
    toggleButton.title = 'Toggle stones visibility'
    
    let ms1 = document.createElement('span')
    ms1.className = 'ms-1'
    
    // Toggle prefix mode
    let prefixButton = button('1️⃣', () => togglePrefix())
    prefixButton.title = 'Toggle prefix mode'
    
    let ms2 = document.createElement('span')
    ms2.className = 'ms-1'
    
    // Navigation buttons with arrows
    let prevButton = button('◀', () => prevMove())
    prevButton.title = 'Previous move'
    
    let ms3 = document.createElement('span')
    ms3.className = 'ms-1'
    
    let nextButton = button('▶', () => nextMove())
    nextButton.title = 'Next move'
    
    let ms4 = document.createElement('span')
    ms4.className = 'ms-1'
    
    // Animation controls
    let animateButton = button('⏯️', () => startAnimation())
    animateButton.title = 'Animate all moves'
    
    let ms5 = document.createElement('span')
    ms5.className = 'ms-1'
    
    let animate5Button = button('5️⃣', () => startAnimation(5))
    animate5Button.title = 'Animate first 5 moves'
    
    let ms6 = document.createElement('span')
    ms6.className = 'ms-1'
    
    let animateBack5Button = button('➖5️⃣', () => animateBackward(5))
    animateBack5Button.title = 'Animate backward 5 moves'
    
    let ms7 = document.createElement('span')
    ms7.className = 'ms-1'
    
    let beginningButton = button('⏮️', () => goToBeginning())
    beginningButton.title = 'Go to beginning'
    
    let ms8 = document.createElement('span')
    ms8.className = 'ms-1'
    
    // Speed controls with speed display in between
    let slowerButton = button('🐌', () => changeSpeed(1.5))
    slowerButton.title = 'Slower animation'
    
    let ms9 = document.createElement('span')
    ms9.className = 'ms-1'
    
    // Speed display
    let speedDisplay = document.createElement('span')
    speedDisplay.id = 'speed-display'
    speedDisplay.className = 'badge bg-secondary mx-1'
    speedDisplay.textContent = `${(animationSpeed/1000).toFixed(1)}s`
    speedDisplay.title = 'Animation speed'
    
    let fasterButton = button('🐇', () => changeSpeed(0.67))
    fasterButton.title = 'Faster animation'

    let top = document.getElementsByClassName('game-sidebar')[0].parentElement
    const fc = top.firstChild
    top.insertBefore(toggleButton, fc)
    top.insertBefore(ms1, fc)
    top.insertBefore(prefixButton, fc)
    top.insertBefore(ms2, fc)
    top.insertBefore(prevButton, fc)
    top.insertBefore(ms3, fc)
    top.insertBefore(nextButton, fc)
    top.insertBefore(ms4, fc)
    top.insertBefore(animateButton, fc)
    top.insertBefore(ms5, fc)
    top.insertBefore(animate5Button, fc)
    top.insertBefore(ms6, fc)
    top.insertBefore(animateBack5Button, fc)
    top.insertBefore(ms7, fc)
    top.insertBefore(beginningButton, fc)
    top.insertBefore(ms8, fc)
    top.insertBefore(slowerButton, fc)
    top.insertBefore(ms9, fc)
    top.insertBefore(speedDisplay, fc)
    top.insertBefore(fasterButton, fc)
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
    window.addEventListener('load', () => installButtons(0), false);
})();
