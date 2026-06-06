// Game Core Constants & Engine States
const GRID_SIZE = 7;
const GAME_COLORS = {
    red: '#e74c3c', blue: '#3498db', white: '#f8fafc', black: '#0f172a',
    pink: '#f48fb1', green: '#2ecc71', yellow: '#f1c40f', purple: '#9b59b6'
};

let gameMode = 'pass'; // 'pass', 'ai', 'online'
let savedUsername = localStorage.getItem('barricade_user') || '';

let p1Color = '#e74c3c';
let p2Color = '#3498db';

let activeTurn = 'p1'; // 'p1' or 'p2'
let playerPieces = { p1: { r: 1, c: 3 }, p2: { r: 5, c: 3 } };
let wallsDatabase = new Set();
let matchmakingInterval = null;

// Initialization on Window Load
window.onload = function() {
    if(savedUsername) {
        document.getElementById('player-username').value = savedUsername;
    }
};

// UI Navigation System
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function toggleModal(modalId, isOpen) {
    document.getElementById(modalId).style.display = isOpen ? 'flex' : 'none';
}

// Color Selection Setup
function openColorSelection(mode) {
    gameMode = mode;
    const p1Container = document.getElementById('p1-colors');
    const p2Container = document.getElementById('p2-colors');
    
    p1Container.innerHTML = '';
    p2Container.innerHTML = '';
    
    document.getElementById('p2-title').innerText = (mode === 'ai') ? "AI Bot Color" : "Player 2 Color";

    Object.keys(GAME_COLORS).forEach(colorName => {
        // Create nodes for P1
        let n1 = document.createElement('div');
        n1.className = `color-node ${GAME_COLORS[colorName] === p1Color ? 'selected' : ''}`;
        n1.style.backgroundColor = GAME_COLORS[colorName];
        n1.onclick = () => {
            p1Color = GAME_COLORS[colorName];
            openColorSelection(gameMode);
        };
        p1Container.appendChild(n1);

        // Create nodes for P2
        let n2 = document.createElement('div');
        n2.className = `color-node ${GAME_COLORS[colorName] === p2Color ? 'selected' : ''}`;
        n2.style.backgroundColor = GAME_COLORS[colorName];
        n2.onclick = () => {
            p2Color = GAME_COLORS[colorName];
            openColorSelection(gameMode);
        };
        p2Container.appendChild(n2);
    });

    showScreen('color-screen');
}

function launchLocalGame() {
    if (p1Color === p2Color) {
        alert("Both players cannot choose the same color! Please pick distinct colors.");
        return;
    }
    setupFreshMatch();
}

// Online Matchmaking Simulator Logic
function startOnlineSetup() {
    if(savedUsername) {
        document.getElementById('player-username').value = savedUsername;
    }
    showScreen('online-name-screen');
}

function connectOnlinePvP() {
    const inputName = document.getElementById('player-username').value.trim();
    if(!inputName) {
        alert("Please choose a valid nickname before joining the queue.");
        return;
    }
    
    savedUsername = inputName;
    localStorage.setItem('barricade_user', savedUsername);

    // Setup Matchmaking Workspace UI
    document.getElementById('user-display-name').innerText = savedUsername;
    document.getElementById('user-avatar').innerText = savedUsername.charAt(0).toUpperCase();
    document.getElementById('server-notice').classList.add('hide');
    
    document.getElementById('opponent-avatar').innerText = '?';
    document.getElementById('opponent-display-name').innerText = 'Searching...';
    document.getElementById('matchmaking-status').innerText = 'Searching for Opponents...';

    showScreen('matchmaking-screen');

    let cycleCount = 0;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const fakeOpponents = ["ShadowBlade", "NexusPro", "Matrix_Rider", "QuantumBot", "AlphaOmega"];
    const targetOpponent = fakeOpponents[Math.floor(Math.random() * fakeOpponents.length)];

    matchmakingInterval = setInterval(() => {
        cycleCount++;
        // Cycle active character on the animated center matchmaking dice
        document.getElementById('matchmaking-dice').innerText = letters.charAt(Math.floor(Math.random() * letters.length));
        
        if (cycleCount === 15) {
            // Trigger Random Fail/Success Factor Simulation
            let serverIsReachable = Math.random() > 0.3; // 70% connection rate simulation
            
            if (!serverIsReachable) {
                clearInterval(matchmakingInterval);
                document.getElementById('server-notice').classList.remove('hide');
                document.getElementById('matchmaking-status').innerText = 'Connection Failed';
                document.getElementById('matchmaking-dice').innerText = '⚠️';
            } else {
                clearInterval(matchmakingInterval);
                document.getElementById('matchmaking-dice').innerText = targetOpponent.charAt(0);
                document.getElementById('opponent-avatar').innerText = targetOpponent.charAt(0);
                document.getElementById('opponent-display-name').innerText = targetOpponent;
                document.getElementById('matchmaking-status').innerText = 'Match Found! Loading...';
                
                setTimeout(() => {
                    gameMode = 'online';
                    p1Color = '#64ffda'; // Forced Competitive presets
                    p2Color = '#ff7675';
                    setupFreshMatch();
                }, 1800);
            }
        }
    }, 200);
}

function cancelMatchmaking() {
    clearInterval(matchmakingInterval);
    showScreen('menu-screen');
}

// Primary Board Layout & Mechanics Generator
function setupFreshMatch() {
    activeTurn = 'p1';
    playerPieces = { p1: { r: 1, c: 3 }, p2: { r: 5, c: 3 } };
    wallsDatabase.clear();
    showScreen('game-screen');
    renderEngine();
}

function renderEngine() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';

    // Render cells
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let cell = document.createElement('div');
            cell.className = 'cell';
            cell.onclick = () => processPieceMovement(r, c);

            // Append tokens if coordinates match
            if(playerPieces.p1.r === r && playerPieces.p1.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece';
                piece.style.backgroundColor = p1Color;
                cell.appendChild(piece);
            } else if(playerPieces.p2.r === r && playerPieces.p2.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece';
                piece.style.backgroundColor = p2Color;
                cell.appendChild(piece);
            }
            board.appendChild(cell);
        }
    }

    // Render Interactive Wall Overlays
    const cellSize = 50; const gap = 12;

    // Horizontal Lines
    for(let r=0; r<GRID_SIZE-1; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let trigger = document.createElement('div');
            trigger.className = 'wall-trigger';
            trigger.style.width = '50px'; trigger.style.height = '12px';
            trigger.style.left = `${c * (cellSize + gap) + 10}px`;
            trigger.style.top = `${(r + 1) * cellSize + r * gap + 10}px`;
            
            let key = `h-${r}-${c}`;
            if(wallsDatabase.has(key)) trigger.classList.add('placed-wall');
            
            trigger.onclick = (e) => { e.stopPropagation(); processWallPlacement(key); };
            board.appendChild(trigger);
        }
    }

    // Vertical Lines
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE-1; c++) {
            let trigger = document.createElement('div');
            trigger.className = 'wall-trigger';
            trigger.style.width = '12px'; trigger.style.height = '50px';
            trigger.style.left = `${(c + 1) * cellSize + c * gap + 10}px`;
            trigger.style.top = `${r * (cellSize + gap) + 10}px`;
            
            let key = `v-${r}-${c}`;
            if(wallsDatabase.has(key)) trigger.classList.add('placed-wall');
            
            trigger.onclick = (e) => { e.stopPropagation(); processWallPlacement(key); };
            board.appendChild(trigger);
        }
    }

    updateHeaderIndicator();
}

function updateHeaderIndicator() {
    const tracker = document.getElementById('turn-indicator');
    if(activeTurn === 'p1') {
        tracker.innerText = gameMode === 'online' ? `${savedUsername}'s Turn` : "Player 1's Turn";
        tracker.style.borderColor = p1Color;
    } else {
        tracker.innerText = gameMode === 'ai' ? "AI Bot's Turn" : (gameMode === 'online' ? "Opponent's Turn" : "Player 2's Turn");
        tracker.style.borderColor = p2Color;
    }
}

// Rigid Move & Wall Logic Validations
function checkCollision(currR, currC, tarR, tarC) {
    if(tarR === currR + 1 && tarC === currC) return wallsDatabase.has(`h-${currR}-${currC}`);
    if(tarR === currR - 1 && tarC === currC) return wallsDatabase.has(`h-${tarR}-${currC}`);
    if(tarC === currC + 1 && tarR === currR) return wallsDatabase.has(`v-${currR}-${currC}`);
    if(tarC === currC - 1 && tarR === currR) return wallsDatabase.has(`v-${currR}-${tarC}`);
    return false;
}

function processPieceMovement(tarR, tarC) {
    if(gameMode === 'ai' && activeTurn === 'p2') return; // Restrict input on AI turn

    let activeLoc = playerPieces[activeTurn];
    const distanceR = Math.abs(activeLoc.r - tarR);
    const distanceC = Math.abs(activeLoc.c - tarC);

    if((distanceR === 1 && distanceC === 0) || (distanceR === 0 && distanceC === 1)) {
        if(checkCollision(activeLoc.r, activeLoc.c, tarR, tarC)) {
            alert("Movement Blocked! A barricade wall is blocking this grid direction.");
            return;
        }

        let nonActive = activeTurn === 'p1' ? 'p2' : 'p1';
        if(playerPieces[nonActive].r === tarR && playerPieces[nonActive].c === tarC) return; // Cell occupied

        // Relocate piece
        playerPieces[activeTurn] = { r: tarR, c: tarC };
        completeTurnShift();
    }
}

function processWallPlacement(key) {
    if(gameMode === 'ai' && activeTurn === 'p2') return;
    if(wallsDatabase.has(key)) return;

    wallsDatabase.add(key);
    completeTurnShift();
}

// Switch Turn Engine & Simple Smart Bot Module
function completeTurnShift() {
    renderEngine();
    
    // Check Winning state
    if(playerPieces.p1.r === 6) { alert("Game Over! Player 1 Wins!"); return confirmExit(); }
    if(playerPieces.p2.r === 0) { alert("Game Over! Player 2 Wins!"); return confirmExit(); }

    activeTurn = activeTurn === 'p1' ? 'p2' : 'p1';
    updateHeaderIndicator();

    if(gameMode === 'ai' && activeTurn === 'p2') {
        setTimeout(executeAiStrategy, 700);
    }
}

function executeAiStrategy() {
    let ai = playerPieces.p2;
    let target = playerPieces.p1;

    // AI strategy calculation logic (Move towards player 1 row or block)
    let moved = false;
    let potentialMoves = [
        {r: ai.r - 1, c: ai.c}, // Prefer Upward
        {r: ai.r, c: ai.c - 1},
        {r: ai.r, c: ai.c + 1},
        {r: ai.r + 1, c: ai.c}
    ];

    for(let move of potentialMoves) {
        if(move.r >= 0 && move.r < GRID_SIZE && move.c >= 0 && move.c < GRID_SIZE) {
            if(!checkCollision(ai.r, ai.c, move.r, move.c) && !(target.r === move.r && target.c === move.c)) {
                playerPieces.p2 = move;
                moved = true;
                break;
            }
        }
    }

    // If movement blocked, dynamically deploy defensive wall
    if(!moved) {
        let randomR = Math.floor(Math.random() * (GRID_SIZE - 1));
        let randomC = Math.floor(Math.random() * GRID_SIZE);
        wallsDatabase.add(`h-${randomR}-${randomC}`);
    }

    completeTurnShift();
}

function confirmExit() {
    showScreen('menu-screen');
}
