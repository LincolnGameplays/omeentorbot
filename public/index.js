const IS_HIDPI = window.devicePixelRatio > 1;

class Runner {
    constructor(containerId) {
        if (Runner.instance) return Runner.instance;
        Runner.instance = this;

        this.container = document.querySelector(containerId);
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // Novo sistema de buffer duplo para melhor performance
        this.doubleBuffer = {
            front: document.createElement('canvas'),
            back: document.createElement('canvas')
        };
        
        this.renderer = new GameRenderer(this.doubleBuffer.back); // Renderiza no buffer de trás

        // Otimização de animação
        this.animationFrameId = null;
        this.lastRenderTime = 0;
        this.targetFPS = 60;
        this.minFrameTime = 1000 / this.targetFPS;

        // Estado do jogo
        this.state = { tRex: {}, obstacles: [] }; // Estado atual renderizado
        this.predictedState = null; // Estado futuro previsto
        this.lastServerState = null; // Último estado autoritário do servidor
        this.serverUpdateTime = 0;

        this.isRunning = false;
        this.imageSprite = null;
        this.spriteDef = null;

        this.loadResources();
        this.setupEventListeners();
        this.resize();
    }

    loadResources() {
        this.imageSprite = new Image();
        const spriteId = IS_HIDPI ? 'offline-resources-light-2x' : 'offline-resources-light-1x';
        const localSprite = document.getElementById(spriteId);

        this.imageSprite.onload = () => {
            this.spriteDef = IS_HIDPI ? Runner.spriteDefinition.HDPI : Runner.spriteDefinition.LDPI;
            this.renderer.setResources(this.imageSprite, this.spriteDef);
            this.start();
        };
        this.imageSprite.onerror = () => {
            console.warn('Fallback to external sprite');
            this.imageSprite.src = IS_HIDPI ? 'https://raw.githubusercontent.com/wayou/t-rex-runner/master/assets/sprite-runner-2x.png' : 'https://raw.githubusercontent.com/wayou/t-rex-runner/master/assets/sprite-runner.png';
            this.start(); // Call start even on error fallback
        };

        if (localSprite && localSprite.src) {
            this.imageSprite.src = localSprite.src;
        } else {
            this.imageSprite.onerror();
        }
    }

    setupEventListeners() {
        // ... (event listeners de input)
    }

    resize() {
        const { width, height } = this.container.getBoundingClientRect();
        this.canvas.width = this.doubleBuffer.front.width = this.doubleBuffer.back.width = width;
        this.canvas.height = this.doubleBuffer.front.height = this.doubleBuffer.back.height = height;
        this.renderer.resize();
    }

    start() {
        this.isRunning = true;
        this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    predictState(currentTime) {
        if (!this.lastServerState) return;
        
        const timeSinceUpdate = currentTime - this.serverUpdateTime;
        if (timeSinceUpdate > 100) { // Só prediz se houver atraso significativo
            this.predictedState = JSON.parse(JSON.stringify(this.lastServerState));
            
            // Aplica física localmente
            if (this.predictedState.tRex.status === 'JUMPING') {
                this.predictedState.tRex.y += this.predictedState.tRex.jumpVelocity;
                this.predictedState.tRex.jumpVelocity += 0.8;
                
                if (this.predictedState.tRex.y >= 0) {
                    this.predictedState.tRex.y = 0;
                    this.predictedState.tRex.status = 'RUNNING';
                }
            }
            
            // Movimenta obstáculos
            this.predictedState.obstacles.forEach(obs => {
                obs.x -= this.predictedState.speed;
            });
            
            this.predictedState.groundX -= this.predictedState.speed;
            if (this.predictedState.groundX <= -this.canvas.width) {
                this.predictedState.groundX = 0;
            }
        }
    }

    gameLoop(timestamp = 0) {
        if (!this.isRunning) return;

        const deltaTime = timestamp - this.lastRenderTime;
        if (deltaTime < this.minFrameTime) {
            this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
            return;
        }
        this.lastRenderTime = timestamp;

        this.predictState(timestamp);

        const renderState = this.predictedState || this.state;
        this.renderToBuffer(renderState);
        this.swapBuffers();

        this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
    }

    renderToBuffer(state) {
        // Implementação otimizada de renderização
        this.renderer.clear();
        this.renderer.drawBackground();

        if (!this.spriteDef) return;

        // Desenha chão
        const groundWidth = this.spriteDef.HORIZON.width;
        const groundPatterns = Math.ceil(this.canvas.width / groundWidth) + 1;
        for (let i = 0; i < groundPatterns; i++) {
            this.renderer.drawGround(
                state.groundY,
                this.spriteDef.HORIZON,
                state.groundX + (i * groundWidth)
            );
        }

        // Desenha dinossauro
        const tRex = state.tRex;
        if (tRex) {
            const anim = Runner.animFrames[tRex.status];
            if (anim) {
                const animTime = Date.now() - (tRex.animStartTime || 0);
                const frameIndex = Math.floor(animTime / anim.msPerFrame) % anim.frames.length;
                const sourceX = anim.frames[frameIndex];
                const isDucking = tRex.status === 'DUCKING';
                const dinoWidth = isDucking ? Runner.trexConfig.WIDTH_DUCK : Runner.trexConfig.WIDTH;
                const dinoHeight = Runner.trexConfig.HEIGHT;
                const dinoY = state.groundY - dinoHeight - (tRex.y || 0);
                this.renderer.drawDino(tRex.x, dinoY, dinoWidth, dinoHeight, this.spriteDef.TREX, sourceX);
            }
        }

        // Desenha obstáculos
        if (state.obstacles) {
            state.obstacles.forEach(obs => {
                const obsY = state.groundY - obs.height;
                const sprite = this.spriteDef[obs.type];
                if (sprite) {
                    this.renderer.drawObstacle(obs.x, obsY, obs.width, obs.height, sprite);
                }
            });
        }

        // Desenha UI
        this.renderer.drawScore(Math.floor(state.score || 0));
        this.renderer.drawHighScore(Math.floor(state.highScore || 0));
        
        if (state.gameOver) {
            this.renderer.drawGameOver(Math.floor(state.score || 0));
        }
    }

    swapBuffers() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.doubleBuffer.back, 0, 0);
    }

    renderState(newState) {
        if (!newState) return;
        
        this.lastServerState = newState;
        this.serverUpdateTime = Date.now();
        
        if (this.predictedState) {
            const threshold = 50;
            const xDiff = Math.abs(this.predictedState.tRex.x - newState.tRex.x);
            if (xDiff > threshold) {
                this.predictedState = null;
            }
        }
        
        Object.assign(this.state, newState);
    }
}

Runner.spriteDefinition = {
    LDPI: {
        HORIZON: { x: 2, y: 54, width: 600, height: 12 },
        TREX: { x: 848, y: 2, width: 44, height: 47 },
        CACTUS_SMALL: { x: 228, y: 2, width: 17, height: 35 },
        CACTUS_LARGE: { x: 332, y: 2, width: 25, height: 50 },
        PTERODACTYL: { x: 134, y: 2, width: 46, height: 40 },
        TEXT_SPRITE: { x: 655, y: 2, width: 190, height: 11 },
        RESTART: { x: 2, y: 2, width: 36, height: 32 }
    },
    HDPI: {
        HORIZON: { x: 2, y: 54, width: 1200, height: 24 },
        TREX: { x: 1678, y: 2, width: 88, height: 94 },
        CACTUS_SMALL: { x: 456, y: 2, width: 34, height: 70 },
        CACTUS_LARGE: { x: 664, y: 2, width: 50, height: 100 },
        PTERODACTYL: { x: 268, y: 2, width: 92, height: 80 },
        TEXT_SPRITE: { x: 1310, y: 2, width: 380, height: 22 },
        RESTART: { x: 4, y: 2, width: 72, height: 64 }
    }
};

Runner.animFrames = {
    WAITING: { frames: [44, 0], msPerFrame: 1000 / 30 },
    RUNNING: { frames: [88, 132], msPerFrame: 1000 / 12 },
    JUMPING: { frames: [0], msPerFrame: 1000 / 60 },
    CRASHED: { frames: [220], msPerFrame: 1000 / 60 },
    DUCKING: { frames: [264, 323], msPerFrame: 1000 / 8 }
};

Runner.trexConfig = {
    WIDTH: 44,
    HEIGHT: 47,
    WIDTH_DUCK: 59,
    HEIGHT_DUCK: 47
};

document.addEventListener('DOMContentLoaded', () => {
    window.dinoGame = new Runner('#game-container');
});