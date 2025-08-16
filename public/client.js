class RankingSystem {
    constructor() {
        this.players = [];
        this.updateInterval = 5000; // Atualiza a cada 5 segundos
        this.container = null;
        this.isMinimized = false;
        this.lastUpdate = 0; // Added for throttling
        this.throttleDelay = 1000; // Added for throttling
    }

    init() {
        if (!this.container) {
            this.createContainer();
        }
        this.requestRanking();
        setInterval(() => this.requestRanking(), this.updateInterval);
    }

    requestRanking() {
        const now = Date.now();
        if (now - this.lastUpdate < this.throttleDelay) return; // Throttling logic

        const socket = window.dinoClient?.ws?.();
        if (socket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({ type: 'get_ranking' }));
                this.lastUpdate = now; // Update last update time
            } catch (e) {
                console.error('Failed to send ranking request:', e);
            }
        }
    }

    updateRanking(data) {
        if (data && data.players && data.players.length > 0) {
            this.players = data.players.sort((a, b) => b.highScore - a.highScore);
            this.render();
        } else {
            if (this.container) {
                this.container.style.display = 'none';
            }
        }
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'ranking-container';
        this.applyContainerStyles();

        const toggleBtn = document.createElement('button');
        toggleBtn.innerHTML = '−';
        this.applyToggleButtonStyles(toggleBtn);

        toggleBtn.addEventListener('click', () => this.toggleMinimize());
        this.container.appendChild(toggleBtn);

        const content = document.createElement('div');
        content.className = 'ranking-content';
        this.container.appendChild(content);

        document.body.appendChild(this.container);
    }

    applyContainerStyles() {
        Object.assign(this.container.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '12px 18px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
            zIndex: '100',
            backdropFilter: 'blur(5px)',
            border: '1px solid #a8dadc',
            maxWidth: '200px',
            transition: 'all 0.3s ease'
        });
    }

    applyToggleButtonStyles(button) {
        Object.assign(button.style, {
            position: 'absolute',
            top: '2px',
            right: '5px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '0 5px'
        });
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        const content = this.container.querySelector('.ranking-content');
        const toggleBtn = this.container.querySelector('button');

        if (this.isMinimized) {
            content.style.display = 'none';
            toggleBtn.innerHTML = '+';
            this.container.style.padding = '12px 30px 12px 18px';
        } else {
            content.style.display = 'block';
            toggleBtn.innerHTML = '−';
            this.container.style.padding = '12px 18px';
            this.render();
        }
    }

    render() {
        if (!this.container) return;

        const content = this.container.querySelector('.ranking-content');
        if (!content) return;

        const fragment = document.createDocumentFragment(); // Use DocumentFragment
        const topPlayers = this.players.slice(0, 5);

        const title = document.createElement('h3');
        title.style.cssText = 'margin: 0 0 10px 0; font-size: 16px; color: #4361ee;';
        title.textContent = 'Ranking';
        fragment.appendChild(title);

        const ol = document.createElement('ol');
        ol.style.cssText = 'margin: 0; padding-left: 20px;';

        topPlayers.forEach((player, index) => {
            const li = document.createElement('li');
            li.style.cssText = `
                margin-bottom: 5px;
                display: flex;
                justify-content: space-between;
                ${index === 0 ? 'color: #FFD700; font-weight: bold;' : ''}
                ${index === 1 ? 'color: #C0C0C0;' : ''}
                ${index === 2 ? 'color: #CD7F32;' : ''}
            `;
            const playerNameSpan = document.createElement('span');
            playerNameSpan.className = 'player-name';
            playerNameSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;';
            playerNameSpan.textContent = `${index + 1}. ${player.name || 'Jogador'}`;
            li.appendChild(playerNameSpan);

            const playerScoreSpan = document.createElement('span');
            playerScoreSpan.className = 'player-score';
            playerScoreSpan.style.cssText = 'font-weight: bold;';
            playerScoreSpan.textContent = player.highScore || 0;
            li.appendChild(playerScoreSpan);

            ol.appendChild(li);
        });

        fragment.appendChild(ol);
        content.innerHTML = ''; // Clear existing content
        content.appendChild(fragment); // Append fragment
    }
}

(function(){
    window.allScriptsLoadedHandled = false;
    // Adicione esta função no início do client.js para verificar dependências
    function checkGameDependencies() {
        const requiredClasses = ['GameRenderer', 'Runner', 'VisualEffects', 'SpectatorMode'];
        const missing = requiredClasses.filter(cls => !window[cls]);

        if (missing.length > 0) {
            console.error('Missing required classes:', missing);
            return false;
        }
        return true;
    }
    
    const MAX_RECONNECT_ATTEMPTS = 10;
    const INPUT_DEBOUNCE_MS = 10; // Reduced debounce to 10ms

    const DOM_SELECTORS = {
        LOGIN_SCREEN: 'login-screen',
        GAME_CONTAINER: 'game-container',
        LOGIN_ERROR: 'loginError',
        PLAYER_INFO: 'player-info',
        WAITING_BANNER: 'waiting-banner',
        LOGIN_BTN: 'loginBtn',
        SPECTATOR_BTN: 'spectatorBtn',
        GAME_CANVAS: 'gameCanvas' // Assuming a canvas with this ID will be created by Runner
    };

    const state = {
        ws: null,
        myJwt: null,
        myTokenId: null,
        activePlayerToken: null,
        loggedIn: false,
        reconnectAttempts: 0,
        lastInputTime: 0,
        isSpectator: false // New state to track spectator mode
    };

    let spectatorMode = null; // Instance of SpectatorMode
    let visualEffects = null; // Instance of VisualEffects

    function $(id) { return document.getElementById(id); }

    function showElement(id, display = 'block') {
        const el = $(id);
        if (el) el.style.display = display;
    }

    function hideElement(id) {
        const el = $(id);
        if (el) el.style.display = 'none';
    }

    function connect(jwtToken) {
    try {
        // Fecha conexão existente
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.close();
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        console.log(`🔄 Conectando ao servidor em ${wsProtocol}://${window.location.host}...`);
        
        state.ws = new WebSocket(`${wsProtocol}://${window.location.host}`);
        state.ws.binaryType = 'arraybuffer';

        // Adiciona timeout para conexão
        const connectionTimeout = setTimeout(() => {
            if (state.ws.readyState !== WebSocket.OPEN) {
                console.warn('Tempo limite de conexão excedido');
                state.ws.close();
                handleConnectionError();
            }
        }, 10000); // 10 segundos de timeout

        state.ws.addEventListener('open', () => {
            clearTimeout(connectionTimeout);
            console.log('✅ WebSocket conectado com sucesso');
            state.reconnectAttempts = 0;
            state.myJwt = jwtToken;

            const loginMsg = {
                type: 'login',
                jwt: jwtToken,
                clientTime: Date.now(),
                resolution: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    dpr: window.devicePixelRatio || 1
                }
            };

            try {
                state.ws.send(JSON.stringify(loginMsg));
            } catch (e) {
                console.error('Failed to send login message:', e);
                handleConnectionError();
            }

            // Adicione esta verificação
            setTimeout(() => {
                console.log('Login timeout check: state.loggedIn =', state.loggedIn); // Added log
                if (!state.loggedIn) {
                    console.warn('Nenhuma resposta de login do servidor');
                    handleConnectionError();
                }
            }, 5000); // Timeout de 5 segundos para resposta do servidor
        });

        // Add ping/pong to keep connection alive
        let pingInterval;
        state.ws.addEventListener('open', () => {
            pingInterval = setInterval(() => {
                if (state.ws.readyState === WebSocket.OPEN) {
                    try {
                        state.ws.send(JSON.stringify({ type: 'ping' }));
                    } catch (e) {
                        console.error('Ping failed', e);
                        clearInterval(pingInterval);
                    }
                }
            }, 30000); // Send ping every 30 seconds
        });

        state.ws.addEventListener('close', () => {
            clearInterval(pingInterval);
            console.log('WebSocket disconnected.');
            if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                state.reconnectAttempts++;
                const timeout = Math.min(state.reconnectAttempts * 2000, 30000); // Max 30s delay
                console.log(`Reconnecting in ${timeout / 1000}s...`);
                setTimeout(() => connect(state.myJwt), timeout);
            } else {
                console.error('Max reconnect attempts reached. Please refresh the page.');
                showElement(DOM_SELECTORS.LOGIN_SCREEN, 'flex');
                hideElement(DOM_SELECTORS.GAME_CONTAINER);
            }
        });

        state.ws.addEventListener('error', (err) => {
            console.error('WebSocket error:', err);
        });
    } catch (error) {
        console.error('Erro na conexão WebSocket:', error);
        handleConnectionError();
    }
}

function handleConnectionError() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.innerHTML = `
            <div style="color: white; text-align: center;">
                <h2>Erro de conexão</h2>
                <p>Não foi possível conectar ao servidor</p>
                <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
                    Tentar Novamente
                </button>
            </div>
        `;
    }
}

    function handleMsg(msg) {
        // No início da função handleMsg()
        console.log('Mensagem recebida do servidor:', msg);
        try {
            if (typeof msg !== 'object') {
                console.warn('Received non-object message:', msg);
                return;
            }

            switch(msg.type) {
                case 'loginResult':
                    console.log('Received loginResult:', msg); // Added log
                    handleLoginResult(msg);
                    break;
                case 'activePlayerChange':
                    state.activePlayerToken = msg.activePlayerToken;
                    updateControlState();
                    break;
                case 'gameState':
                    handleGameState(msg.state);
                    break;
                case 'rankingUpdate':
                    if (window.rankingSystem) {
                        window.rankingSystem.updateRanking(msg);
                    }
                    break;
                case 'queueUpdate':
                    handleQueueUpdate(msg);
                    break;
                default:
                    console.log('Received unknown message type:', msg.type);
            }
        } catch (e) {
            console.error('Error handling message:', e, 'Message:', msg);
        }
    }

    // Modifique a função handleLoginResult para garantir a inicialização correta
    function handleLoginResult(msg) {
        // Na função handleLoginResult()
        console.log('Resultado do login:', msg);
        if (!msg.success) {
            showElement(DOM_SELECTORS.LOGIN_ERROR);
            localStorage.removeItem('dinoUserToken');
            state.myJwt = null;
            showElement(DOM_SELECTORS.LOGIN_SCREEN, 'flex');
            return;
        }
        
        // Verificar dependências antes de continuar
        if (!checkGameDependencies()) {
            console.error('Game dependencies not met, retrying...');
            setTimeout(() => handleLoginResult(msg), 500);
            return;
        }

        state.loggedIn = true;
        state.myTokenId = msg.tokenId || null;
        state.activePlayerToken = msg.activePlayerToken || null;
        localStorage.setItem('dinoUserToken', state.myJwt);
        hideElement(DOM_SELECTORS.LOGIN_SCREEN);
        showElement(DOM_SELECTORS.GAME_CONTAINER);

        // Inicialização robusta do jogo
        const initializeGameWithRetry = (attempt = 0) => {
            try {
                if (state.myTokenId === state.activePlayerToken) {
                    initializeGame(false);
                } else {
                    initializeSpectatorMode();
                }
                updateControlState();
            } catch (e) {
                console.error('Game initialization failed, attempt', attempt, e);
                if (attempt < 3) {
                    setTimeout(() => initializeGameWithRetry(attempt + 1), 1000 * (attempt + 1));
                } else {
                    console.error('Max initialization attempts reached');
                    // Mostrar mensagem de erro ao usuário
                    showElement(DOM_SELECTORS.LOGIN_SCREEN, 'flex');
                    hideElement(DOM_SELECTORS.GAME_CONTAINER);
                }
            }
        };

        setTimeout(() => initializeGameWithRetry(), 100);
    }

    function handleGameState(state) {
        if (state.isSpectator && spectatorMode) {
            spectatorMode.renderGameState(state);
        } else if (window.gameRunner) {
            window.gameRunner.renderState(state);
        }
        if (state.crashed && window.visualEffects) { // Use window.visualEffects
            window.visualEffects.addCrashEffect(state.tRex.x, state.tRex.y); // Pass tRex position for effects
        }
    }

    function handleQueueUpdate(msg) {
        const queueInfo = document.getElementById('queue-info');
        const queuePosition = document.getElementById('queue-position');
        const queueTotal = document.getElementById('queue-total');

        if (msg.inQueue) {
            queueInfo.style.display = 'block';
            queuePosition.textContent = msg.position;
            queueTotal.textContent = msg.total;
        } else {
            queueInfo.style.display = 'none';
        }
    }

    // Modifique a função initializeGame para ser mais robusta
    function initializeGame(isActiveGame) {
        if (typeof window.Runner === 'undefined') {
            console.error('Runner is not defined yet');
            throw new Error('Runner not available');
        }

        if (!window.gameRunner) {
            const gameContainer = $(DOM_SELECTORS.GAME_CONTAINER);
            if (!gameContainer) {
                throw new Error('Game container not found');
            }

            let canvasElement = gameContainer.querySelector('canvas');
            if (!canvasElement) {
                canvasElement = document.createElement('canvas');
                canvasElement.id = DOM_SELECTORS.GAME_CANVAS;
                gameContainer.appendChild(canvasElement);
            }
            
            try {
                window.gameRunner = new window.Runner(`#${DOM_SELECTORS.GAME_CONTAINER}`);
                console.log('Game runner initialized successfully');
                
                // Inicializar efeitos visuais
                if (typeof window.VisualEffects !== 'undefined') {
                    visualEffects = new window.VisualEffects(canvasElement);
                    window.visualEffects = visualEffects; // Disponibiliza globalmente
                } else {
                    console.warn('VisualEffects not available');
                }
            } catch (e) {
                console.error('Failed to initialize game runner:', e);
                throw e;
            }
        }
    }

    function initializeSpectatorMode() {
        if (!spectatorMode) {
            const gameContainer = $(DOM_SELECTORS.GAME_CONTAINER);
            let canvasElement = gameContainer.querySelector('canvas');
            if (!canvasElement) {
                canvasElement = document.createElement('canvas');
                canvasElement.id = DOM_SELECTORS.GAME_CANVAS;
                gameContainer.appendChild(canvasElement);
            }
            spectatorMode = new window.SpectatorMode(canvasElement, false, 'Spectator'); // Use window.SpectatorMode
            visualEffects = new window.VisualEffects(canvasElement); // Use window.VisualEffects
        }
    }

    function updateControlState() {
        const isControlling = state.myTokenId && state.activePlayerToken && state.myTokenId === state.activePlayerToken;

        // Always disable first to prevent duplicate listeners
        disableLocalControl();

        if (isControlling) {
            enableLocalControl();
            showElement(DOM_SELECTORS.PLAYER_INFO);
            hideElement(DOM_SELECTORS.WAITING_BANNER);
            state.isSpectator = false;
            
            // Notify server that client is ready
            const socket = state.ws;
            if (socket && socket.readyState === WebSocket.OPEN) {
                try {
                    socket.send(JSON.stringify({ type: 'clientReady' }));
                } catch (e) {
                    console.error('Failed to send clientReady:', e);
                }
            }
        } else {
            hideElement(DOM_SELECTORS.PLAYER_INFO);
            showElement(DOM_SELECTORS.WAITING_BANNER);
            state.isSpectator = true;
        }
    }

    function sendInput(cmd, action) {
        const now = Date.now();
        if (now - state.lastInputTime < INPUT_DEBOUNCE_MS) {
            return; // Debounce
        }
        state.lastInputTime = now;

        const socket = state.ws;
        if (socket && socket.readyState === WebSocket.OPEN && state.loggedIn && state.myTokenId === state.activePlayerToken) {
            try {
                socket.send(JSON.stringify({ type: 'input', cmd, action }));
            } catch (e) {
                console.error('Failed to send input:', e);
            }
        }
    }

    function localKeyHandler(e) {
        e.preventDefault();
        if ([32, 38].includes(e.keyCode)) { // Space or Up Arrow
            sendInput('jump', 'keydown');
        } else if (e.keyCode === 40) { // Down Arrow
            sendInput('duck', 'keydown');
        }
    }

    function localKeyUpHandler(e) {
        if (e.keyCode === 40) { // Down Arrow
            sendInput('duck', 'keyup');
        }
    }

    function enableLocalControl(){
        document.addEventListener('keydown', localKeyHandler);
        document.addEventListener('keyup', localKeyUpHandler);
    }

    function disableLocalControl(){
        document.removeEventListener('keydown', localKeyHandler);
        document.removeEventListener('keyup', localKeyUpHandler);
    }

    let lastFrameTime = 0;
    function gameLoop(currentTime) {
        if (!lastFrameTime) lastFrameTime = currentTime;
        const deltaTime = currentTime - lastFrameTime;
        lastFrameTime = currentTime;

        if (window.visualEffects) { // Use window.visualEffects
            window.visualEffects.update(deltaTime);
        }

        // Render visual effects after game state is rendered
        if (window.visualEffects && (window.gameRunner || spectatorMode)) { // Use window.visualEffects
            window.visualEffects.render();
        }

        requestAnimationFrame(gameLoop);
    }

    // Substitua o window.addEventListener('load', ...) por:
window.addEventListener('allScriptsLoaded', () => {
    if (window.allScriptsLoadedHandled) return;
    window.allScriptsLoadedHandled = true;
    
    console.log('✅ EVENTO allScriptsLoaded RECEBIDO - INICIANDO JOGO');
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        const storedToken = localStorage.getItem('dinoUserToken');
        const tokenToUse = urlToken || storedToken;

        if (tokenToUse) {
            console.log('🔑 Token encontrado. Token a usar:', tokenToUse);
            connect(tokenToUse);
            
            // Esconder tela de login e mostrar jogo
            hideElement(DOM_SELECTORS.LOGIN_SCREEN);
            showElement(DOM_SELECTORS.GAME_CONTAINER);
            
            // Inicializar ranking system
            try {
                window.rankingSystem = new RankingSystem();
                window.rankingSystem.init();
            } catch (e) {
                console.error('Failed to initialize ranking system:', e);
            }

            requestAnimationFrame(gameLoop);
        } 
        else {
            console.log('👀 Mostrando tela de login');
            showElement(DOM_SELECTORS.LOGIN_SCREEN, 'flex');
        }
    } catch (error) {
        console.error('Erro na inicialização do jogo:', error);
        showElement(DOM_SELECTORS.LOGIN_SCREEN, 'flex');
        hideElement(DOM_SELECTORS.GAME_CONTAINER);
        
        const loader = document.getElementById('loader');
        if (loader) {
            loader.innerHTML = `
                <div style="color: white; text-align: center;">
                    <h2>Erro na inicialização</h2>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
                        Tentar Novamente
                    </button>
                </div>
            `;
        }
    }
})();