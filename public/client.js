class RankingSystem {
    constructor() {
        this.players = [];
        this.updateInterval = 5000; // Atualiza a cada 5 segundos
        this.container = null;
        this.isMinimized = false;
    }
    
    init() {
        if (!this.container) {
            this.createContainer();
        }
        this.requestRanking();
        setInterval(() => this.requestRanking(), this.updateInterval);
    }
    
    requestRanking() {
        const socket = window.dinoClient?.ws?.();
        if (socket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({ type: 'get_ranking' }));
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
        
        const topPlayers = this.players.slice(0, 5);
        
        content.innerHTML = `
            <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #4361ee;">Ranking</h3>
            <ol style="margin: 0; padding-left: 20px;">
                ${topPlayers.map((player, index) => `
                    <li style="margin-bottom: 5px; display: flex; justify-content: space-between;
                        ${index === 0 ? 'color: #FFD700; font-weight: bold;' : ''}
                        ${index === 1 ? 'color: #C0C0C0;' : ''}
                        ${index === 2 ? 'color: #CD7F32;' : ''}">
                        <span class="player-name" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;">
                            ${index + 1}. ${player.name || 'Jogador'}
                        </span>
                        <span class="player-score" style="font-weight: bold;">${player.highScore || 0}</span>
                    </li>
                `).join('')}
            </ol>
        `;
    }
}

(function(){
    const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const INPUT_DEBOUNCE_MS = 50; // 20 inputs per second max

    const DOM_SELECTORS = {
        LOGIN_SCREEN: 'login-screen',
        GAME_CONTAINER: 'game-container',
        LOGIN_ERROR: 'loginError',
        PLAYER_INFO: 'player-info',
        WAITING_BANNER: 'waiting-banner',
        LOGIN_BTN: 'loginBtn',
        SPECTATOR_BTN: 'spectatorBtn'
    };

    const state = {
        ws: null,
        myJwt: null,
        myTokenId: null,
        activePlayerToken: null,
        loggedIn: false,
        reconnectAttempts: 0,
        lastInputTime: 0
    };

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
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.close();
    }

    state.ws = new WebSocket(WS_URL);
    state.ws.binaryType = 'arraybuffer'; // Para comunicação mais eficiente

    state.ws.addEventListener('open', () => {
        console.log('WebSocket connected');
        state.reconnectAttempts = 0;
        state.myJwt = jwtToken;
        
        // Envia o token de forma mais robusta
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
            setTimeout(() => connect(jwtToken), 1000);
        }
    });
        
        state.ws.addEventListener('message', (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                handleMsg(msg);
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        });
        
        state.ws.addEventListener('close', () => {
            console.log('WebSocket disconnected.');
            if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                state.reconnectAttempts++;
                const timeout = state.reconnectAttempts * 2000;
                console.log(`Reconnecting in ${timeout / 1000}s...`);
                setTimeout(() => connect(state.myJwt), timeout);
            } else {
                console.error('Max reconnect attempts reached.');
            }
        });
        
        state.ws.addEventListener('error', (err) => {
            console.error('WebSocket error:', err);
        });
    }

    function handleMsg(msg) {
        switch(msg.type) {
            case 'loginResult':
                if(!msg.success) { 
                    showElement(DOM_SELECTORS.LOGIN_ERROR);
                    localStorage.removeItem('dinoUserToken'); // Clear invalid token
                    state.myJwt = null; // Clear in-memory token
                    showElement(DOM_SELECTORS.LOGIN_SCREEN, 'flex'); // Show login screen
                    return; 
                }
                state.loggedIn = true;
                state.myTokenId = msg.tokenId || null;
                state.activePlayerToken = msg.activePlayerToken || null;
                localStorage.setItem('dinoUserToken', state.myJwt); // Save successful token
                hideElement(DOM_SELECTORS.LOGIN_SCREEN);
                showElement(DOM_SELECTORS.GAME_CONTAINER);
                if (!window.gameRunner) {
                    window.gameRunner = new Runner(`#${DOM_SELECTORS.GAME_CONTAINER}`);
                }
                updateControlState();
                break;

            case 'activePlayerChange':
                state.activePlayerToken = msg.activePlayerToken;
                updateControlState();
                break;

            case 'gameState':
                if (window.gameRunner) {
                    window.gameRunner.renderState(msg.state);
                }
                break;

            case 'rankingUpdate':
                if (window.rankingSystem) {
                    window.rankingSystem.updateRanking(msg);
                }
                break;
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
        } else {
            hideElement(DOM_SELECTORS.PLAYER_INFO);
            showElement(DOM_SELECTORS.WAITING_BANNER);
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

    window.addEventListener('load', ()=> {
        const storedToken = localStorage.getItem('dinoUserToken');
        const qTok = new URLSearchParams(location.search).get('token');

        if (storedToken) {
            connect(storedToken);
        } else if (qTok) {
            connect(qTok);
        } else {
            // If no token, directly show game container for spectator mode
            hideElement(DOM_SELECTORS.LOGIN_SCREEN);
            showElement(DOM_SELECTORS.GAME_CONTAINER);
            if (!window.gameRunner) {
                window.gameRunner = new Runner(`#${DOM_SELECTORS.GAME_CONTAINER}`);
            }
            // No token means no active player, so spectator mode by default
            updateControlState(); // This will show "Aguardando sua vez..."
        }

        const loginBtn = $(DOM_SELECTORS.LOGIN_BTN);
        if (loginBtn) {
            
        }

        // NOTE: Admin login via a hardcoded token on the client is insecure.
        // This has been removed. A secure admin authentication flow should be
        // implemented on the backend.

        window.rankingSystem = new RankingSystem();
        window.rankingSystem.init();
    });

    window.dinoClient = {
        ws: ()=> state.ws,
        isControlling: ()=> state.myTokenId && state.activePlayerToken && state.myTokenId === state.activePlayerToken,
        sendInput: sendInput // Expose the sendInput function
    };
})();