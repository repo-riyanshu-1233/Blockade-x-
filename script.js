const GRID_SIZE = 8; 

const P1_COLOR = '#ff5252'; 
const P2_COLOR = '#00beff'; 

let gameMode = 'pass'; 
let myRole = 'p1';       
let activeTurn = 'p1'; 
let aiDifficulty = 'medium'; 

// 👤 Global Identity Handles 
let myPlayerName = "PLAYER";
let opponentPlayerName = "OPPONENT";

let playerPieces = { p1: { r: 7, c: 3 }, p2: { r: 0, c: 4 } };
let wallInventory = { p1: 10, p2: 10 };

let hWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
let vWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

let turnTimer = null;
let timeLeft = 30;

let peerNode = null;
let networkConnection = null;
let firecrackerInterval = null;
const cloudBrokerPrefix = "BLKD-X8-"; 

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    if(screenId !== 'victory-screen') stopCelebrationCanvas();
    if(screenId !== 'game-screen') {
        clearInterval(turnTimer);
        if(document.getElementById('match-startup-notice')) {
            document.getElementById('match-startup-notice').classList.add('hide');
        }
    }
}

function toggleModal(modalId, isOpen) {
    document.getElementById(modalId).style.display = isOpen ? 'flex' : 'none';
}

function triggerGameNotice(msg, isPositive = false) {
    const toast = document.getElementById('game-toast');
    const logConsole = document.getElementById('game-live-notice');
    if(toast) toast.innerText = msg.toUpperCase();
    if(logConsole) logConsole.innerText = msg.toUpperCase();

    if(isPositive) toast.classList.add('green-alert');
    else toast.classList.remove('green-alert');

    toast.classList.remove('hide');
    setTimeout(() => { if(toast) toast.classList.add('hide'); }, 2000);
}

function launchDirectGame(mode) {
    gameMode = mode; myRole = 'p1'; setupFreshMatch();
}

function launchAIGame(diff) {
    gameMode = 'ai'; aiDifficulty = diff; myRole = 'p1'; setupFreshMatch();
}

function generate5BitCode() {
    let text = ""; const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < 5; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

// Sandbox Registration Sequence
function submitSandboxHostAndGenerate() {
    let hostInput = document.getElementById('sandbox-host-name').value.trim();
    myPlayerName = hostInput.length === 0 ? "HOST" : hostInput.toUpperCase();
    initiateSandboxHost();
}

function initiateSandboxHost() {
    gameMode = 'host'; myRole = 'p1'; 
    showScreen('sandbox-host-screen');
    const roomCode = generate5BitCode();
    document.getElementById('sandbox-code-display').innerText = roomCode;

    peerNode = new Peer(cloudBrokerPrefix + roomCode);
    peerNode.on('connection', (conn) => {
        networkConnection = conn;
        setupNetworkListeners();
        triggerGameNotice("SANDBOX LINKED SUCCESS!", true);
        setTimeout(() => { 
            myRole = Math.random() > 0.5 ? 'p1' : 'p2';
            networkConnection.send({ type: 'role-assign', assignedToClient: (myRole === 'p1' ? 'p2' : 'p1'), hostName: myPlayerName });
            setupFreshMatch(); 
        }, 1000);
    });
}

function connectSandboxHost() {
    let clientInput = document.getElementById('sandbox-client-name').value.trim();
    myPlayerName = clientInput.length === 0 ? "GUEST" : clientInput.toUpperCase();

    const targetCode = document.getElementById('sandbox-input-code').value.trim().toUpperCase();
    if(targetCode.length !== 5) { triggerGameNotice("ENTER EXACT 5 VALUE CODE"); return; }
    gameMode = 'client'; 

    peerNode = new Peer();
    peerNode.on('open', () => {
        networkConnection = peerNode.connect(cloudBrokerPrefix + targetCode);
        setupNetworkListeners();
    });
    peerNode.on('error', () => {
        triggerGameNotice("EXPIRED OR WRONG ROOM!");
        showScreen('sandbox-menu-screen');
    });
}

function submitNameAndFindMatch() {
    let nameInput = document.getElementById('online-player-name').value.trim();
    myPlayerName = nameInput.length === 0 ? "PLAYER" : nameInput.toUpperCase();
    startRandomMatchmaking();
}

function startRandomMatchmaking() {
    gameMode = 'random_match';
    showScreen('matchmaking-screen');
    document.getElementById('match-status-text').innerText = "SEEKING OPPONENT...";
    
    const lobbyRandomTicket = Math.floor(Math.random() * 20) + 100; 
    peerNode = new Peer(cloudBrokerPrefix + "GLOBAL-8X8-" + lobbyRandomTicket);

    peerNode.on('open', () => {
        let sweepId = 100; let connected = false;
        function probeNextLobbySlot() {
            if (sweepId > 120 || connected) {
                if(!connected) { document.getElementById('match-status-text').innerText = "WAITING POOL"; }
                return;
            }
            if (sweepId === lobbyRandomTicket) { sweepId++; probeNextLobbySlot(); return; }

            let proxyConnection = peerNode.connect(cloudBrokerPrefix + "GLOBAL-8X8-" + sweepId);
            let joinWatchdog = setTimeout(() => {
                proxyConnection.close(); sweepId++; probeNextLobbySlot();
            }, 500);

            proxyConnection.on('open', () => {
                clearTimeout(joinWatchdog); connected = true; gameMode = 'client'; 
                networkConnection = proxyConnection; setupNetworkListeners();
            });
        }
        probeNextLobbySlot();
    });

    peerNode.on('connection', (incomingConn) => {
        gameMode = 'host'; networkConnection = incomingConn; setupNetworkListeners();
        triggerGameNotice("OPPONENT ENTERED!", true);
        setTimeout(() => { 
            myRole = Math.random() > 0.5 ? 'p1' : 'p2';
            networkConnection.send({ type: 'role-assign', assignedToClient: (myRole === 'p1' ? 'p2' : 'p1'), hostName: myPlayerName });
            setupFreshMatch(); 
        }, 1000);
    });
}

function setupNetworkListeners() {
    networkConnection.on('open', () => {
        if(gameMode === 'client') {
            networkConnection.send({ type: 'client-identity', clientName: myPlayerName });
        }
    });

    networkConnection.on('data', (data) => {
        if(data.type === 'role-assign') {
            myRole = data.assignedToClient; 
            if(data.hostName) opponentPlayerName = data.hostName.toUpperCase();
            setupFreshMatch();
        } else if(data.type === 'client-identity') {
            if(data.clientName) opponentPlayerName = data.clientName.toUpperCase();
            renderEngine();
        } else if(data.type === 'move') {
            playerPieces[data.player] = data.coordinates; evaluateTurnShiftOffline(false);
        } else if(data.type === 'wall') {
            if(data.wallType === 'h') hWalls[data.r][data.c] = data.color;
            else vWalls[data.r][data.c] = data.color;
            wallInventory[data.player]--; 
            evaluateTurnShiftOffline(false);
        } else if(data.type === 'timeout') {
            triggerGameNotice("⚠️ OPPONENT TIMED OUT! YOUR TURN");
            evaluateTurnShiftOffline(false);
        }
    });
    networkConnection.on('close', () => {
        triggerGameNotice("OPPONENT LEFT ARENA!"); confirmExit();
    });
}

function disconnectPeer() {
    if(peerNode) peerNode.destroy(); showScreen('menu-screen');
}

function setupFreshMatch() {
    activeTurn = 'p1'; 
    playerPieces = { p1: { r: GRID_SIZE - 1, c: 3 }, p2: { r: 0, c: 4 } };

    // 🔓 WALL LIMIT RULES
    // ALL wall limits removed across every mode (Pass & Play, VS AI, Online, Sandbox) — as requested.
    wallInventory = { p1: Infinity, p2: Infinity };

    hWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    vWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    
    showScreen('game-screen');
    renderEngine();
    triggerTimedRuleNotice(); 
    resetTurnTimer();
}

function triggerTimedRuleNotice() {
    const noticeBox = document.getElementById('match-startup-notice');
    const noticeText = document.getElementById('startup-notice-text');
    if(!noticeBox || !noticeText) return;

    if(gameMode === 'pass') {
        noticeText.innerText = "LOCAL PASS & PLAY ACTIVE.\n\nUNLIMITED WALLS FOR BOTH PLAYERS!\n\nMIND YOUR STEPS NO MOVE IS REVERTED!";
    } else if(gameMode === 'ai') {
        noticeText.innerText = `VS BOT ARENA ACTIVE (${aiDifficulty.toUpperCase()}).\n\nUNLIMITED WALLS FOR BOTH SIDES!\n\nMAKE STEPS COUNT!`;
    } else {
        noticeText.innerText = "COMPETITIVE ONLINE POOL ACTIVE.\n\nUNLIMITED WALLS FOR BOTH PLAYERS!\n\nMIND YOUR STEPS NO TURNS CAN BE REVERTED!";
    }

    noticeBox.classList.remove('hide');
    setTimeout(() => { noticeBox.classList.add('hide'); }, 5000);
}

function resetTurnTimer() {
    clearInterval(turnTimer);
    timeLeft = 30;
    document.getElementById('match-timer-display').innerText = `TIME: ${timeLeft}s`;

    turnTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('match-timer-display').innerText = `TIME: ${timeLeft}s`;
        
        if(timeLeft <= 0) {
            clearInterval(turnTimer);
            let isOnlineMatch = (gameMode === 'host' || gameMode === 'client');
            if(isOnlineMatch && activeTurn === myRole) {
                networkConnection.send({ type: 'timeout' });
                triggerGameNotice("⚠️ TIME OUT! TURN SKIPPED");
                evaluateTurnShiftOffline(true);
            } else if (!isOnlineMatch) {
                triggerGameNotice("⚠️ TIME OUT! TURN SKIPPED");
                evaluateTurnShiftOffline(true);
            }
        }
    }, 1000);
}

// Small helper so "unlimited" walls display nicely instead of the word "Infinity"
function formatWallCount(value) {
    return value === Infinity ? '∞' : value;
}

function renderEngine() {
    const board = document.getElementById('game-board');
    if (!board) return; 
    board.innerHTML = '';

    if(document.getElementById('p1-walls-left')) document.getElementById('p1-walls-left').innerText = formatWallCount(wallInventory.p1);
    if(document.getElementById('p2-walls-left')) document.getElementById('p2-walls-left').innerText = formatWallCount(wallInventory.p2);

    for(let displayR=0; displayR<GRID_SIZE; displayR++) {
        for(let displayC=0; displayC<GRID_SIZE; displayC++) {
            
            let r = (myRole === 'p2') ? (GRID_SIZE - 1 - displayR) : displayR;
            let c = (myRole === 'p2') ? (GRID_SIZE - 1 - displayC) : displayC;

            let cell = document.createElement('div');
            cell.className = 'cell'; cell.id = `cell-${r}-${c}`;
            
            if (myRole === 'p1') {
                if (r === 0) cell.classList.add('goal-row-glow'); 
                if (r === GRID_SIZE - 1) cell.classList.add('start-row-glow'); 
            } else if (myRole === 'p2') {
                if (r === GRID_SIZE - 1) cell.classList.add('goal-row-glow'); 
                if (r === 0) cell.classList.add('start-row-glow'); 
            }

            cell.onclick = (event) => handleSmartCellTouch(event, r, c);

            if(playerPieces.p1.r === r && playerPieces.p1.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece'; piece.style.backgroundColor = P1_COLOR;
                cell.appendChild(piece);
            } else if(playerPieces.p2.r === r && playerPieces.p2.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece'; piece.style.backgroundColor = P2_COLOR;
                cell.appendChild(piece);
            }

            if(r < GRID_SIZE - 1 && hWalls[r][c] !== null) {
                let vHWall = document.createElement('div'); vHWall.className = 'visual-wall h-wall';
                vHWall.style.backgroundColor = hWalls[r][c]; vHWall.style.boxShadow = `0 0 8px ${hWalls[r][c]}`;
                if(myRole === 'p2') { vHWall.style.top = '-4px'; } else { vHWall.style.bottom = '-4px'; }
                cell.appendChild(vHWall);
            }
            if(c < GRID_SIZE - 1 && vWalls[r][c] !== null) {
                let vVWall = document.createElement('div'); vVWall.className = 'visual-wall v-wall';
                vVWall.style.backgroundColor = vWalls[r][c]; vVWall.style.boxShadow = `0 0 8px ${vWalls[r][c]}`;
                if(myRole === 'p2') { vVWall.style.left = '-4px'; } else { vVWall.style.right = '-4px'; }
                cell.appendChild(vVWall);
            }

            board.appendChild(cell);
        }
    }
    updateHeaderIndicator();
}

// 🎯 Checks whether tapping (tarR, tarC) would be a legal MOVE for `turn`'s piece,
// without actually committing anything. Used to make sure a tap on a valid
// forward/side move cell always moves the piece, instead of accidentally
// being swallowed by the wall-placement edge-zone logic below.
function isLegalMoveTarget(turn, tarR, tarC) {
    let loc = playerPieces[turn];
    let opp = playerPieces[(turn === 'p1') ? 'p2' : 'p1'];

    let dr = tarR - loc.r; let dc = tarC - loc.c;
    let absDr = Math.abs(dr); let absDc = Math.abs(dc);

    if ((absDr === 1 && dc === 0) || (dr === 0 && absDc === 1)) {
        if (isWallBlocking(loc.r, loc.c, tarR, tarC)) return false;
        if (opp.r === tarR && opp.c === tarC) return false;
        return true;
    }
    if (absDr === 2 && dc === 0) {
        let midR = loc.r + (dr / 2);
        if (opp.r === midR && opp.c === loc.c) {
            if (isWallBlocking(loc.r, loc.c, midR, loc.c) || isWallBlocking(midR, loc.c, tarR, tarC)) return false;
            return true;
        }
    }
    if (dr === 0 && absDc === 2) {
        let midC = loc.c + (dc / 2);
        if (opp.r === loc.r && opp.c === midC) {
            if (isWallBlocking(loc.r, loc.c, loc.r, midC) || isWallBlocking(loc.r, midC, tarR, tarC)) return false;
            return true;
        }
    }
    return false;
}

function handleSmartCellTouch(e, r, c) {
    if((gameMode === 'host' || gameMode === 'client') && activeTurn !== myRole) return;
    if(gameMode === 'ai' && activeTurn === 'p2') return;

    // ✅ MISS-TAP FIX (part 1): if the tapped cell is a legal move destination for the
    // current player's piece, ALWAYS move there — no matter where inside the cell the
    // tap landed. This stops "I tapped the green forward cell but a wall got placed".
    if (isLegalMoveTarget(activeTurn, r, c)) {
        processPieceMovement(r, c);
        return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    // ✅ MISS-TAP FIX (part 2): shrunk from 0.35 → 0.2. The old value made 70% of every
    // cell count as a "wall edge", leaving only a tiny 30% center zone for movement,
    // which is what caused most accidental wall placements on mobile taps.
    const edgeThreshold = rect.width * 0.2; 

    let hasWallsLeft = wallInventory[activeTurn] > 0;

    if (hasWallsLeft) {
        if (myRole === 'p2') {
            if (y < edgeThreshold && r < GRID_SIZE - 1) { commitDirectWall('h', r, c); return; }
            if (y > (rect.height - edgeThreshold) && r > 0) { commitDirectWall('h', r - 1, c); return; }
            if (x < edgeThreshold && c < GRID_SIZE - 1) { commitDirectWall('v', r, c); return; }
            if (x > (rect.width - edgeThreshold) && c > 0) { commitDirectWall('v', r, c - 1); return; }
        } else {
            if (y < edgeThreshold && r > 0) { commitDirectWall('h', r - 1, c); return; }
            if (y > (rect.height - edgeThreshold) && r < GRID_SIZE - 1) { commitDirectWall('h', r, c); return; }
            if (x < edgeThreshold && c > 0) { commitDirectWall('v', r, c - 1); return; }
            // ✅ MISS-TAP FIX (part 3): this was `commitDirectWall('v', r, c - 1)` — a copy/paste
            // bug that placed the wall on the LEFT side of the cell even when the player
            // tapped the RIGHT edge. Corrected to reference the cell's own right-side wall (c).
            if (x > (rect.width - edgeThreshold) && c < GRID_SIZE - 1) { commitDirectWall('v', r, c); return; }
        }
    }
    processPieceMovement(r, c);
}

function commitDirectWall(type, r, c) {
    if(type === 'h' && hWalls[r][c] !== null) return;
    if(type === 'v' && vWalls[r][c] !== null) return;

    let activeColor = (activeTurn === 'p1') ? P1_COLOR : P2_COLOR;
    if(type === 'h') hWalls[r][c] = activeColor; else vWalls[r][c] = activeColor;

    if(!hasValidPath(playerPieces.p1, 0) || !hasValidPath(playerPieces.p2, GRID_SIZE-1)) {
        if(type === 'h') hWalls[r][c] = null; else vWalls[r][c] = null;
        triggerGameNotice("⚠️ PATH LOCKOUT REJECTED!");
        renderEngine();
        return;
    }

    wallInventory[activeTurn]--;

    if(gameMode === 'host' || gameMode === 'client') {
        networkConnection.send({ type: 'wall', wallType: type, r: r, c: c, color: activeColor, player: activeTurn });
    }
    evaluateTurnShiftOffline(true);
}

function updateHeaderIndicator() {
    const bottomBanner = document.getElementById('bottom-turn-banner');
    const identityTag = document.getElementById('identity-tag');
    if (!bottomBanner) return;

    if(gameMode === 'pass') { 
        identityTag.innerText = "PASS & PLAY"; 
    } else if(gameMode === 'ai') { 
        identityTag.innerText = `YOU vs BOT`; 
    } else { 
        let redLabel = (myRole === 'p1') ? myPlayerName : opponentPlayerName;
        let blueLabel = (myRole === 'p2') ? myPlayerName : opponentPlayerName;
        identityTag.innerText = `${redLabel} VS ${blueLabel}`; 
    }

    let isMyTurn = (gameMode === 'pass') || (gameMode === 'ai' && activeTurn === 'p1') || (gameMode !== 'pass' && gameMode !== 'ai' && activeTurn === myRole);
    
    if(isMyTurn) {
        bottomBanner.classList.add('pulse-active');
        if(gameMode === 'pass') {
            bottomBanner.innerText = activeTurn === 'p1' ? "🔴 RED PLAYER TURN" : "🔵 BLUE PLAYER TURN";
            bottomBanner.style.borderColor = activeTurn === 'p1' ? P1_COLOR : P2_COLOR;
        } else {
            if(wallInventory[myRole] <= 0) {
                bottomBanner.innerText = "YOUR TURN ! OUT OF WALLS";
            } else {
                bottomBanner.innerText = "YOUR TURN ! PLACE OR MOVE";
            }
            bottomBanner.style.borderColor = myRole === 'p1' ? P1_COLOR : P2_COLOR;
        }
    } else {
        bottomBanner.classList.remove('pulse-active');
        if(gameMode === 'pass') {
             bottomBanner.innerText = activeTurn === 'p1' ? "🔴 RED PLAYER TURN" : "🔵 BLUE PLAYER TURN";
        } else {
             bottomBanner.innerText = gameMode === 'ai' ? "🤖 BOT IS CALCULATING..." : `⏳ ${opponentPlayerName}'S TURN...`;
        }
        bottomBanner.style.borderColor = "#12213a";
    }
}

function isWallBlocking(r1, c1, r2, c2) {
    if (r1 === r2) { let minC = Math.min(c1, c2); if (vWalls[r1][minC] !== null) return true; }
    if (c1 === c2) { let minR = Math.min(r1, r2); if (hWalls[minR][c1] !== null) return true; }
    return false;
}

function getShortestPathDistance(startPos, targetRow) {
    let visited = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
    let queue = [{r: startPos.r, c: startPos.c, dist: 0}];
    visited[startPos.r][startPos.c] = true;

    while(queue.length > 0) {
        let curr = queue.shift();
        if (curr.r === targetRow) return curr.dist;
        let directions = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for(let d of directions) {
            let nr = curr.r + d.r; let nc = curr.c + d.c;
            if(nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                if(!visited[nr][nc] && !isWallBlocking(curr.r, curr.c, nr, nc)) {
                    visited[nr][nc] = true; queue.push({r: nr, c: nc, dist: curr.dist + 1});
                }
            }
        }
    }
    return Infinity;
}

// Validation Route Check
function hasValidPath(startPos, targetRow) { return getShortestPathDistance(startPos, targetRow) !== Infinity; }

function processPieceMovement(tarR, tarC) {
    let loc = playerPieces[activeTurn];
    let opp = playerPieces[(activeTurn === 'p1') ? 'p2' : 'p1'];

    let dr = tarR - loc.r; let dc = tarC - loc.c;
    let absDr = Math.abs(dr); let absDc = Math.abs(dc);

    if ((absDr === 1 && dc === 0) || (dr === 0 && absDc === 1)) {
        if (isWallBlocking(loc.r, loc.c, tarR, tarC)) { triggerGameNotice("⚠️ WALL BLOCKED!"); return; }
        if (opp.r === tarR && opp.c === tarC) { triggerGameNotice("⚠️ JUMP OVER OPPONENT!"); return; }
        playerPieces[activeTurn] = { r: tarR, c: tarC }; finalizeMoveTransmission(); return;
    }
    if (absDr === 2 && dc === 0) {
        let midR = loc.r + (dr / 2);
        if (opp.r === midR && opp.c === loc.c) {
            if (isWallBlocking(loc.r, loc.c, midR, loc.c) || isWallBlocking(midR, loc.c, tarR, tarC)) { triggerGameNotice("⚠️ WALL BLOCKED!"); return; }
            playerPieces[activeTurn] = { r: tarR, c: tarC }; finalizeMoveTransmission(); return;
        }
    }
    if (dr === 0 && absDc === 2) {
        let midC = loc.c + (dc / 2);
        if (opp.r === loc.r && opp.c === midC) {
            if (isWallBlocking(loc.r, loc.c, loc.r, midC) || isWallBlocking(loc.r, midC, tarR, tarC)) { triggerGameNotice("⚠️ WALL BLOCKED!"); return; }
            playerPieces[activeTurn] = { r: tarR, c: tarC }; finalizeMoveTransmission(); return;
        }
    }
    triggerGameNotice("⚠️ INVALID TRACK DIRECTION!");
}

function finalizeMoveTransmission() {
    if(gameMode === 'host' || gameMode === 'client') {
        networkConnection.send({ type: 'move', player: activeTurn, coordinates: playerPieces[activeTurn] });
    }
    evaluateTurnShiftOffline(true);
}

function paintBoardOnVictory(winnerColor) {
    document.querySelectorAll('.cell').forEach(cell => { cell.style.backgroundColor = winnerColor; });
}

function evaluateTurnShiftOffline(shouldTriggerAI = true) {
    if(playerPieces.p1.r === 0) { clearInterval(turnTimer); paintBoardOnVictory(P1_COLOR); setTimeout(() => { launchVictorySequence("p1"); }, 400); return; }
    if(playerPieces.p2.r === GRID_SIZE - 1) { clearInterval(turnTimer); paintBoardOnVictory(P2_COLOR); setTimeout(() => { launchVictorySequence("p2"); }, 400); return; }

    activeTurn = activeTurn === 'p1' ? 'p2' : 'p1';
    resetTurnTimer(); 
    renderEngine();
    
    if(gameMode === 'ai' && activeTurn === 'p2' && shouldTriggerAI) { setTimeout(execute4LevelEngineAI, 500); }
}

function launchVictorySequence(winningRole) {
    clearInterval(turnTimer);
    const titleHeader = document.getElementById('victory-header-status');
    const subtitleText = document.getElementById('winner-declaration-text');
    const shareBtn = document.getElementById('share-results-btn');
    const cardBox = document.getElementById('victory-card-box');

    let localPlayerWon = (gameMode === 'pass') || (gameMode === 'ai' && winningRole === 'p1') || (gameMode !== 'pass' && gameMode !== 'ai' && myRole === winningRole);

    if (localPlayerWon) {
        titleHeader.innerText = "VICTORY!"; titleHeader.style.color = "#8edc3a"; cardBox.style.borderColor = "#8edc3a"; shareBtn.style.display = "inline-block";
        if (gameMode === 'pass') { subtitleText.innerText = winningRole === 'p1' ? "CONGRATULATIONS RED PLAYER! YOU WON!" : "CONGRATULATIONS BLUE PLAYER! YOU WON!"; } 
        else { subtitleText.innerText = "CONGRATULATIONS! YOU DEFEATED YOUR OPPONENT!"; }
        subtitleText.style.color = "#8edc3a"; showScreen('victory-screen'); startCelebrationCanvas(); 
    } else {
        titleHeader.innerText = "DEFEAT!"; titleHeader.style.color = "#ff5252"; cardBox.style.borderColor = "#ff5252"; shareBtn.style.display = "none"; 
        subtitleText.innerText = "LOSE! BETTER LUCK NEXT TIME"; subtitleText.style.color = "#ff5252"; showScreen('victory-screen'); stopCelebrationCanvas(); 
    }
}

// 🤖 AI UPGRADE — Helper 1: enumerate every legal one-move destination for a piece
// (straight step, or a straight jump over the opponent when they're directly adjacent).
// Used only for the bot's own decision-making, so it never changes human movement rules.
function getLegalMoveOptions(turn) {
    let loc = playerPieces[turn];
    let opp = playerPieces[(turn === 'p1') ? 'p2' : 'p1'];
    let options = [];
    let dirs = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];

    for (let d of dirs) {
        let nr = loc.r + d.r; let nc = loc.c + d.c;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        if (isWallBlocking(loc.r, loc.c, nr, nc)) continue;

        if (opp.r === nr && opp.c === nc) {
            // Opponent sits right next to us — try to jump straight over them.
            let jr = nr + d.r; let jc = nc + d.c;
            if (jr >= 0 && jr < GRID_SIZE && jc >= 0 && jc < GRID_SIZE && !isWallBlocking(nr, nc, jr, jc)) {
                options.push({ r: jr, c: jc });
            }
        } else {
            options.push({ r: nr, c: nc });
        }
    }
    return options;
}

// 🤖 AI UPGRADE — Helper 2: list every currently-empty wall slot on the board.
function enumerateWallCandidates() {
    let candidates = [];
    for (let r = 0; r < GRID_SIZE - 1; r++) {
        for (let c = 0; c < GRID_SIZE - 1; c++) {
            if (hWalls[r][c] === null) candidates.push({ type: 'h', r, c });
            if (vWalls[r][c] === null) candidates.push({ type: 'v', r, c });
        }
    }
    return candidates;
}

// 🤖 AI UPGRADE — Helper 3: for every candidate wall, temporarily place it, measure how
// much it lengthens the human's path vs the bot's own path, then undo it. This is the
// core "brain" that lets the bot pick genuinely smart wall placements instead of just
// slapping a wall directly above the human.
function getScoredWallCandidates() {
    let candidatePool = enumerateWallCandidates();
    let humanBaseDist = getShortestPathDistance(playerPieces.p1, 0);
    let aiBaseDist = getShortestPathDistance(playerPieces.p2, GRID_SIZE - 1);
    let scored = [];

    for (let cand of candidatePool) {
        if (cand.type === 'h') hWalls[cand.r][cand.c] = P2_COLOR; else vWalls[cand.r][cand.c] = P2_COLOR;

        let valid = hasValidPath(playerPieces.p1, 0) && hasValidPath(playerPieces.p2, GRID_SIZE - 1);
        if (valid) {
            let newHumanDist = getShortestPathDistance(playerPieces.p1, 0);
            let newAiDist = getShortestPathDistance(playerPieces.p2, GRID_SIZE - 1);
            // Score = how much longer we make the human's road, minus how much longer we make our own.
            let score = (newHumanDist - humanBaseDist) - (newAiDist - aiBaseDist);
            scored.push({ cand, score });
        }

        if (cand.type === 'h') hWalls[cand.r][cand.c] = null; else vWalls[cand.r][cand.c] = null;
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
}

function execute4LevelEngineAI() {
    let actionTaken = false;

    // Harder difficulty = higher chance to consider a wall AND smarter selection of which wall.
    let blockProbability = 0;
    if (aiDifficulty === 'easy') blockProbability = 0.15;
    else if (aiDifficulty === 'medium') blockProbability = 0.50;
    else if (aiDifficulty === 'hard') blockProbability = 0.80;
    else if (aiDifficulty === 'extreme') blockProbability = 0.97; // 💀 near-optimal, very aggressive

    if (Math.random() < blockProbability) {
        let scored = getScoredWallCandidates();
        let beneficial = scored.filter(s => s.score > 0);
        let chosen = null;

        if (beneficial.length > 0) {
            if (aiDifficulty === 'easy') {
                // Weak: picks basically any beneficial wall at random, no real strategy.
                chosen = beneficial[Math.floor(Math.random() * beneficial.length)];
            } else if (aiDifficulty === 'medium') {
                // Decent: usually picks from the better half, with some unpredictability.
                let poolSize = Math.max(1, Math.ceil(beneficial.length * 0.4));
                chosen = beneficial[Math.floor(Math.random() * poolSize)];
            } else if (aiDifficulty === 'hard') {
                // Strong: almost always near the best option available.
                let poolSize = Math.max(1, Math.ceil(beneficial.length * 0.15));
                chosen = beneficial[Math.floor(Math.random() * poolSize)];
            } else {
                // Extreme: always takes the single best wall on the board. No mercy. 💀
                chosen = beneficial[0];
            }
        }

        if (chosen) {
            let cand = chosen.cand;
            if (cand.type === 'h') hWalls[cand.r][cand.c] = P2_COLOR; else vWalls[cand.r][cand.c] = P2_COLOR;
            actionTaken = true;
            triggerGameNotice("🤖 BOT PLACED A BARRIER!");
        }
    }

    if (!actionTaken) {
        let options = getLegalMoveOptions('p2');
        if (options.length > 0) {
            if (aiDifficulty === 'easy') {
                // Weak movement: mostly random, doesn't reliably chase the shortest path.
                options.sort(() => Math.random() - 0.5);
            } else {
                // Medium/Hard/Extreme: always advance along the true shortest path,
                // now correctly considering jumps over the human too.
                options.sort((a, b) => getShortestPathDistance(a, GRID_SIZE - 1) - getShortestPathDistance(b, GRID_SIZE - 1));
            }
            playerPieces.p2 = options[0];
            actionTaken = true;
        }
    }

    if (!actionTaken) {
        // Extremely rare fallback (bot fully boxed in with no moves) — just place any valid wall.
        let scored = getScoredWallCandidates();
        if (scored.length > 0) {
            let cand = scored[0].cand;
            if (cand.type === 'h') hWalls[cand.r][cand.c] = P2_COLOR; else vWalls[cand.r][cand.c] = P2_COLOR;
            actionTaken = true;
        }
    }

    evaluateTurnShiftOffline(false);
}

function startCelebrationCanvas() {
    stopCelebrationCanvas();
    const canvas = document.getElementById('firecracker-canvas'); const ctx = canvas.getContext('2d');
    if (!canvas) return;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = [];
    function spawnBurst() {
        let sx = Math.random() * canvas.width; let sy = Math.random() * (canvas.height * 0.5);
        let pallet = [P1_COLOR, P2_COLOR, '#8edc3a', '#ff9b13'];
        let shardColor = pallet[Math.floor(Math.random() * pallet.length)];
        for(let i=0; i<40; i++) { particles.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, alpha: 1, color: shardColor }); }
    }
    firecrackerInterval = setInterval(spawnBurst, 350);
    function animate() {
        if(!document.getElementById('victory-screen').classList.contains('active')) return;
        ctx.clearRect(0,0, canvas.width, canvas.height);
        particles.forEach((p, idx) => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.alpha -= 0.012;
            if(p.alpha <= 0) particles.splice(idx, 1);
            ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha; ctx.fillRect(p.x, p.y, 6, 6);
        });
        ctx.globalAlpha = 1; requestAnimationFrame(animate);
    }
    animate();
}

function stopCelebrationCanvas() { clearInterval(firecrackerInterval); }

function shareVictoryTray() {
    const shareTemplate = `⚔️ Blockade X matches dominated! Try outwitting my strategic walls: ${window.location.href}`;
    if (navigator.share) { navigator.share({ title: 'BLOCKADE X CONQUEST', text: shareTemplate, url: window.location.href }).catch(() => {}); } 
    else { navigator.clipboard.writeText(shareTemplate); triggerGameNotice("LINK SAVED TO CLIPBOARD!", true); }
}

function confirmExit() { 
    clearInterval(turnTimer); 
    if(peerNode) peerNode.destroy(); 
    stopCelebrationCanvas(); 
    showScreen('menu-screen'); 
}
