// ==UserScript==
// @name         Hide and show variations
// @version      0.1
// @description  Hides or shows variation stones marked with numbers. Useful for practicing sequence visualization.
// @author       Lukasz Lew
// @match        https://*.ai-sensei.com/*
// @grant        none
// ==/UserScript==

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

    let hideButton = button('Hide stones', () => hideVarStones(true))
    let ms1 = document.createElement('span')
    ms1.className = 'ms-1'
    let showButton = button('Show stones', () => hideVarStones(false))

    let top = document.getElementsByClassName('game-sidebar')[0].parentElement
    const fc = top.firstChild
    top.insertBefore(hideButton, fc)
    top.insertBefore(ms1, fc)
    top.insertBefore(showButton, fc)
}

(function() {
    'use strict';
    //console.log('HI')
    window.hideVarStones = hideVarStones
    window.addEventListener('load', () => installButtons(0), false);
})();

--
Łukasz
