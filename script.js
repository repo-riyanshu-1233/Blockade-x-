// Configuration Setup
const GRID_SIZE = 7;
const GAME_COLORS = {
    red: '#d63031', blue: '#0984e3', white: '#f8fafc', black: '#2d3436',
    pink: '#e84393', green: '#2ecc71', yellow: '#f1c40f', purple: '#6c5ce7'
};

let gameMode = 'pass'; 
let savedUsername = localStorage.getItem('blockadex_user') || '';
let p1Color = '#d63031';
let p2Color = '#0984e3';
let activeTurn = 'p1'; 
let playerPieces = { p1: { r: 0, c: 3 }, p2: { r: 6, c: 3 } };

// Matrices deployment map arrays
let hWalls = Array(GRID_SIZE - 1).fill(null).map(() => Array(GRID_SIZE).fill(false));
let vWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE - 1).fill(false));
let matchmakingInterval = null;

window.onload = function() {
    if(savedUsername) {
        document.getElementById('player-username').value = savedUsername;
    }
};

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function toggleModal(modalId, isOpen) {
    document.getElementById(modalId).style.display = isOpen ? 'flex' : 'none';
}

function openColorSelection(mode) {
    gameMode = mode;
    const p1Container = document.getElementById('p1-colors');
    const p2Container = document.getElementById('p2-colors');
    p1Container.innerHTML = ''; p2Container.innerHTML = '';
    
    document.getElementById('p2-title').innerText = (mode === 'ai') ? "AI BOT" : "PLAYER 2";

    Object.keys(GAME_COLORS).forEach(name => {
        let n1 = document.createElement('div');
        n1.className = `color-node ${GAME_COLORS[name] === p1Color ? 'selected' : ''}`;
        n1.style.backgroundColor = GAME_COLORS[name];
        n1.onclick = () => { p1Color = GAME_COLORS[name]; openColorSelection(gameMode); };
        p1Container.appendChild(n1);

        let n2 = document.createElement('div');
        n2.className = `color-node ${GAME_COLORS[name] === p2Color ? 'selected' : ''}`;
        n2.style.backgroundColor = GAME_COLORS[name];
        n2.onclick = () => { p2Color = GAME_COLORS[name]; openColorSelection(gameMode); };
        p2Container.appendChild(n2);
    });
    showScreen('color-screen');
}

function launchLocalGame() {
    if (p1Color === p2Color) {
        alert("CHOOSE DIFFERENT COLORS!");
        return;
    }
    setupFreshMatch();
}

function startOnlineSetup() {
    showScreen('online-name-screen');
}

function connectOnlinePvP() {
    const inputName = document.getElementById('player-username').value.trim();
    if(!inputName) { alert("ENTER NAME FIRST!"); return; }
    
    savedUsername = inputName;
    localStorage.setItem('blockadex_user', savedUsername);

    document.getElementById('user-display-name').innerText = savedUsername.toUpperCase();
    document.getElementById('user-avatar').innerText = savedUsername.charAt(0).toUpperCase();
    document.getElementById('server-notice').classList.add('hide');
    document.getElementById('opponent-avatar').innerText = '?';
    document.getElementById('opponent-display-name').innerText = 'SEARCHING';
    document.getElementById('matchmaking-status').innerText = 'SEARCHING...';

    showScreen('matchmaking-screen');

    let cycle = 0;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const opponents = ["ARCADE_HERO", "PIXEL_KING", "NEON_RIDER", "MATRIX_99"];
    const targetOpponent = opponents[Math.floor(Math.random() * opponents.length)];

    matchmakingInterval = setInterval(() => {
        cycle++;
        document.getElementById('matchmaking-dice').innerText = letters.charAt(Math.floor(Math.random() * letters.length));
        
        if (cycle === 15) {
            if (Math.random() > 0.8) { // 20% simulation failure rate notice
                clearInterval(matchmakingInterval);
                document.getElementById('server-notice').classList.remove('hide');
                document.getElementById('matchmaking-status').innerText = 'ERROR';
                document.getElementById('matchmaking-dice').innerText = '⚠️';
            } else {
                clearInterval(matchmakingInterval);
                document.getElementById('matchmaking-dice').innerText = targetOpponent.charAt(0);
                document.getElementById('opponent-avatar').innerText = targetOpponent.charAt(0);
                document.getElementById('opponent-display-name').innerText = targetOpponent;
                document.getElementById('matchmaking-status').innerText = 'MATCH FOUND!';
                
                setTimeout(() => {
                    gameMode = 'online';
                    p1Color = '#00beff'; p2Color = '#ff5252';
                    setupFreshMatch();
                }, 1500);
            }
        }
    }, 200);
}

function cancelMatchmaking() {
    clearInterval(matchmakingInterval);
    showScreen('menu-screen');
}

function setupFreshMatch() {
    activeTurn = 'p1';
    playerPieces = { p1: { r: 0, c: 3 }, p2: { r: 6, c: 3 } };
    
    for(let r=0; r<GRID_SIZE-1; r++) hWalls[r].fill(false);
    for(let r=0; r<GRID_SIZE; r++) vWalls[r].fill(false);

    showScreen('game-screen');
    renderEngine();
}

function renderEngine() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';

    // Draw White Grid Blocks
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let cell = document.createElement('div');
            cell.className = 'cell';
            cell.onclick = () => processPieceMovement(r, c);

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

    // Deploy Capsule Walls on Intersections
    for(let r=0; r<GRID_SIZE-1; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let trigger = document.createElement('div');
            trigger.className = 'wall-trigger horizontal-type';
            trigger.style.left = `${c * 48}px`;
            trigger.style.top = `${(r + 1) * 46 + r * 2}px`;
            
            if(hWalls[r][c]) {
                trigger.classList.add('placed-wall');
                trigger.style.backgroundColor = activeTurn === 'p1' ? p2Color : p1Color;
            } else {
                trigger.onclick = (e) => { e.stopPropagation(); attemptWallPlacement('h', r, c); };
            }
            board.appendChild(trigger);
        }
    }

    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE-1; c++) {
            let trigger = document.createElement('div');
            trigger.className = 'wall-trigger vertical-type';
            trigger.style.left = `${(c + 1) * 46 + c * 2}px`;
            trigger.style.top = `${r * 48}px`;
            
            if(vWalls[r][c]) {
                trigger.classList.add('placed-wall');
                trigger.style.backgroundColor = activeTurn === 'p1' ? p2Color : p1Color;
            } else {
                trigger.onclick = (e) => { e.stopPropagation(); attemptWallPlacement('v', r, c); };
            }
            board.appendChild(trigger);
        }
    }

    updateHeaderIndicator();
}

function updateHeaderIndicator() {
    const tracker = document.getElementById('turn-indicator');
    if(activeTurn === 'p1') {
        tracker.innerText = gameMode === 'online' ? `${savedUsername} TURN` : "P1 TURN";
        tracker.style.borderColor = p1Color;
    } else {
        tracker.innerText = gameMode === 'ai' ? "AI BOT TURN" : (gameMode === 'online' ? "OPPONENT TURN" : "P2 TURN");
        tracker.style.borderColor = p2Color;
    }
}

function isWallBlocking(r1, c1, r2, c2) {
    if (r1 === r2) {
        let minC = Math.min(c1, c2);
        return vWalls[r1][minC];
    }
    if (c1 === c2) {
        let minR = Math.min(r1, r2);
        return hWalls[minR][c1];
    }
    return false;
}

// Path verification algorithm loop map checking
function hasValidPath(startPos, targetRow) {
    let visited = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
    let queue = [startPos];
    visited[startPos.r][startPos.c] = true;

    while(queue.length > 0) {
        let curr = queue.shift();
        if (curr.r === targetRow) return true;

        let directions = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for(let d of directions) {
            let nr = curr.r + d.r; let nc = curr.c + d.c;
            if(nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                if(!visited[nr][nc] && !isWallBlocking(curr.r, curr.c, nr, nc)) {
                    visited[nr][nc] = true;
                    queue.push({r: nr, c: nc});
                }
            }
        }
    }
    return false;
}

function attemptWallPlacement(type, r, c) {
    if(gameMode === 'ai' && activeTurn === 'p2') return;

    if(type === 'h') hWalls[r][c] = true;
    else vWalls[r][c] = true;

    let p1Valid = hasValidPath(playerPieces.p1, 6);
    let p2Valid = hasValidPath(playerPieces.p2, 0);

    if(!p1Valid || !p2Valid) {
        if(type === 'h') hWalls[r][c] = false;
        else vWalls[r][c] = false;
        alert("TRAP DETECTED! RASTA PURA BLOCK NAHI KAR SAKTE!");
        return;
    }
    completeTurnShift();
}

function processPieceMovement(tarR, tarC) {
    if(gameMode === 'ai' && activeTurn === 'p2') return;

    let loc = playerPieces[activeTurn];
    const dR = Math.abs(loc.r - tarR);
    const dC = Math.abs(loc.c - tarC);

    if((dR === 1 && dC === 0) || (dR === 0 && dC === 1)) {
        if(isWallBlocking(loc.r, loc.c, tarR, tarC)) {
            alert("WALL BLOCKED!");
            return;
        }
        let opponent = activeTurn === 'p1' ? 'p2' : 'p1';
        if(playerPieces[opponent].r === tarR && playerPieces[opponent].c === tarC) return;

        playerPieces[activeTurn] = { r: tarR, c: tarC };
        completeTurnShift();
    }
}

function completeTurnShift() {
    renderEngine();
    
    if(playerPieces.p1.r === 6) { alert("PLAYER 1 WINS!"); return confirmExit(); }
    if(playerPieces.p2.r === 0) { alert("PLAYER 2 WINS!"); return confirmExit(); }

    activeTurn = activeTurn === 'p1' ? 'p2' : 'p1';
    updateHeaderIndicator();

    if(gameMode === 'ai' && activeTurn === 'p2') {
        setTimeout(executeAiStrategy, 600);
    }
}

function executeAiStrategy() {
    let ai = playerPieces.p2;
    let target = playerPieces.p1;
    let moved = false;

    let potentialMoves = [{r: ai.r - 1, c: ai.c}, {r: ai.r, c: ai.c - 1}, {r: ai.r, c: ai.c + 1}, {r: ai.r + 1, c: ai.c}];
    for(let m of potentialMoves) {
        if(m.r >= 0 && m.r < GRID_SIZE && m.c >= 0 && m.c < GRID_SIZE) {
            if(!isWallBlocking(ai.r, ai.c, m.r, m.c) && !(target.r === m.r && target.c === m.c)) {
                playerPieces.p2 = m; moved = true; break;
            }
        }
    }

    if(!moved) {
        let attempts = 0;
        while(attempts < 20) {
            let rr = Math.floor(Math.random() * (GRID_SIZE - 1));
            let rc = Math.floor(Math.random() * GRID_SIZE);
            if(!hWalls[rr][rc]) {
                hWalls[rr][rc] = true;
                if(hasValidPath(playerPieces.p1, 6) && hasValidPath(playerPieces.p2, 0)) break;
                hWalls[rr][rc] = false;
            }
            attempts++;
        }
    }
    completeTurnShift();
}

function confirmExit() {
    showScreen('menu-screen');
}
