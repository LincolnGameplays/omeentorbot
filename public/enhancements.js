class SpectatorMode {
    constructor(canvas, isActiveGame, playerName) {
        this.canvas = canvas;
        this.renderer = new GameRenderer(canvas);
        this.playerName = playerName;
        this.isActiveGame = isActiveGame;
        
        this.interpolationBuffer = [];
        this.lastRenderedState = null;
        this.lastUpdateTime = 0;

        this.imageSprite = null;
        this.spriteDef = null;

        this.loadResources();
        this.renderLoop();
    }

    loadResources() {
        const IS_HIDPI = window.devicePixelRatio > 1;
        this.imageSprite = new Image();
        const spriteId = IS_HIDPI ? 'offline-resources-light-2x' : 'offline-resources-light-1x';
        const localSprite = document.getElementById(spriteId);

        this.imageSprite.onload = () => {
            this.spriteDef = IS_HIDPI ? Runner.spriteDefinition.HDPI : Runner.spriteDefinition.LDPI;
            this.renderer.setResources(this.imageSprite, this.spriteDef);
        };
        this.imageSprite.onerror = () => {
            this.imageSprite.src = IS_HIDPI ? 'https://raw.githubusercontent.com/wayou/t-rex-runner/master/assets/sprite-runner-2x.png' : 'https://raw.githubusercontent.com/wayou/t-rex-runner/master/assets/sprite-runner.png';
        };

        if (localSprite && localSprite.src) {
            this.imageSprite.src = localSprite.src;
        } else {
            this.imageSprite.onerror();
        }
    }

    updateGameState(compressedState) {
        if (!compressedState) return;
        const newState = {
            dino: {
                x: compressedState.d.x,
                y: compressedState.d.y,
                isDucking: compressedState.d.d === 1,
                status: compressedState.d.s || 'RUNNING'
            },
            obstacles: compressedState.o.map(obs => ({
                x: obs.x,
                y: obs.y,
                width: obs.w,
                height: obs.h,
                type: obs.t || 'CACTUS_SMALL'
            })),
            score: compressedState.s,
            gameOver: compressedState.g === 1,
            timestamp: Date.now()
        };

        this.interpolationBuffer.push(newState);
        if (this.interpolationBuffer.length > 10) {
            this.interpolationBuffer.shift();
        }
        this.lastUpdateTime = Date.now();
    }

    getInterpolatedState() {
        if (this.interpolationBuffer.length < 2) {
            return this.interpolationBuffer[0] || this.lastRenderedState;
        }

        const renderTime = Date.now() - (1000 / 60); // Target 60fps render timestamp

        let prevState = null;
        let nextState = null;

        for (let i = this.interpolationBuffer.length - 1; i >= 1; i--) {
            if (this.interpolationBuffer[i].timestamp >= renderTime && this.interpolationBuffer[i-1].timestamp <= renderTime) {
                prevState = this.interpolationBuffer[i-1];
                nextState = this.interpolationBuffer[i];
                break;
            }
        }

        if (!prevState) return this.interpolationBuffer[this.interpolationBuffer.length - 1];

        const alpha = (renderTime - prevState.timestamp) / (nextState.timestamp - prevState.timestamp);

        const interpolated = { ...nextState }; // Clone nextState
        interpolated.dino = { ...nextState.dino };

        interpolated.dino.x = prevState.dino.x + (nextState.dino.x - prevState.dino.x) * alpha;
        interpolated.dino.y = prevState.dino.y + (nextState.dino.y - prevState.dino.y) * alpha;

        return interpolated;
    }

    renderLoop() {
        const currentState = this.getInterpolatedState();
        if (currentState) {
            this.renderGameState(currentState);
            this.lastRenderedState = currentState;
        }
        requestAnimationFrame(() => this.renderLoop());
    }

    renderGameState(state) {
        if (!this.renderer || !this.spriteDef) return;

        this.renderer.clear();
        this.renderer.drawBackground();

        const groundY = this.canvas.height - (window.devicePixelRatio > 1 ? 40 : 20);

        // Desenha chão
        const groundWidth = this.spriteDef.HORIZON.width;
        const groundPatterns = Math.ceil(this.canvas.width / groundWidth) + 1;
        for (let i = 0; i < groundPatterns; i++) {
            this.renderer.drawGround(
                groundY,
                this.spriteDef.HORIZON,
                (state.groundX || 0) + (i * groundWidth)
            );
        }

        // Desenha dinossauro
        const tRex = state.dino;
        if (tRex) {
            const anim = Runner.animFrames[tRex.status];
            if (anim) {
                const animTime = Date.now() - (tRex.animStartTime || 0);
                const frameIndex = Math.floor(animTime / anim.msPerFrame) % anim.frames.length;
                const sourceX = anim.frames[frameIndex];
                const isDucking = tRex.status === 'DUCKING';
                const dinoWidth = isDucking ? Runner.trexConfig.WIDTH_DUCK : Runner.trexConfig.WIDTH;
                const dinoHeight = Runner.trexConfig.HEIGHT;
                const dinoY = groundY - dinoHeight - (tRex.y || 0);
                this.renderer.drawDino(tRex.x, dinoY, dinoWidth, dinoHeight, this.spriteDef.TREX, sourceX);
            }
        }

        // Desenha obstáculos
        if (state.obstacles) {
            state.obstacles.forEach(obs => {
                const obsY = groundY - obs.height;
                const sprite = this.spriteDef[obs.type];
                if (sprite) {
                    this.renderer.drawObstacle(obs.x, obsY, obs.width, obs.height, sprite);
                }
            });
        }

        // Desenha UI
        this.renderer.drawScore(Math.floor(state.score || 0));
        this.renderer.drawPlayerName(this.playerName);
        
        if (state.gameOver) {
            this.renderer.drawGameOver(Math.floor(state.score || 0));
        }

        this.renderer.renderToScreen();
    }
}