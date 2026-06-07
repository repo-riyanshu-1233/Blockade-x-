const GRID_SIZE = 9; 

const P1_COLOR = '#ff5252'; 
const P2_COLOR = '#00beff'; 

let gameMode = 'pass'; 
let myRole = 'p1'; 
let activeTurn = 'p1'; 

let playerPieces = { p1: { r: 8, c: 4 }, p2: { r: 0, c: 4 } };

// Dynamic Map Matrices
let hWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
let vWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

let peerNode = null;
let networkConnection = null;
let firecrackerInterval = null;
const cloudBrokerPrefix = "BLKD-X9-"; 

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    if(screenId !== 'victory-screen') stopCelebrationCanvas();
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
    setTimeout(() => { toast.classList.add('hide'); }, 2000);
}

function launchDirectGame(mode) {
    gameMode = mode;
    myRole = 'p1';
    setupFreshMatch();
}

function generate5BitCode() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < 5; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

// ==========================================
// 🛡️ MULTIPLAYER ENGINE NETWORK
// ==========================================
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
        setTimeout(() => { setupFreshMatch(); }, 1000);
    });
}

function connectSandboxHost() {
    const targetCode = document.getElementById('sandbox-input-code').value.trim().toUpperCase();
    if(targetCode.length !== 5) { triggerGameNotice("ENTER EXACT 5 VALUE CODE"); return; }
    gameMode = 'client'; myRole = 'p2';

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

function startRandomMatchmaking() {
    gameMode = 'random_match';
    showScreen('matchmaking-screen');
    document.getElementById('match-status-text').innerText = "SEEKING OPPONENT...";
    
    const lobbyRandomTicket = Math.floor(Math.random() * 20) + 100; 
    peerNode = new Peer(cloudBrokerPrefix + "GLOBAL-POOL-" + lobbyRandomTicket);

    peerNode.on('open', () => {
        let sweepId = 100;
        let connected = false;

        function probeNextLobbySlot() {
            if (sweepId > 120 || connected) {
                if(!connected) {
                    document.getElementById('match-status-text').innerText = "WAITING POOL";
                }
                return;
            }
            if (sweepId === lobbyRandomTicket) { sweepId++; probeNextLobbySlot(); return; }

            let proxyConnection = peerNode.connect(cloudBrokerPrefix + "GLOBAL-POOL-" + sweepId);
            let joinWatchdog = setTimeout(() => {
                proxyConnection.close();
                sweepId++;
                probeNextLobbySlot();
            }, 500);

            proxyConnection.on('open', () => {
                clearTimeout(joinWatchdog);
                connected = true;
                gameMode = 'client'; myRole = 'p2';
                networkConnection = proxyConnection;
                setupNetworkListeners();
                triggerGameNotice("MATCH FOUND!", true);
                setupFreshMatch();
            });
        }
        probeNextLobbySlot();
    });

    peerNode.on('connection', (incomingConn) => {
        gameMode = 'host'; myRole = 'p1';
        networkConnection = incomingConn;
        setupNetworkListeners();
        triggerGameNotice("OPPONENT ENTERED BASELINE!", true);
        setTimeout(() => { setupFreshMatch(); }, 1000);
    });
}

function setupNetworkListeners() {
    networkConnection.on('open', () => {
        if(gameMode === 'client') setupFreshMatch();
    });
    networkConnection.on('data', (data) => {
        if(data.type === 'move') {
            playerPieces[data.player] = data.coordinates;
            evaluateTurnShiftOffline(false);
        } else if(data.type === 'wall') {
            if(data.wallType === 'h') hWalls[data.r][data.c] = data.color;
            else vWalls[data.r][data.c] = data.color;
            evaluateTurnShiftOffline(false);
        }
    });
    networkConnection.on('close', () => {
        triggerGameNotice("OPPONENT LEFT ARENA!");
        confirmExit();
    });
}

function disconnectPeer() {
    if(peerNode) peerNode.destroy();
    showScreen('menu-screen');
}

// ==========================================
// 🧱 INDEPENDENT SINGLE CHANNELS WALL CORE
// ==========================================
function setupFreshMatch() {
    activeTurn = 'p1';
    playerPieces = { p1: { r: 8, c: 4 }, p2: { r: 0, c: 4 } };
    
    hWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    vWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

    showScreen('game-screen');
    renderEngine();
}

function renderEngine() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';

    // Build Cells First
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${r}-${c}`;
            
            if(r === 0 || r === (GRID_SIZE - 1)) {
                cell.classList.add('goal-glow');
            }

            cell.onclick = () => processPieceMovement(r, c);

            if(playerPieces.p1.r === r && playerPieces.p1.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece'; piece.style.backgroundColor = P1_COLOR;
                cell.appendChild(piece);
            } else if(playerPieces.p2.r === r && playerPieces.p2.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece'; piece.style.backgroundColor = P2_COLOR;
                cell.appendChild(piece);
            }
            board.appendChild(cell);
        }
    }

    // Attach Isolated Micro Trigger Panels
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let cellDiv = document.getElementById(`cell-${r}-${c}`);

            // Absolute Single Horizontal Segment Edge Trigger
            if(r < GRID_SIZE - 1) {
                let triggerH = document.createElement('div');
                triggerH.className = 'wall-trigger horizontal-type';
                if(hWalls[r][c] !== null) {
                    triggerH.classList.add('placed-wall');
                    triggerH.style.backgroundColor = hWalls[r][c];
                } else {
                    triggerH.onclick = (e) => { e.stopPropagation(); attemptWallPlacement('h', r, c); };
                }
                cellDiv.appendChild(triggerH);
            }

            // Absolute Single Vertical Segment Edge Trigger
            if(c < GRID_SIZE - 1) {
                let triggerV = document.createElement('div');
                triggerV.className = 'wall-trigger vertical-type';
                if(vWalls[r][c] !== null) {
                    triggerV.classList.add('placed-wall');
                    triggerV.style.backgroundColor = vWalls[r][c];
                } else {
                    triggerV.onclick = (e) => { e.stopPropagation(); attemptWallPlacement('v', r, c); };
                }
                cellDiv.appendChild(triggerV);
            }
        }
    }
    updateHeaderIndicator();
}

function updateHeaderIndicator() {
    const bottomBanner = document.getElementById('bottom-turn-banner');
    if(gameMode !== 'pass' && gameMode !== 'ai') {
        if(activeTurn === myRole) {
            bottomBanner.innerText = "🔴 RED: YOUR TURN";
            bottomBanner.style.borderColor = P1_COLOR;
        } else {
            bottomBanner.innerText = "🔵 BLUE: OPPONENT'S TURN";
            bottomBanner.style.borderColor = P2_COLOR;
        }
        return;
    }
    bottomBanner.innerText = activeTurn === 'p1' ? "🔴 RED PLAYER TURN" : ((gameMode === 'ai') ? "🔵 BLUE ROBOT🤖 TURN" : "🔵 BLUE PLAYER 2 TURN");
    bottomBanner.style.borderColor = activeTurn === 'p1' ? P1_COLOR : P2_COLOR;
}

function isWallBlocking(r1, c1, r2, c2) {
    if (r1 === r2) { // Horizontal step
        let minC = Math.min(c1, c2);
        if (vWalls[r1][minC] !== null) return true;
    }
    if (c1 === c2) { // Vertical step
        let minR = Math.min(r1, r2);
        if (hWalls[minR][c1] !== null) return true;
    }
    return false;
}

// ADVANCED PATHFINDING BFS SHORTEST PATH EVALUATOR
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
                    visited[nr][nc] = true;
                    queue.push({r: nr, c: nc, dist: curr.dist + 1});
                }
            }
        }
    }
    return Infinity;
}

function hasValidPath(startPos, targetRow) {
    return getShortestPathDistance(startPos, targetRow) !== Infinity;
}

function attemptWallPlacement(type, r, c) {
    if((gameMode === 'host' || gameMode === 'client') && activeTurn !== myRole) return;
    if(gameMode === 'ai' && activeTurn === 'p2') return;

    let activeColor = (activeTurn === 'p1') ? P1_COLOR : P2_COLOR;

    if(type === 'h') {
        if(hWalls[r][c] !== null) return;
        hWalls[r][c] = activeColor;
    } else {
        if(vWalls[r][c] !== null) return;
        vWalls[r][c] = activeColor;
    }

    // ANTI-BLOCKING PROTOCOL (Path Protection Rule)
    if(!hasValidPath(playerPieces.p1, 0) || !hasValidPath(playerPieces.p2, GRID_SIZE-1)) {
        if(type === 'h') hWalls[r][c] = null; else vWalls[r][c] = null;
        triggerGameNotice("⚠️ PATH LOCKOUT REJECTED!");
        return;
    }

    if(gameMode === 'host' || gameMode === 'client') {
        networkConnection.send({ type: 'wall', wallType: type, r: r, c: c, color: activeColor });
    }
    
    evaluateTurnShiftOffline(true);
}

function processPieceMovement(tarR, tarC) {
    if((gameMode === 'host' || gameMode === 'client') && activeTurn !== myRole) return;
    if(gameMode === 'ai' && activeTurn === 'p2') return;

    let loc = playerPieces[activeTurn];
    if((Math.abs(loc.r - tarR) === 1 && loc.c === tarC) || (loc.r === tarR && Math.abs(loc.c - tarC) === 1)) {
        if(isWallBlocking(loc.r, loc.c, tarR, tarC)) { triggerGameNotice("⚠️ WALL BLOCKED MOVEMENTS!"); return; }
        
        let oppPlayer = (activeTurn === 'p1') ? 'p2' : 'p1';
        if(playerPieces[oppPlayer].r === tarR && playerPieces[oppPlayer].c === tarC) return;

        playerPieces[activeTurn] = { r: tarR, c: tarC };

        if(gameMode === 'host' || gameMode === 'client') {
            networkConnection.send({ type: 'move', player: activeTurn, coordinates: playerPieces[activeTurn] });
        }
        evaluateTurnShiftOffline(true);
    } else {
        triggerGameNotice("⚠️ INVALID TRACK DIRECTION!");
    }
}

function paintBoardOnVictory(winnerColor) {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.style.backgroundColor = winnerColor;
        cell.style.transition = "background-color 0.25s ease-in-out";
    });
}

function evaluateTurnShiftOffline(shouldTriggerAI = true) {
    renderEngine();
    
    if(playerPieces.p1.r === 0) {
        paintBoardOnVictory(P1_COLOR);
        setTimeout(() => { launchVictorySequence("red"); }, 400);
        return;
    }
    
    if(playerPieces.p2.r === GRID_SIZE - 1) {
        paintBoardOnVictory(P2_COLOR);
        setTimeout(() => { launchVictorySequence("blue"); }, 400);
        return;
    }

    activeTurn = activeTurn === 'p1' ? 'p2' : 'p1';
    updateHeaderIndicator();

    if(gameMode === 'ai' && activeTurn === 'p2' && shouldTriggerAI) {
        setTimeout(executeAdvancedRobotAI, 400);
    }
}

function launchVictorySequence(winner) {
    const titleHeader = document.getElementById('victory-header-status');
    const subtitleText = document.getElementById('winner-declaration-text');
    const cardBox = document.getElementById('victory-card-box');

    if (gameMode === 'ai') {
        if (winner === 'red') {
            titleHeader.innerText = "VICTORY!";
            titleHeader.style.color = "#ff9b13";
            subtitleText.innerText = "CONGRATULATIONS FOR RED PLAYER";
            subtitleText.style.color = "#8edc3a";
            cardBox.style.borderColor = "#ff9b13";
        } else {
            titleHeader.innerText = "YOU LOOSE!";
            titleHeader.style.color = "#ff5252";
            subtitleText.innerText = "BETTER LUCK NEXT TIME";
            subtitleText.style.color = "#ff5252";
            cardBox.style.borderColor = "#ff5252";
        }
    } else {
        titleHeader.innerText = "VICTORY!";
        titleHeader.style.color = "#ff9b13";
        cardBox.style.borderColor = "#ff9b13";
        if (winner === 'red') {
            subtitleText.innerText = "CONGRATULATIONS FOR RED PLAYER";
            subtitleText.style.color = P1_COLOR;
        } else {
            subtitleText.innerText = "CONGRATULATIONS FOR BLUE PLAYER";
            subtitleText.style.color = P2_COLOR;
        }
    }

    showScreen('victory-screen');
    startCelebrationCanvas();
}

// ========================================================================
// 🤖 ADVANCED A* SHORTEST PATH COMPETITIVE ROBOT AI ENGINE (NO MORE STUCK)
// ========================================================================
function executeAdvancedRobotAI() {
    let ai = playerPieces.p2;     
    let human = playerPieces.p1;  
    let actionTaken = false;

    let humanDist = getShortestPathDistance(human, 0);
    let aiDist = getShortestPathDistance(ai, GRID_SIZE - 1);

    // Dynamic Defense: If human is dangerously close to victory line, block them!
    if (humanDist <= aiDist && human.r > 0) {
        let blockR = human.r - 1;
        let blockC = human.c;
        if(blockR >= 0 && hWalls[blockR][blockC] === null) {
            hWalls[blockR][blockC] = P2_COLOR;
            if (hasValidPath(playerPieces.p1, 0) && hasValidPath(playerPieces.p2, GRID_SIZE - 1)) {
                actionTaken = true;
                triggerGameNotice("🤖 ROBOT TRAPPED YOUR LINE!");
            } else {
                hWalls[blockR][blockC] = null; // Revert if violates protection rule
            }
        }
    }

    // Offense Aggression: Trace path step mapping
    if (!actionTaken) {
        let bestStep = null;
        let minPathLength = Infinity;
        let validSteps = [
            {r: ai.r + 1, c: ai.c}, // Forward Goal Direct
            {r: ai.r, c: ai.c - 1}, 
            {r: ai.r, c: ai.c + 1}, 
            {r: ai.r - 1, c: ai.c}
        ];

        for (let step of validSteps) {
            if (step.r >= 0 && step.r < GRID_SIZE && step.c >= 0 && step.c < GRID_SIZE) {
                if (!isWallBlocking(ai.r, ai.c, step.r, step.c) && !(human.r === step.r && human.c === step.c)) {
                    let d = getShortestPathDistance(step, GRID_SIZE - 1);
                    if (d < minPathLength) {
                        minPathLength = d;
                        bestStep = step;
                    }
                }
            }
        }

        if (bestStep) {
            playerPieces.p2 = bestStep;
            actionTaken = true;
        }
    }

    // Smart Fallback Random Wall Intercept Trigger
    if (!actionTaken) {
        for (let tr = 0; tr < 15; tr++) {
            let rr = Math.floor(Math.random() * (GRID_SIZE - 1));
            let rc = Math.floor(Math.random() * (GRID_SIZE - 1));
            if (hWalls[rr][rc] === null && Math.random() > 0.5) {
                hWalls[rr][rc] = P2_COLOR;
                if (hasValidPath(playerPieces.p1, 0) && hasValidPath(playerPieces.p2, GRID_SIZE - 1)) { actionTaken = true; break; }
                hWalls[rr][rc] = null;
            } else if (vWalls[rr][rc] === null) {
                vWalls[rr][rc] = P2_COLOR;
                if (hasValidPath(playerPieces.p1, 0) && hasValidPath(playerPieces.p2, GRID_SIZE - 1)) { actionTaken = true; break; }
                vWalls[rr][rc] = null;
            }
        }
    }

    // Deadlock Safe Move Escape Hatch
    if (!actionTaken) {
        let escapes = [{r: ai.r + 1, c: ai.c}, {r: ai.r, c: ai.c - 1}, {r: ai.r, c: ai.c + 1}, {r: ai.r - 1, c: ai.c}];
        for (let esc of escapes) {
            if (esc.r >= 0 && esc.r < GRID_SIZE && esc.c >= 0 && esc.c < GRID_SIZE) {
                if (!isWallBlocking(ai.r, ai.c, esc.r, esc.c) && !(human.r === esc.r && human.c === esc.c)) {
                    playerPieces.p2 = esc;
                    break;
                }
            }
        }
    }

    evaluateTurnShiftOffline(false);
}

// ==========================================
// 🎇 CELEBRATION DISPLAYS
// ==========================================
function startCelebrationCanvas() {
    const canvas = document.getElementById('firecracker-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    
    let particles = [];
    function spawnBurst() {
        let sx = Math.random() * canvas.width; let sy = Math.random() * (canvas.height * 0.5);
        let pallet = [P1_COLOR, P2_COLOR, '#8edc3a', '#ff9b13'];
        let shardColor = pallet[Math.floor(Math.random() * pallet.length)];
        for(let i=0; i<40; i++) {
            particles.push({
                x: sx, y: sy,
                vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
                alpha: 1, color: shardColor
            });
        }
    }

    firecrackerInterval = setInterval(spawnBurst, 350);

    function animate() {
        if(!document.getElementById('victory-screen').classList.contains('active')) return;
        ctx.clearRect(0,0, canvas.width, canvas.height);
        particles.forEach((p, idx) => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.alpha -= 0.012;
            if(p.alpha <= 0) particles.splice(idx, 1);
            ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha;
            ctx.fillRect(p.x, p.y, 6, 6);
        });
        ctx.globalAlpha = 1; requestAnimationFrame(animate);
    }
    animate();
}

function stopCelebrationCanvas() {
    clearInterval(firecrackerInterval);
}

function shareVictoryTray() {
    const shareTemplate = `🏆 Blockade X matches dominated! Try outwitting my strategic walls: ${window.location.href}`;
    if (navigator.share) {
        navigator.share({ title: 'BLOCKADE X CONQUEST', text: shareTemplate, url: window.location.href }).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareTemplate);
        triggerGameNotice("LINK SAVED TO CLIPBOARD!", true);
    }
}

function confirmExit() {
    if(peerNode) peerNode.destroy();
    stopCelebrationCanvas();
    showScreen('menu-screen');
}
