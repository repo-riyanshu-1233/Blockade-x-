const GRID_SIZE = 9;
const GAME_COLORS = {
    red: '#d63031', blue: '#0984e3', white: '#f1f2f6', black: '#2d3436',
    pink: '#e84393', green: '#2ecc71', yellow: '#f1c40f', purple: '#6c5ce7'
};

let gameMode = 'pass'; // pass, ai, host, client, random_match
let myRole = 'p1'; 
let p1Color = '#d63031';
let p2Color = '#0984e3';
let activeTurn = 'p1'; 

let playerPieces = { p1: { r: 0, c: 4 }, p2: { r: 8, c: 4 } };
let hWalls = Array(GRID_SIZE - 1).fill(null).map(() => Array(GRID_SIZE).fill(null));
let vWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE - 1).fill(null));

let peerNode = null;
let networkConnection = null;
let firecrackerInterval = null;
const brokerServicePrefix = "BX-9X9-"; // Keeps networking space separate

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    if(screenId !== 'victory-screen') stopCelebrationCanvas();
}

function toggleModal(modalId, isOpen) {
    document.getElementById(modalId).style.display = isOpen ? 'flex' : 'none';
}

// IN-GAME RETRO BANNER NOTIFICATION SYSTEM (Replaces alert Box)
function triggerGameNotice(msg, isPositive = false) {
    const toast = document.getElementById('game-toast');
    const noticeBoard = document.getElementById('game-live-notice');
    
    toast.innerText = msg.toUpperCase();
    if(noticeBoard) noticeBoard.innerText = msg.toUpperCase();

    if(isPositive) toast.classList.add('green-alert');
    else toast.classList.remove('green-alert');

    toast.classList.remove('hide');
    setTimeout(() => { toast.classList.add('hide'); }, 2500);
}

function openColorSelection(mode) {
    gameMode = mode; myRole = 'p1';
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
    if (p1Color === p2Color) { triggerGameNotice("CHOOSE DIFFERENT COLORS!"); return; }
    setupFreshMatch();
}

// ========================================================
// ⚡ 5-LETTER ALPHANUMERIC GENERATOR FOR SANDBOX SYSTEM
// ========================================================
function make5CharSandboxId() {
    let result = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function initiateSandboxHost() {
    gameMode = 'host'; myRole = 'p1';
    p1Color = '#ff9b13'; p2Color = '#00beff'; // Default Sandbox colors
    showScreen('host-room-screen');
    
    const customCode = make5CharSandboxId();
    document.getElementById('sandbox-code-display').innerText = customCode;

    // Hook to signaling cloud using structured namespace id mapping
    peerNode = new Peer(brokerServicePrefix + customCode);

    peerNode.on('connection', (conn) => {
        networkConnection = conn;
        setupNetworkListeners();
        triggerGameNotice("SANDBOX MATCH FOUND!", true);
        setTimeout(() => { setupFreshMatch(); }, 1000);
    });
}

function connectSandboxHost() {
    const enteredCode = document.getElementById('sandbox-input-code').value.trim().toUpperCase();
    if(enteredCode.length !== 5) { triggerGameNotice("ENTER EXACT 5-CHAR CODE!"); return; }

    gameMode = 'client'; myRole = 'p2';
    p1Color = '#ff9b13'; p2Color = '#00beff';

    peerNode = new Peer();
    peerNode.on('open', () => {
        networkConnection = peerNode.connect(brokerServicePrefix + enteredCode);
        setupNetworkListeners();
    });

    peerNode.on('error', () => {
        triggerGameNotice("ROOM NOT FOUND / CLOSED!");
        showScreen('sandbox-menu-screen');
    });
}

// ========================================================
// 🌐 GLOBAL RANDOM MATCHMAKING ENGINE (ONLINE PVP STREAM)
// ========================================================
function startRandomMatchmaking() {
    gameMode = 'random_match';
    showScreen('matchmaking-screen');
    document.getElementById('match-status-text').innerText = "FINDING MATCH...";

    const randomSeed = Math.floor(Math.random() * 9000) + 1000;
    peerNode = new Peer(brokerServicePrefix + "GLOBAL-" + randomSeed);

    peerNode.on('open', (myID) => {
        // Look back for previous adjacent open channel spaces (P2P Discovery Sweep)
        let searchAttempts = 0;
        let foundMatch = false;

        function probeNextPoolElement() {
            if (searchAttempts > 6) {
                // If nobody found yet, transition node into Listening Host state
                document.getElementById('match-status-text').innerText = "WAITING IN ROOM...";
                return;
            }
            searchAttempts++;
            let testTargetSeed = randomSeed - searchAttempts;
            if(testTargetSeed < 1000) testTargetSeed += 8000;

            let testConn = peerNode.connect(brokerServicePrefix + "GLOBAL-" + testTargetSeed);
            
            let handshakeTimeout = setTimeout(() => {
                testConn.close();
                probeNextPoolElement();
            }, 800);

            testConn.on('open', () => {
                clearTimeout(handshakeTimeout);
                foundMatch = true;
                gameMode = 'client'; myRole = 'p2';
                p1Color = '#ff5252'; p2Color = '#8edc3a';
                networkConnection = testConn;
                setupNetworkListeners();
                triggerGameNotice("MATCH CONNECTED!", true);
                setupFreshMatch();
            });
        }
        probeNextPoolElement();
    });

    peerNode.on('connection', (conn) => {
        // Someone poked our listening pool node channel
        gameMode = 'host'; myRole = 'p1';
        p1Color = '#ff5252'; p2Color = '#8edc3a';
        networkConnection = conn;
        setupNetworkListeners();
        triggerGameNotice("PLAYER JOINED!", true);
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
        triggerGameNotice("OPPONENT LEFT THE GAME!");
        confirmExit();
    });
}

function disconnectPeer() {
    if(peerNode) peerNode.destroy();
    showScreen('menu-screen');
}

// ========================================================
// ⚙️ CORE ENGINE GRAPHICS MECHANICS & MOVEMENTS
// ========================================================
function setupFreshMatch() {
    activeTurn = 'p1';
    playerPieces = { p1: { r: 0, c: 4 }, p2: { r: 8, c: 4 } };
    for(let r=0; r<GRID_SIZE-1; r++) hWalls[r].fill(null);
    for(let r=0; r<GRID_SIZE; r++) vWalls[r].fill(null);
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

    for(let r=0; r<GRID_SIZE-1; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let trigger = document.createElement('div');
            trigger.className = 'wall-trigger horizontal-type';
            trigger.style.left = `${c * 40}px`;
            trigger.style.top = `${(r + 1) * 38 + r * 2}px`;
            if(hWalls[r][c] !== null) {
                trigger.classList.add('placed-wall');
                trigger.style.backgroundColor = hWalls[r][c]; // Sets builder user color
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
            trigger.style.left = `${(c + 1) * 38 + c * 2}px`;
            trigger.style.top = `${r * 40}px`;
            if(vWalls[r][c] !== null) {
                trigger.classList.add('placed-wall');
                trigger.style.backgroundColor = vWalls[r][c]; // Sets builder user color
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
    if(gameMode !== 'pass' && gameMode !== 'ai') {
        if(activeTurn === myRole) {
            tracker.innerText = "YOUR TURN"; tracker.style.borderColor = (myRole === 'p1') ? p1Color : p2Color;
        } else {
            tracker.innerText = "OPPONENT TURN"; tracker.style.borderColor = (myRole === 'p1') ? p2Color : p1Color;
        }
        return;
    }
    tracker.innerText = activeTurn === 'p1' ? "P1 TURN" : ((gameMode === 'ai') ? "AI BOT TURN" : "P2 TURN");
    tracker.style.borderColor = activeTurn === 'p1' ? p1Color : p2Color;
}

function isWallBlocking(r1, c1, r2, c2) {
    if (r1 === r2) { return vWalls[r1][Math.min(c1, c2)] !== null; }
    if (c1 === c2) { return hWalls[Math.min(r1, r2)][c1] !== null; }
    return false;
}

function hasValidPath(startPos, targetRow) {
    let visited = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
    let queue = [startPos]; visited[startPos.r][startPos.c] = true;
    while(queue.length > 0) {
        let curr = queue.shift(); if (curr.r === targetRow) return true;
        let directions = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for(let d of directions) {
            let nr = curr.r + d.r; let nc = curr.c + d.c;
            if(nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                if(!visited[nr][nc] && !isWallBlocking(curr.r, curr.c, nr, nc)) {
                    visited[nr][nc] = true; queue.push({r: nr, c: nc});
                }
            }
        }
    }
    return false;
}

function attemptWallPlacement(type, r, c) {
    if((gameMode === 'host' || gameMode === 'client') && activeTurn !== myRole) return;
    if(gameMode === 'ai' && activeTurn === 'p2') return;

    let activeColor = (activeTurn === 'p1') ? p1Color : p2Color;
    if(type === 'h') hWalls[r][c] = activeColor; else vWalls[r][c] = activeColor;

    if(!hasValidPath(playerPieces.p1, 8) || !hasValidPath(playerPieces.p2, 0)) {
        if(type === 'h') hWalls[r][c] = null; else vWalls[r][c] = null;
        triggerGameNotice("⚠️ WRONG MOVE: TRAP DETECTED!");
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
        if(isWallBlocking(loc.r, loc.c, tarR, tarC)) { triggerGameNotice("⚠️ PATH BLOCKED BY WALL!"); return; }
        if(playerPieces[activeTurn === 'p1' ? 'p2' : 'p1'].r === tarR && playerPieces[activeTurn === 'p1' ? 'p2' : 'p1'].c === tarC) return;

        playerPieces[activeTurn] = { r: tarR, c: tarC };

        if(gameMode === 'host' || gameMode === 'client') {
            networkConnection.send({ type: 'move', player: activeTurn, coordinates: playerPieces[activeTurn] });
        }
        evaluateTurnShiftOffline(true);
    } else {
        triggerGameNotice("⚠️ MOVEMENT NOT ALLOWED HERE!");
    }
}

function evaluateTurnShiftOffline(shouldTriggerAI = true) {
    renderEngine();
    if(playerPieces.p1.r === 8) return launchVictorySequence("PLAYER 1");
    if(playerPieces.p2.r === 0) return launchVictorySequence("PLAYER 2");

    activeTurn = activeTurn === 'p1' ? 'p2' : 'p1';
    updateHeaderIndicator();

    if(gameMode === 'ai' && activeTurn === 'p2' && shouldTriggerAI) {
        setTimeout(executeAiStrategy, 600);
    }
}

function executeAiStrategy() {
    let ai = playerPieces.p2; let target = playerPieces.p1; let moved = false;
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
            let rr = Math.floor(Math.random() * (GRID_SIZE - 1)); let rc = Math.floor(Math.random() * GRID_SIZE);
            if(hWalls[rr][rc] === null) {
                hWalls[rr][rc] = p2Color;
                if(hasValidPath(playerPieces.p1, 8) && hasValidPath(playerPieces.p2, 0)) break;
                hWalls[rr][rc] = null;
            }
            attempts++;
        }
    }
    evaluateTurnShiftOffline(false);
}

// ========================================================
// 🎇 RETRO FIRECRACKERS ENGINE & SHARING MECHANICS
// ========================================================
function launchVictorySequence(winnerLabel) {
    document.getElementById('winner-declaration-text').innerText = `${winnerLabel} WINS THE MAZE CHAMPIONSHIP!`;
    showScreen('victory-screen');
    startCelebrationCanvas();
}

function startCelebrationCanvas() {
    const canvas = document.getElementById('firecracker-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    
    let particles = [];
    function spawnBurst() {
        let sx = Math.random() * canvas.width; let sy = Math.random() * (canvas.height * 0.6);
        let colors = ['#ff9b13', '#00beff', '#8edc3a', '#ff5252', '#f1c40f', '#e84393'];
        let burstColor = colors[Math.floor(Math.random() * colors.length)];
        for(let i=0; i<35; i++) {
            particles.push({
                x: sx, y: sy,
                vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7,
                alpha: 1, color: burstColor
            });
        }
    }

    firecrackerInterval = setInterval(spawnBurst, 400);

    function animate() {
        if(!document.getElementById('victory-screen').classList.contains('active')) return;
        ctx.clearRect(0,0, canvas.width, canvas.height);
        particles.forEach((p, idx) => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.alpha -= 0.01;
            if(p.alpha <= 0) particles.splice(idx, 1);
            ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha;
            ctx.fillRect(p.x, p.y, 5, 5);
        });
        ctx.globalAlpha = 1; requestAnimationFrame(animate);
    }
    animate();
}

function stopCelebrationCanvas() {
    clearInterval(firecrackerInterval);
}

// OS Native Tray Integration for Image / Link text distribution
function shareVictoryTray() {
    const defaultText = `🏆 I just dominated the 9x9 grid on Blockade X! Can you break my defense? \n🎮 Play Real-time Multiplayer here: ${window.location.href}`;
    if (navigator.share) {
        navigator.share({
            title: 'BLOCKADE X VICTORY!',
            text: defaultText,
            url: window.location.href
        }).catch(() => triggerGameNotice("SHARING CANCELLED"));
    } else {
        navigator.clipboard.writeText(defaultText);
        triggerGameNotice("LINK + TEXT COPIED TO CLIPBOARD!", true);
    }
}

function confirmExit() {
    if(peerNode) peerNode.destroy();
    stopCelebrationCanvas();
    showScreen('menu-screen');
}
