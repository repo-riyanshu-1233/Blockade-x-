const MAINTENANCE_SWITCH = false; 

let GRID_SIZE = 8; 
let TOTAL_PLAYERS = 2; 

const PLAYER_COLORS = {
    p1: '#ff5252', // Red
    p2: '#00beff', // Blue
    p3: '#8edc3a', // Green
    p4: '#ff9b13'  // Yellow
};

const PLAYER_NAMES_DEFAULT = {
    p1: "RED",
    p2: "BLUE",
    p3: "GREEN",
    p4: "YELLOW"
};

let gameMode = 'pass'; 
let myRole = 'p1';       
let activeTurn = 'p1'; 
let turnOrder = ['p1', 'p2'];
let aiDifficulty = 'intermediate'; 

let myPlayerName = "PLAYER";
let roomPlayers = {}; 

let playerPieces = {};

let hWalls = [];
let vWalls = [];

let turnTimer = null;
let timeLeft = 30;

let peerNode = null;
let networkConnections = {}; 
let hostConnection = null; 
let firecrackerInterval = null;
const cloudBrokerPrefix = "BLKD-X11-"; 

window.addEventListener('DOMContentLoaded', () => {
    if (MAINTENANCE_SWITCH) {
        showScreen('maintenance-screen');
    } else {
        showScreen('menu-screen');
    }
});

function showScreen(screenId) {
    if (MAINTENANCE_SWITCH && screenId !== 'maintenance-screen') return;

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
    if (MAINTENANCE_SWITCH) return; 
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

function launchDirectGame(mode, pCount) {
    gameMode = mode; 
    TOTAL_PLAYERS = pCount;
    GRID_SIZE = (pCount === 4) ? 11 : 8;
    myRole = 'p1'; 
    setupFreshMatch();
}

function openAIDifficultyScreen(pCount) {
    TOTAL_PLAYERS = pCount;
    GRID_SIZE = (pCount === 4) ? 11 : 8;
    document.getElementById('ai-menu-title').innerText = pCount === 4 ? "4P BOT DIFFICULTY" : "2P BOT DIFFICULTY";
    showScreen('ai-menu-screen');
}

function launchAIGame(diff) {
    gameMode = 'ai'; 
    aiDifficulty = diff; 
    myRole = 'p1'; 
    setupFreshMatch();
}

function openOnlineNameInput(pCount) {
    TOTAL_PLAYERS = pCount;
    GRID_SIZE = (pCount === 4) ? 11 : 8;
    showScreen('online-name-screen');
}

function openSandboxConfig(pCount) {
    TOTAL_PLAYERS = pCount;
    GRID_SIZE = (pCount === 4) ? 11 : 8;
    document.getElementById('sandbox-action-title').innerText = `${pCount} PLAYERS SANDBOX`;
    showScreen('sandbox-action-screen');
}

function generate5BitCode() {
    let text = ""; const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < 5; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

function submitSandboxHostAndGenerate() {
    let hostInput = document.getElementById('sandbox-host-name').value.trim();
    myPlayerName = hostInput.length === 0 ? "HOST" : hostInput.toUpperCase();
    initiateSandboxHost();
}

function initiateSandboxHost() {
    gameMode = 'host'; 
    myRole = 'p1'; 
    roomPlayers = { p1: myPlayerName };
    showScreen('sandbox-host-screen');
    const roomCode = generate5BitCode();
    document.getElementById('sandbox-code-display').innerText = roomCode;
    updateHostLobbyUI();

    peerNode = new Peer(cloudBrokerPrefix + roomCode);
    peerNode.on('connection', (conn) => {
        let assignedRole = null;
        for (let i = 2; i <= TOTAL_PLAYERS; i++) {
            let rKey = 'p' + i;
            if (!roomPlayers[rKey]) {
                assignedRole = rKey;
                break;
            }
        }

        if (!assignedRole) {
            conn.close();
            return;
        }

        networkConnections[assignedRole] = conn;

        conn.on('data', (data) => {
            if (data.type === 'client-join') {
                roomPlayers[assignedRole] = data.playerName;
                conn.send({ type: 'welcome', role: assignedRole, totalPlayers: TOTAL_PLAYERS, roomPlayers: roomPlayers });
                broadcastLobbyState();
                updateHostLobbyUI();
            } else if (data.type === 'move') {
                playerPieces[data.player] = data.coordinates;
                broadcastNetworkData(data, assignedRole);
                evaluateTurnShiftOffline(false);
            } else if (data.type === 'wall') {
                if(data.wallType === 'h') hWalls[data.r][data.c] = data.color;
                else vWalls[data.r][data.c] = data.color;
                broadcastNetworkData(data, assignedRole);
                evaluateTurnShiftOffline(false);
            } else if (data.type === 'timeout') {
                broadcastNetworkData(data, assignedRole);
                evaluateTurnShiftOffline(false);
            }
        });

        conn.on('close', () => {
            delete roomPlayers[assignedRole];
            delete networkConnections[assignedRole];
            broadcastLobbyState();
            updateHostLobbyUI();
        });
    });
}

function broadcastLobbyState() {
    broadcastNetworkData({ type: 'lobby-update', roomPlayers: roomPlayers, totalPlayers: TOTAL_PLAYERS });
}

function broadcastNetworkData(data, excludeRole = null) {
    for (let rKey in networkConnections) {
        if (rKey !== excludeRole && networkConnections[rKey]) {
            networkConnections[rKey].send(data);
        }
    }
}

function updateHostLobbyUI() {
    const listContainer = document.getElementById('sandbox-player-list-box');
    const startBtn = document.getElementById('sandbox-start-btn');
    const statusSub = document.getElementById('sandbox-host-status-sub');
    
    listContainer.innerHTML = '';
    let joinedCount = 0;

    for (let i = 1; i <= TOTAL_PLAYERS; i++) {
        let rKey = 'p' + i;
        let pName = roomPlayers[rKey];
        let row = document.createElement('div');
        row.className = 'lobby-player-row';
        
        if (pName) {
            joinedCount++;
            row.innerHTML = `<span><span class="player-badge" style="background:${PLAYER_COLORS[rKey]}"></span> ${pName}</span> <span style="color:#8edc3a">READY</span>`;
        } else {
            row.innerHTML = `<span style="color:#7f8fa4"><span class="player-badge" style="background:#2c3540"></span> EMPTY SLOT</span> <span style="color:#ff5252">WAITING</span>`;
        }
        listContainer.appendChild(row);
    }

    if (joinedCount === TOTAL_PLAYERS) {
        startBtn.style.display = 'inline-block';
        statusSub.innerText = "ALL PLAYERS JOINED! PRESS START!";
        statusSub.style.color = "#8edc3a";
    } else {
        startBtn.style.display = 'none';
        statusSub.innerText = `WAITING FOR PLAYERS (${joinedCount}/${TOTAL_PLAYERS})...`;
        statusSub.style.color = "#ff9b13";
    }
}

function connectSandboxHost() {
    let clientInput = document.getElementById('sandbox-client-name').value.trim();
    myPlayerName = clientInput.length === 0 ? "GUEST" : clientInput.toUpperCase();

    const targetCode = document.getElementById('sandbox-input-code').value.trim().toUpperCase();
    if(targetCode.length !== 5) { triggerGameNotice("ENTER EXACT 5 VALUE CODE"); return; }
    gameMode = 'client'; 

    peerNode = new Peer();
    peerNode.on('open', () => {
        hostConnection = peerNode.connect(cloudBrokerPrefix + targetCode);
        
        hostConnection.on('open', () => {
            hostConnection.send({ type: 'client-join', playerName: myPlayerName });
        });

        hostConnection.on('data', (data) => {
            if (data.type === 'welcome') {
                myRole = data.role;
                TOTAL_PLAYERS = data.totalPlayers;
                GRID_SIZE = (TOTAL_PLAYERS === 4) ? 11 : 8;
                roomPlayers = data.roomPlayers;
                showScreen('sandbox-guest-lobby-screen');
                updateGuestLobbyUI();
            } else if (data.type === 'lobby-update') {
                roomPlayers = data.roomPlayers;
                updateGuestLobbyUI();
            } else if (data.type === 'start-game') {
                roomPlayers = data.roomPlayers;
                setupFreshMatch();
            } else if (data.type === 'move') {
                playerPieces[data.player] = data.coordinates; 
                evaluateTurnShiftOffline(false);
            } else if (data.type === 'wall') {
                if(data.wallType === 'h') hWalls[data.r][data.c] = data.color;
                else vWalls[data.r][data.c] = data.color;
                evaluateTurnShiftOffline(false);
            } else if (data.type === 'timeout') {
                triggerGameNotice("⚠️ PLAYER TIMED OUT!");
                evaluateTurnShiftOffline(false);
            }
        });

        hostConnection.on('close', () => {
            triggerGameNotice("DISCONNECTED FROM HOST");
            confirmExit();
        });
    });

    peerNode.on('error', () => {
        triggerGameNotice("EXPIRED OR WRONG ROOM!");
        showScreen('sandbox-action-screen');
    });
}

function updateGuestLobbyUI() {
    const listContainer = document.getElementById('sandbox-guest-list-box');
    listContainer.innerHTML = '';

    for (let i = 1; i <= TOTAL_PLAYERS; i++) {
        let rKey = 'p' + i;
        let pName = roomPlayers[rKey];
        let row = document.createElement('div');
        row.className = 'lobby-player-row';
        
        if (pName) {
            row.innerHTML = `<span><span class="player-badge" style="background:${PLAYER_COLORS[rKey]}"></span> ${pName}</span> <span style="color:#8edc3a">CONNECTED</span>`;
        } else {
            row.innerHTML = `<span style="color:#7f8fa4"><span class="player-badge" style="background:#2c3540"></span> WAITING...</span>`;
        }
        listContainer.appendChild(row);
    }
}

function hostStartSandboxMatch() {
    if (Object.keys(roomPlayers).length < TOTAL_PLAYERS) return;
    broadcastNetworkData({ type: 'start-game', roomPlayers: roomPlayers });
    setupFreshMatch();
}

function submitNameAndFindMatch() {
    let nameInput = document.getElementById('online-player-name').value.trim();
    myPlayerName = nameInput.length === 0 ? "PLAYER" : nameInput.toUpperCase();
    startRandomMatchmaking();
}

function startRandomMatchmaking() {
    gameMode = 'random_match';
    showScreen('matchmaking-screen');
    document.getElementById('match-status-text').innerText = "SEEKING OPPONENTS...";
    
    const lobbyRandomTicket = Math.floor(Math.random() * 20) + 100; 
    peerNode = new Peer(cloudBrokerPrefix + `RANDOM-${TOTAL_PLAYERS}P-` + lobbyRandomTicket);

    peerNode.on('open', () => {
        let sweepId = 100; let connected = false;
        function probeNextSlot() {
            if (sweepId > 120 || connected) {
                if(!connected) { document.getElementById('match-status-text').innerText = "WAITING ROOM HOST"; }
                return;
            }
            if (sweepId === lobbyRandomTicket) { sweepId++; probeNextSlot(); return; }

            let proxyConn = peerNode.connect(cloudBrokerPrefix + `RANDOM-${TOTAL_PLAYERS}P-` + sweepId);
            let joinWatchdog = setTimeout(() => {
                proxyConn.close(); sweepId++; probeNextSlot();
            }, 500);

            proxyConn.on('open', () => {
                clearTimeout(joinWatchdog); 
                connected = true; 
                gameMode = 'client'; 
                hostConnection = proxyConn;
                hostConnection.send({ type: 'client-join', playerName: myPlayerName });

                hostConnection.on('data', (data) => {
                    if (data.type === 'welcome') {
                        myRole = data.role;
                        roomPlayers = data.roomPlayers;
                    } else if (data.type === 'start-game') {
                        roomPlayers = data.roomPlayers;
                        setupFreshMatch();
                    } else if (data.type === 'move') {
                        playerPieces[data.player] = data.coordinates; 
                        evaluateTurnShiftOffline(false);
                    } else if (data.type === 'wall') {
                        if(data.wallType === 'h') hWalls[data.r][data.c] = data.color;
                        else vWalls[data.r][data.c] = data.color;
                        evaluateTurnShiftOffline(false);
                    } else if (data.type === 'timeout') {
                        evaluateTurnShiftOffline(false);
                    }
                });
            });
        }
        probeNextSlot();
    });

    peerNode.on('connection', (incomingConn) => {
        gameMode = 'host';
        let assignedRole = null;
        for (let i = 2; i <= TOTAL_PLAYERS; i++) {
            let rKey = 'p' + i;
            if (!roomPlayers[rKey]) {
                assignedRole = rKey;
                break;
            }
        }
        if(!assignedRole) { incomingConn.close(); return; }
        
        networkConnections[assignedRole] = incomingConn;

        incomingConn.on('data', (data) => {
            if (data.type === 'client-join') {
                roomPlayers[assignedRole] = data.playerName;
                incomingConn.send({ type: 'welcome', role: assignedRole, totalPlayers: TOTAL_PLAYERS, roomPlayers: roomPlayers });
                
                if (Object.keys(roomPlayers).length === TOTAL_PLAYERS) {
                    broadcastNetworkData({ type: 'start-game', roomPlayers: roomPlayers });
                    setupFreshMatch();
                }
            } else if (data.type === 'move') {
                playerPieces[data.player] = data.coordinates;
                broadcastNetworkData(data, assignedRole);
                evaluateTurnShiftOffline(false);
            } else if (data.type === 'wall') {
                if(data.wallType === 'h') hWalls[data.r][data.c] = data.color;
                else vWalls[data.r][data.c] = data.color;
                broadcastNetworkData(data, assignedRole);
                evaluateTurnShiftOffline(false);
            }
        });
    });
}

function disconnectPeer() {
    if(peerNode) peerNode.destroy(); 
    networkConnections = {};
    hostConnection = null;
    showScreen('menu-screen');
}

function setupFreshMatch() {
    if (TOTAL_PLAYERS === 4) {
        turnOrder = ['p1', 'p2', 'p3', 'p4'];
        playerPieces = {
            p1: { r: 10, c: 5 }, // Red Bottom
            p2: { r: 0, c: 5 },  // Blue Top
            p3: { r: 5, c: 0 },  // Green Left
            p4: { r: 5, c: 10 }  // Yellow Right
        };
    } else {
        turnOrder = ['p1', 'p2'];
        playerPieces = {
            p1: { r: GRID_SIZE - 1, c: Math.floor(GRID_SIZE / 2) },
            p2: { r: 0, c: Math.floor(GRID_SIZE / 2) }
        };
    }

    if(gameMode === 'pass') {
        turnOrder.sort(() => Math.random() - 0.5);
    }

    activeTurn = turnOrder[0];

    hWalls = Array(GRID_SIZE - 1).fill(null).map(() => Array(GRID_SIZE).fill(null));
    vWalls = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE - 1).fill(null));

    showScreen('game-screen');
    renderEngine();
    triggerTimedRuleNotice(); 
    resetTurnTimer();
}

function triggerTimedRuleNotice() {
    const noticeBox = document.getElementById('match-startup-notice');
    const noticeText = document.getElementById('startup-notice-text');
    if(!noticeBox || !noticeText) return;

    let text = `${TOTAL_PLAYERS} PLAYERS ARENA LOADED.\n\n`;
    if(TOTAL_PLAYERS === 4) {
        text += "🔴 RED | 🔵 BLUE | 🟢 GREEN | 🟡 YELLOW\n🎯 FIRST TO REACH THE CENTER WINNING POINT WINS!\n\n";
    }
    text += "💥 MATRIX RECONFIGURED: INFINITE WALL DEPLOYMENT!";
    
    noticeText.innerText = text;
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
                if(gameMode === 'host') broadcastNetworkData({ type: 'timeout' });
                else hostConnection.send({ type: 'timeout' });
                triggerGameNotice("⚠️ TIME OUT! TURN SKIPPED");
                evaluateTurnShiftOffline(true);
            } else if (!isOnlineMatch) {
                triggerGameNotice("⚠️ TIME OUT! TURN SKIPPED");
                evaluateTurnShiftOffline(true);
            }
        }
    }, 1000);
}

function renderEngine() {
    const board = document.getElementById('game-board');
    if (!board) return; 
    board.innerHTML = '';

    // Perspective Rotation: Position active player at the bottom
    let rotDegree = 0;
    if (myRole === 'p2') rotDegree = 180;
    else if (myRole === 'p3') rotDegree = 90;
    else if (myRole === 'p4') rotDegree = 270;
    
    board.style.transform = `rotate(${rotDegree}deg)`;

    let totalGridColumns = (GRID_SIZE * 2) - 1;
    let totalGridRows = (GRID_SIZE * 2) - 1;

    let colTemplate = [];
    for (let i = 0; i < GRID_SIZE; i++) {
        colTemplate.push('1fr');
        if (i < GRID_SIZE - 1) colTemplate.push('12px');
    }
    board.style.gridTemplateColumns = colTemplate.join(' ');
    board.style.gridTemplateRows = colTemplate.join(' ');

    let centerPos = Math.floor(GRID_SIZE / 2);

    for (let r = 0; r < totalGridRows; r++) {
        for (let c = 0; c < totalGridColumns; c++) {
            let isCellRow = (r % 2 === 0);
            let isCellCol = (c % 2 === 0);

            let cellR = Math.floor(r / 2);
            let cellC = Math.floor(c / 2);

            if (isCellRow && isCellCol) {
                let cell = document.createElement('div');
                cell.className = 'cell'; 
                cell.id = `cell-${cellR}-${cellC}`;

                if (TOTAL_PLAYERS === 4) {
                    if (cellR === centerPos && cellC === centerPos) {
                        cell.classList.add('glow-center');
                    }
                } else {
                    if (cellR === 0) cell.classList.add('glow-top');
                    if (cellR === GRID_SIZE - 1) cell.classList.add('glow-bottom');
                }

                cell.onclick = () => handleCellClick(cellR, cellC);

                for (let pKey in playerPieces) {
                    if (playerPieces[pKey].r === cellR && playerPieces[pKey].c === cellC) {
                        let piece = document.createElement('div');
                        piece.className = 'game-piece'; 
                        piece.style.backgroundColor = PLAYER_COLORS[pKey];
                        // Counter-rotate piece to remain upright visually
                        piece.style.transform = `rotate(-${rotDegree}deg)`;
                        cell.appendChild(piece);
                    }
                }
                board.appendChild(cell);
            } 
            else if (isCellRow && !isCellCol) {
                let wallR = cellR;
                let wallC = cellC; 
                let line = document.createElement('div');
                line.className = 'grid-line vertical';

                if (vWalls[wallR] && vWalls[wallR][wallC] !== null) {
                    line.style.backgroundColor = vWalls[wallR][wallC];
                    line.style.boxShadow = `0 0 8px ${vWalls[wallR][wallC]}`;
                    line.classList.add('placed-wall');
                } else {
                    line.onclick = () => handleWallClick('v', wallR, wallC);
                }
                board.appendChild(line);
            } 
            else if (!isCellRow && isCellCol) {
                let wallR = cellR; 
                let wallC = cellC;
                let line = document.createElement('div');
                line.className = 'grid-line horizontal';

                if (hWalls[wallR] && hWalls[wallR][wallC] !== null) {
                    line.style.backgroundColor = hWalls[wallR][wallC];
                    line.style.boxShadow = `0 0 8px ${hWalls[wallR][wallC]}`;
                    line.classList.add('placed-wall');
                } else {
                    line.onclick = () => handleWallClick('h', wallR, wallC);
                }
                board.appendChild(line);
            } 
            else {
                let inter = document.createElement('div');
                inter.className = 'grid-line intersection';
                board.appendChild(inter);
            }
        }
    }
    updateHeaderIndicator();
}

function handleCellClick(r, c) {
    if ((gameMode === 'host' || gameMode === 'client') && activeTurn !== myRole) return;
    if (gameMode === 'ai' && activeTurn !== 'p1') return;

    if (isLegalMoveTarget(activeTurn, r, c)) {
        processPieceMovement(r, c);
    }
}

function handleWallClick(type, r, c) {
    if ((gameMode === 'host' || gameMode === 'client') && activeTurn !== myRole) return;
    if (gameMode === 'ai' && activeTurn !== 'p1') return;

    commitDirectWall(type, r, c);
}

function isLegalMoveTarget(turn, tarR, tarC) {
    let loc = playerPieces[turn];
    if (!loc) return false;

    let dr = tarR - loc.r; 
    let dc = tarC - loc.c;
    let absDr = Math.abs(dr); 
    let absDc = Math.abs(dc);

    if ((absDr === 1 && dc === 0) || (dr === 0 && absDc === 1)) {
        if (isWallBlocking(loc.r, loc.c, tarR, tarC)) return false;
        for (let pKey in playerPieces) {
            if (pKey !== turn && playerPieces[pKey].r === tarR && playerPieces[pKey].c === tarC) return false;
        }
        return true;
    }

    if ((absDr === 2 && dc === 0) || (dr === 0 && absDc === 2)) {
        let midR = loc.r + (dr / 2);
        let midC = loc.c + (dc / 2);
        let oppPresent = false;
        for (let pKey in playerPieces) {
            if (pKey !== turn && playerPieces[pKey].r === midR && playerPieces[pKey].c === midC) {
                oppPresent = true;
                break;
            }
        }
        if (oppPresent) {
            if (isWallBlocking(loc.r, loc.c, midR, midC) || isWallBlocking(midR, midC, tarR, tarC)) return false;
            return true;
        }
    }
    return false;
}

function commitDirectWall(type, r, c) {
    if (type === 'h' && hWalls[r][c] !== null) return;
    if (type === 'v' && vWalls[r][c] !== null) return;

    let activeColor = PLAYER_COLORS[activeTurn];
    if (type === 'h') hWalls[r][c] = activeColor; 
    else vWalls[r][c] = activeColor;

    for (let pKey in playerPieces) {
        if (!hasValidPathForPlayer(pKey)) {
            if (type === 'h') hWalls[r][c] = null; 
            else vWalls[r][c] = null;
            triggerGameNotice("⚠️ PATH LOCKOUT REJECTED!");
            renderEngine();
            return;
        }
    }

    if (gameMode === 'host') {
        broadcastNetworkData({ type: 'wall', wallType: type, r: r, c: c, color: activeColor, player: activeTurn });
    } else if (gameMode === 'client') {
        hostConnection.send({ type: 'wall', wallType: type, r: r, c: c, color: activeColor, player: activeTurn });
    }

    evaluateTurnShiftOffline(true);
}

function updateHeaderIndicator() {
    const bottomBanner = document.getElementById('bottom-turn-banner');
    const identityTag = document.getElementById('identity-tag');
    if (!bottomBanner) return;

    let turnName = roomPlayers[activeTurn] || PLAYER_NAMES_DEFAULT[activeTurn];
    let currentColor = PLAYER_COLORS[activeTurn];

    identityTag.innerText = `YOU: ${roomPlayers[myRole] || myRole.toUpperCase()}`;
    identityTag.style.borderColor = PLAYER_COLORS[myRole];
    identityTag.style.color = PLAYER_COLORS[myRole];

    let isMyTurn = (gameMode === 'pass') || (gameMode === 'ai' && activeTurn === 'p1') || (gameMode !== 'pass' && gameMode !== 'ai' && activeTurn === myRole);

    if (isMyTurn) {
        bottomBanner.classList.add('pulse-active');
        bottomBanner.innerText = `YOUR TURN (${turnName}) ! PLACE WALL OR MOVE`;
    } else {
        bottomBanner.classList.remove('pulse-active');
        if (gameMode === 'ai') {
            bottomBanner.innerText = `🤖 ${turnName} (BOT) CALCULATION...`;
        } else {
            bottomBanner.innerText = `WAITING FOR ${turnName}...`;
        }
    }

    bottomBanner.style.borderColor = currentColor;
    bottomBanner.style.background = '#0c1626';
}

function isWallBlocking(r1, c1, r2, c2) {
    if (r1 === r2) { 
        let minC = Math.min(c1, c2); 
        if (vWalls[r1] && vWalls[r1][minC] !== null) return true; 
    }
    if (c1 === c2) { 
        let minR = Math.min(r1, r2); 
        if (hWalls[minR] && hWalls[minR][c1] !== null) return true; 
    }
    return false;
}

function getShortestPathDistance(pKey, startPos) {
    let visited = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
    let queue = [{r: startPos.r, c: startPos.c, dist: 0}];
    visited[startPos.r][startPos.c] = true;

    while(queue.length > 0) {
        let curr = queue.shift();
        
        if (isPlayerAtGoal(pKey, curr.r, curr.c)) return curr.dist;

        let directions = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for(let d of directions) {
            let nr = curr.r + d.r; 
            let nc = curr.c + d.c;
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

function isPlayerAtGoal(pKey, r, c) {
    if (TOTAL_PLAYERS === 4) {
        let centerPos = Math.floor(GRID_SIZE / 2);
        return r === centerPos && c === centerPos;
    } else {
        if (pKey === 'p1') return r === 0;
        if (pKey === 'p2') return r === GRID_SIZE - 1;
        if (pKey === 'p3') return c === GRID_SIZE - 1;
        if (pKey === 'p4') return c === 0;
    }
    return false;
}

function hasValidPathForPlayer(pKey) { 
    return getShortestPathDistance(pKey, playerPieces[pKey]) !== Infinity; 
}

function processPieceMovement(tarR, tarC) {
    playerPieces[activeTurn] = { r: tarR, c: tarC };
    
    if (gameMode === 'host') {
        broadcastNetworkData({ type: 'move', player: activeTurn, coordinates: playerPieces[activeTurn] });
    } else if (gameMode === 'client') {
        hostConnection.send({ type: 'move', player: activeTurn, coordinates: playerPieces[activeTurn] });
    }

    evaluateTurnShiftOffline(true);
}

function paintBoardOnVictory(winnerColor) {
    document.querySelectorAll('.cell').forEach(cell => { cell.style.backgroundColor = winnerColor; });
}

function evaluateTurnShiftOffline(shouldTriggerAI = true) {
    for (let pKey in playerPieces) {
        if (isPlayerAtGoal(pKey, playerPieces[pKey].r, playerPieces[pKey].c)) {
            clearInterval(turnTimer); 
            paintBoardOnVictory(PLAYER_COLORS[pKey]); 
            setTimeout(() => { launchVictorySequence(pKey); }, 400); 
            return;
        }
    }

    let currentIndex = turnOrder.indexOf(activeTurn);
    let nextIndex = (currentIndex + 1) % turnOrder.length;
    activeTurn = turnOrder[nextIndex];

    resetTurnTimer(); 
    renderEngine();
    
    if(gameMode === 'ai' && activeTurn !== 'p1' && shouldTriggerAI) { 
        setTimeout(executeAdvancedEngineAI, 450); 
    }
}

function launchVictorySequence(winningRole) {
    clearInterval(turnTimer);
    const titleHeader = document.getElementById('victory-header-status');
    const subtitleText = document.getElementById('winner-declaration-text');
    const shareBtn = document.getElementById('share-results-btn');
    const cardBox = document.getElementById('victory-card-box');

    let localPlayerWon = (gameMode === 'pass') || (gameMode === 'ai' && winningRole === 'p1') || (gameMode !== 'pass' && gameMode !== 'ai' && myRole === winningRole);

    let winnerName = roomPlayers[winningRole] || PLAYER_NAMES_DEFAULT[winningRole];
    let winColor = PLAYER_COLORS[winningRole];

    if (localPlayerWon) {
        titleHeader.innerText = "VICTORY!"; 
        titleHeader.style.color = winColor; 
        cardBox.style.borderColor = winColor; 
        shareBtn.style.display = "inline-block";
        
        subtitleText.innerText = `CONGRATULATIONS ${winnerName}! YOU DOMINATED THE ARENA!`; 
        subtitleText.style.color = winColor; 
        showScreen('victory-screen'); 
        startCelebrationCanvas(); 
    } else {
        titleHeader.innerText = "DEFEAT!"; 
        titleHeader.style.color = "#ff5252"; 
        cardBox.style.borderColor = "#ff5252"; 
        shareBtn.style.display = "none"; 
        
        subtitleText.innerText = `${winnerName} WON THE MATCH! BETTER LUCK NEXT TIME!`; 
        subtitleText.style.color = "#ff5252"; 
        showScreen('victory-screen'); 
        stopCelebrationCanvas(); 
    }
}

function enumerateWallCandidates() {
    let candidates = [];
    for (let r = 0; r < GRID_SIZE - 1; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (hWalls[r] && hWalls[r][c] === null) candidates.push({ type: 'h', r, c });
        }
    }
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE - 1; c++) {
            if (vWalls[r] && vWalls[r][c] === null) candidates.push({ type: 'v', r, c });
        }
    }
    return candidates;
}

// Highly Competitive BFS/A* Strategic AI Engine
function executeAdvancedEngineAI() {
    let botRole = activeTurn;
    let botLoc = playerPieces[botRole];
    if (!botLoc) return;

    let myCurrentPathDist = getShortestPathDistance(botRole, botLoc);

    // Identify primary opponent (closest to winning goal)
    let primaryOpponent = null;
    let minOppDist = Infinity;
    for (let pKey in playerPieces) {
        if (pKey !== botRole) {
            let dist = getShortestPathDistance(pKey, playerPieces[pKey]);
            if (dist < minOppDist) {
                minOppDist = dist;
                primaryOpponent = pKey;
            }
        }
    }

    let bestWallChoice = null;
    let maxOpponentDelay = 0;

    // Strategic wall placement check (if opponent is near or difficulty is set high)
    if (primaryOpponent && (minOppDist <= 5 || aiDifficulty === 'god' || aiDifficulty === 'hacker')) {
        let walls = enumerateWallCandidates();
        // Sample candidate walls for efficiency
        let sampledWalls = walls.sort(() => 0.5 - Math.random()).slice(0, 35);

        for (let wall of sampledWalls) {
            if (wall.type === 'h') hWalls[wall.r][wall.c] = PLAYER_COLORS[botRole];
            else vWalls[wall.r][wall.c] = PLAYER_COLORS[botRole];

            let pathValid = true;
            for (let pKey in playerPieces) {
                if (!hasValidPathForPlayer(pKey)) {
                    pathValid = false;
                    break;
                }
            }

            if (pathValid) {
                let newOppDist = getShortestPathDistance(primaryOpponent, playerPieces[primaryOpponent]);
                let myNewDist = getShortestPathDistance(botRole, botLoc);
                let delay = newOppDist - minOppDist;
                let penalty = myNewDist - myCurrentPathDist;

                if (delay > 0 && penalty <= 0 && delay > maxOpponentDelay) {
                    maxOpponentDelay = delay;
                    bestWallChoice = wall;
                }
            }

            // Revert candidate wall
            if (wall.type === 'h') hWalls[wall.r][wall.c] = null;
            else vWalls[wall.r][wall.c] = null;
        }
    }

    // Execute wall placement if optimal trap/block found
    if (bestWallChoice && maxOpponentDelay > 0) {
        if (bestWallChoice.type === 'h') hWalls[bestWallChoice.r][bestWallChoice.c] = PLAYER_COLORS[botRole];
        else vWalls[bestWallChoice.r][bestWallChoice.c] = PLAYER_COLORS[botRole];
        evaluateTurnShiftOffline(true);
        return;
    }

    // Otherwise, move piece along the shortest path towards goal
    let legalMoves = [];
    let dirs = [{r:-1, c:0}, {r:1, c:0}, {r:0, c:-1}, {r:0, c:1}];
    for (let d of dirs) {
        let nr = botLoc.r + d.r;
        let nc = botLoc.c + d.c;
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
            if (isLegalMoveTarget(botRole, nr, nc)) {
                legalMoves.push({ r: nr, c: nc });
            }
        }
    }

    if (legalMoves.length > 0) {
        legalMoves.sort((a, b) => getShortestPathDistance(botRole, a) - getShortestPathDistance(botRole, b));
        playerPieces[botRole] = legalMoves[0];
    } else {
        // Fallback random wall placement if trapped/no legal moves
        let walls = enumerateWallCandidates();
        for (let wall of walls) {
            if (wall.type === 'h') hWalls[wall.r][wall.c] = PLAYER_COLORS[botRole];
            else vWalls[wall.r][wall.c] = PLAYER_COLORS[botRole];
            
            if (hasValidPathForPlayer(botRole)) break;
            
            if (wall.type === 'h') hWalls[wall.r][wall.c] = null;
            else vWalls[wall.r][wall.c] = null;
        }
    }

    evaluateTurnShiftOffline(true);
}

function startCelebrationCanvas() {
    stopCelebrationCanvas();
    const canvas = document.getElementById('firecracker-canvas'); const ctx = canvas.getContext('2d');
    if (!canvas) return;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = [];
    function spawnBurst() {
        let sx = Math.random() * canvas.width; let sy = Math.random() * (canvas.height * 0.5);
        let pallet = [PLAYER_COLORS.p1, PLAYER_COLORS.p2, PLAYER_COLORS.p3, PLAYER_COLORS.p4];
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
    disconnectPeer(); 
    stopCelebrationCanvas(); 
    showScreen('menu-screen'); 
}
