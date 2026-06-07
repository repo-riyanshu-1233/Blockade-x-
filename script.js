const GRID_SIZE = 9;
const GAME_COLORS = {
    red: '#d63031', blue: '#0984e3', white: '#6c5ce7', black: '#2d3436',
    pink: '#e84393', green: '#2ecc71', yellow: '#f1c40f', purple: '#121f35'
};

let gameMode = 'pass'; 
let myRole = 'p1'; 
let p1Color = '#d63031';
let p2Color = '#0984e3';
let activeTurn = 'p1'; 

let playerPieces = { p1: { r: 0, c: 4 }, p2: { r: 8, c: 4 } };

let hWalls = Array(GRID_SIZE - 1).fill(null).map(() => Array(GRID_SIZE - 1).fill(null));
let vWalls = Array(GRID_SIZE - 1).fill(null).map(() => Array(GRID_SIZE - 1).fill(null));

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
    setTimeout(() => { toast.classList.add('hide'); }, 2200);
}

function openColorSelection(mode) {
    gameMode = mode; myRole = 'p1';
    const p1Container = document.getElementById('p1-colors');
    const p2Container = document.getElementById('p2-colors');
    p1Container.innerHTML = ''; p2Container.innerHTML = '';
    document.getElementById('p2-title').innerText = (mode === 'ai') ? "AI ROBOT" : "PLAYER 2";

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
    if (p1Color === p2Color) { triggerGameNotice("CHOOSE DIFFERENT COLORS!"); return; }
    setupFreshMatch();
}

function generate5BitCode() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < 5; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

// ==========================================
// 🛡️ PRIVATE SANDBOX HUBS INTERACTION
// ==========================================
function initiateSandboxHost() {
    gameMode = 'host'; myRole = 'p1';
    p1Color = '#ff9b13'; p2Color = '#00beff';
    showScreen('sandbox-host-screen');
    
    const roomCode = generate5BitCode();
    document.getElementById('sandbox-code-display').innerText = roomCode;

    peerNode = new Peer(cloudBrokerPrefix + roomCode);
    peerNode.on('connection', (conn) => {
        networkConnection = conn;
        setupNetworkListeners();
        triggerGameNotice("SANDBOX CONNECTED!", true);
        setTimeout(() => { setupFreshMatch(); }, 1000);
    });
}

function connectSandboxHost() {
    const targetCode = document.getElementById('sandbox-input-code').value.trim().toUpperCase();
    if(targetCode.length !== 5) { triggerGameNotice("ENTER VALID 5 DIGIT CODE"); return; }

    gameMode = 'client'; myRole = 'p2';
    p1Color = '#ff9b13'; p2Color = '#00beff';

    peerNode = new Peer();
    peerNode.on('open', () => {
        networkConnection = peerNode.connect(cloudBrokerPrefix + targetCode);
        setupNetworkListeners();
    });
    peerNode.on('error', () => {
        triggerGameNotice("INVALID HOOK ROOM!");
        showScreen('sandbox-menu-screen');
    });
}

// ==========================================
// 🌐 RANDOM MATCH INTERACTION ENGINE
// ==========================================
function startRandomMatchmaking() {
    gameMode = 'random_match';
    showScreen('matchmaking-screen');
    document.getElementById('match-status-text').innerText = "LOOKING FOR ARENA...";
    
    const lobbyRandomTicket = Math.floor(Math.random() * 20) + 100; 
    peerNode = new Peer(cloudBrokerPrefix + "GLOBAL-POOL-" + lobbyRandomTicket);

    peerNode.on('open', () => {
        let sweepId = 100;
        let connected = false;

        function probeNextLobbySlot() {
            if (sweepId > 120 || connected) {
                if(!connected) {
                    document.getElementById('match-status-text').innerText = "WAITING POOL";
                    document.getElementById('match-sub-status').innerText = "LOBBY CREATED! WAITING FOR AN OPPONENT TO TAP MATCHMAKING...";
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
                p1Color = '#ff5252'; p2Color = '#8edc3a';
                networkConnection = proxyConnection;
                setupNetworkListeners();
                triggerGameNotice("CONNECTED TO LIVE PLAYER!", true);
                setupFreshMatch();
            });
        }
        probeNextLobbySlot();
    });

    peerNode.on('connection', (incomingConn) => {
        gameMode = 'host'; myRole = 'p1';
        p1Color = '#ff5252'; p2Color = '#8edc3a';
        networkConnection = incomingConn;
        setupNetworkListeners();
        triggerGameNotice("PLAYER HOOKED ON JUMP!", true);
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
        triggerGameNotice("PARTNER DISCONNECTED!");
        confirmExit();
    });
}

function disconnectPeer() {
    if(peerNode) peerNode.destroy();
    showScreen('menu-screen');
}

// ==========================================
// 🧱 MATRIX BOARD EXECUTION
// ==========================================
function setupFreshMatch() {
    activeTurn = 'p1';
    playerPieces = { p1: { r: 0, c: 4 }, p2: { r: 8, c: 4 } };
    
    hWalls = Array(GRID_SIZE - 1).fill(null).map(() => Array(GRID_SIZE - 1).fill(null));
    vWalls = Array(GRID_SIZE - 1).fill(null).map(() => Array(GRID_SIZE - 1).fill(null));

    showScreen('game-screen');
    renderEngine();
}

function renderEngine() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';

    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let cell = document.createElement('div');
            cell.className = 'cell';
            cell.onclick = () => processPieceMovement(r, c);

            if(playerPieces.p1.r === r && playerPieces.p1.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece'; piece.style.backgroundColor = p1Color;
                cell.appendChild(piece);
            } else if(playerPieces.p2.r === r && playerPieces.p2.c === c) {
                let piece = document.createElement('div');
                piece.className = 'game-piece'; piece.style.backgroundColor = p2Color;
                cell.appendChild(piece);
            }
            board.appendChild(cell);
        }
    }

    // Render Dual Span capsule intersections
    for(let r=0; r<GRID_SIZE-1; r++) {
        for(let c=0; c<GRID_SIZE-1; c++) {
            let triggerH = document.createElement('div');
            triggerH.className = 'wall-trigger horizontal-type';
            triggerH.style.left = `${c * 58}px`;
            triggerH.style.top = `${(r + 1) * 55 + r * 3}px`;
            
            if(hWalls[r][c] !== null) {
                triggerH.classList.add('placed-wall');
                triggerH.style.backgroundColor = hWalls[r][c];
            } else {
                triggerH.onclick = (e) => { e.stopPropagation(); attemptWallPlacement('h', r, c); };
            }
            board.appendChild(triggerH);

            let triggerV = document.createElement('div');
            triggerV.className = 'wall-trigger vertical-type';
            triggerV.style.left = `${(c + 1) * 55 + c * 3}px`;
            triggerV.style.top = `${r * 58}px`;
            
            if(vWalls[r][c] !== null) {
                triggerV.classList.add('placed-wall');
                triggerV.style.backgroundColor = vWalls[r][c];
            } else {
                triggerV.onclick = (e) => { e.stopPropagation(); attemptWallPlacement('v', r, c); };
            }
            board.appendChild(triggerV);
        }
    }
    updateHeaderIndicator();
}

function updateHeaderIndicator() {
    const bottomBanner = document.getElementById('bottom-turn-banner');
    if(gameMode !== 'pass' && gameMode !== 'ai') {
        if(activeTurn === myRole) {
            bottomBanner.innerText = "YOUR TURN";
            bottomBanner.style.borderColor = (myRole === 'p1') ? p1Color : p2Color;
        } else {
            bottomBanner.innerText = "OPPONENT'S TURN";
            bottomBanner.style.borderColor = (myRole === 'p1') ? p2Color : p1Color;
        }
        return;
    }
    bottomBanner.innerText = activeTurn === 'p1' ? "YOUR TURN" : ((gameMode === 'ai') ? "ROBOT🤖 TURN" : "PLAYER 2 TURN");
    bottomBanner.style.borderColor = activeTurn === 'p1' ? p1Color : p2Color;
}

function isWallBlocking(r1, c1, r2, c2) {
    if (r1 === r2) {
        let minC = Math.min(c1, c2);
        if (minC < 0 || minC >= GRID_SIZE - 1) return false;
        if (vWalls[r1][minC] !== null) return true;
        if (r1 > 0 && vWalls[r1 - 1][minC] !== null) return true;
    }
    if (c1 === c2) {
        let minR = Math.min(r1, r2);
        if (minR < 0 || minR >= GRID_SIZE - 1) return false;
        if (hWalls[minR][c1] !== null) return true;
        if (c1 > 0 && hWalls[minR][c1 - 1] !== null) return true;
    }
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

    let activeColor = (activeTurn === 'p1') ? p1Color : p2Color;

    if(type === 'h') {
        if(hWalls[r][c] !== null || (c > 0 && hWalls[r][c-1] !== null) || (c < GRID_SIZE-2 && hWalls[r][c+1] !== null)) {
            triggerGameNotice("⚠️ WALL OVERLAP COLLISION!"); return;
        }
        hWalls[r][c] = activeColor;
    } else {
        if(vWalls[r][c] !== null || (r > 0 && vWalls[r-1][c] !== null) || (r < GRID_SIZE-2 && vWalls[r+1][c] !== null)) {
            triggerGameNotice("⚠️ WALL OVERLAP COLLISION!"); return;
        }
        vWalls[r][c] = activeColor;
    }

    if(!hasValidPath(playerPieces.p1, 8) || !hasValidPath(playerPieces.p2, 0)) {
        if(type === 'h') hWalls[r][c] = null; else vWalls[r][c] = null;
        triggerGameNotice("⚠️ REJECTED: PATH CANNOT BE COMPLETELY LOCKED!");
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
        if(isWallBlocking(loc.r, loc.c, tarR, tarC)) { triggerGameNotice("⚠️ BLOCKED BY WALL!"); return; }
        if(playerPieces[activeTurn === 'p1' ? 'p2' : 'p1'].r === tarR && playerPieces[activeTurn === 'p1' ? 'p2' : 'p1'].c === tarC) return;

        playerPieces[activeTurn] = { r: tarR, c: tarC };

        if(gameMode === 'host' || gameMode === 'client') {
            networkConnection.send({ type: 'move', player: activeTurn, coordinates: playerPieces[activeTurn] });
        }
        evaluateTurnShiftOffline(true);
    } else {
        triggerGameNotice("⚠️ MOVEMENT INVALID!");
    }
}

function evaluateTurnShiftOffline(shouldTriggerAI = true) {
    renderEngine();
    if(playerPieces.p1.r === 8) return launchVictorySequence("PLAYER 1");
    if(playerPieces.p2.r === 0) return launchVictorySequence("🤖 INTELLIGENT ROBOT");

    activeTurn = activeTurn === 'p1' ? 'p2' : 'p1';
    updateHeaderIndicator();

    if(gameMode === 'ai' && activeTurn === 'p2' && shouldTriggerAI) {
        setTimeout(executeAiStrategy, 400);
    }
}

// ========================================================
// 🤖 FIXED SMART PATHFINDING AI BOT SYSTEM
// ========================================================
function executeAiStrategy() {
    let ai = playerPieces.p2; 
    let human = playerPieces.p1;
    let actionTaken = false;

    // RULE 1: APNA SHORTCUT RASTA NIKALNA (A* Pathfinding to target Row 0)
    let bestMove = null;
    let minDistance = Infinity;
    let potentialMoves = [
        {r: ai.r - 1, c: ai.c}, // Upward Shortcut
        {r: ai.r, c: ai.c - 1}, // Left
        {r: ai.r, c: ai.c + 1}, // Right
        {r: ai.r + 1, c: ai.c}  // Backtrack down if stuck
    ];

    for (let m of potentialMoves) {
        if (m.r >= 0 && m.r < GRID_SIZE && m.c >= 0 && m.c < GRID_SIZE) {
            if (!isWallBlocking(ai.r, ai.c, m.r, m.c) && !(human.r === m.r && human.c === m.c)) {
                let d = getShortestPathDistance(m, 0); // Find length to target baseline
                if (d < minDistance) {
                    minDistance = d;
                    bestMove = m;
                }
            }
        }
    }

    // RULE 2: STRATEGIC BLOCKED TRAPS - Agar human bahut aage badh raha hai, toh use aage se roko!
    if (human.r >= 4 && Math.abs(ai.r - human.r) > 1 && Math.random() < 0.6) {
        let targetRow = Math.min(human.r, GRID_SIZE - 2);
        let targetCol = Math.min(human.c, GRID_SIZE - 2);

        if (hWalls[targetRow][targetCol] === null && (targetCol === 0 || hWalls[targetRow][targetCol - 1] === null)) {
            hWalls[targetRow][targetCol] = p2Color;
            if (hasValidPath(playerPieces.p1, 8) && hasValidPath(playerPieces.p2, 0)) {
                actionTaken = true;
                triggerGameNotice("🤖 ROBOT STRATEGICALLY BLOCKED YOU!");
            } else {
                hWalls[targetRow][targetCol] = null; // Path blocking rollback validation
            }
        }
    }

    // If no blocking wall action was deployed, execute the pre-calculated shortest move path
    if (!actionTaken && bestMove) {
        playerPieces.p2 = bestMove;
        actionTaken = true;
    }

    // FALLBACK RULE: Safe structural wall placement if absolutely caged up
    if (!actionTaken) {
        for (let attempt = 0; attempt < 20; attempt++) {
            let rr = Math.floor(Math.random() * (GRID_SIZE - 1));
            let rc = Math.floor(Math.random() * (GRID_SIZE - 1));
            if (vWalls[rr][rc] === null) {
                vWalls[rr][rc] = p2Color;
                if (hasValidPath(playerPieces.p1, 8) && hasValidPath(playerPieces.p2, 0)) {
                    actionTaken = true; break;
                }
                vWalls[rr][rc] = null;
            }
        }
    }

    evaluateTurnShiftOffline(false);
}

// ==========================================
// 🎇 FIRECRACKER CELEBRATION
// ==========================================
function launchVictorySequence(winnerLabel) {
    document.getElementById('winner-declaration-text').innerText = `${winnerLabel} CAPTURED THE BASELINE MATCH!`;
    showScreen('victory-screen');
    startCelebrationCanvas();
}

function startCelebrationCanvas() {
    const canvas = document.getElementById('firecracker-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    
    let particles = [];
    function spawnBurst() {
        let sx = Math.random() * canvas.width; let sy = Math.random() * (canvas.height * 0.5);
        let pallet = ['#ff9b13', '#00beff', '#8edc3a', '#ff5252', '#f1c40f'];
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
    const shareTemplate = `🏆 I dominated the matrix match on Blockade X! Try breaking through the defenses: ${window.location.href}`;
    if (navigator.share) {
        navigator.share({ title: 'BLOCKADE X ARENA', text: shareTemplate, url: window.location.href }).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareTemplate);
        triggerGameNotice("LINK COPIED TO CLIPBOARD!", true);
    }
}

function confirmExit() {
    if(peerNode) peerNode.destroy();
    stopCelebrationCanvas();
    showScreen('menu-screen');
}
