console.log('--- renderer.js: Script start ---');
(function() {
    function GameRenderer(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.buffer = document.createElement('canvas');
        this.bufferCtx = this.buffer.getContext('2d');
        
        this.imageSprite = null;
        this.spriteDef = null;

        this.style = {
            background: 'rgba(247, 247, 247, 0.2)',
            text: '#535353',
            scoreFont: 'bold 16px Poppins',
        };
    }

    GameRenderer.prototype.setResources = function(image, def) {
        this.imageSprite = image;
        this.spriteDef = def;
    };

    GameRenderer.prototype.resize = function() {
        const { width, height } = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Reset antes de mexer
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.canvas.width = Math.max(1, Math.floor(width * dpr));
        this.canvas.height = Math.max(1, Math.floor(height * dpr));
        this.canvas.style.width = `${Math.max(1, Math.floor(width))}px`;
        this.canvas.style.height = `${Math.max(1, Math.floor(height))}px`;

        this.buffer.width = this.canvas.width;
        this.buffer.height = this.canvas.height;

        // Agora aplica a escala uma vez
        this.ctx.scale(dpr, dpr);
    };

    GameRenderer.prototype.clear = function() {
        this.bufferCtx.clearRect(0, 0, this.buffer.width, this.buffer.height);
    };

    GameRenderer.prototype.drawBackground = function() {
        this.bufferCtx.fillStyle = this.style.background;
        this.bufferCtx.fillRect(0, 0, this.buffer.width, this.buffer.height);
    };

    GameRenderer.prototype.drawGround = function(yPos, horizonSprite, xPos) {
        if (!this.imageSprite) return;
        this.bufferCtx.drawImage(
            this.imageSprite,
            horizonSprite.x,
            horizonSprite.y,
            horizonSprite.width,
            horizonSprite.height,
            xPos, yPos, horizonSprite.width, horizonSprite.height
        );
    };

    GameRenderer.prototype.drawDino = function(x, y, width, height, tRexSprite, sourceX) {
        if (!this.imageSprite) {
            console.log("imageSprite is null in drawDino.");
            return;
        }
        console.log("drawDino called with: x:", x, "y:", y, "width:", width, "height:", height, "tRexSprite:", tRexSprite, "sourceX:", sourceX);
        const sX = tRexSprite.x + sourceX;
        const sY = tRexSprite.y;
        const sWidth = tRexSprite.width;
        const sHeight = tRexSprite.height;

        this.bufferCtx.drawImage(
            this.imageSprite, 
            sX, sY, 
            sWidth, sHeight,
            x, y, 
            width, height
        );
    };

    GameRenderer.prototype.drawObstacle = function(x, y, width, height, obstacleSprite) {
        if (!this.imageSprite || !obstacleSprite) {
            console.log("imageSprite or obstacleSprite is null in drawObstacle.");
            return;
        }
        console.log("drawObstacle called with: x:", x, "y:", y, "width:", width, "height:", height, "obstacleSprite:", obstacleSprite);
        this.bufferCtx.drawImage(
            this.imageSprite,
            obstacleSprite.x,
            obstacleSprite.y,
            obstacleSprite.width,
            obstacleSprite.height,
            x, y, width, height
        );
    };

    GameRenderer.prototype.drawScore = function(score) {
        this.bufferCtx.fillStyle = this.style.text;
        this.bufferCtx.font = this.style.scoreFont;
        this.bufferCtx.textAlign = 'right';
        this.bufferCtx.fillText(String(score).padStart(5, '0'), this.canvas.width / (window.devicePixelRatio || 1) - 20, 30);
        this.bufferCtx.textAlign = 'left';
    };

    GameRenderer.prototype.drawHighScore = function(highScore) {
        if (highScore <= 0) return;
        this.bufferCtx.fillStyle = this.style.text;
        this.bufferCtx.font = this.style.scoreFont;
        this.bufferCtx.textAlign = 'right';
        const scoreText = String(highScore).padStart(5, '0');
        this.bufferCtx.fillText(`HI ${scoreText}`, this.canvas.width / (window.devicePixelRatio || 1) - 100, 30);
        this.bufferCtx.textAlign = 'left';
    };

    GameRenderer.prototype.drawGameOver = function(score) {
        if (!this.imageSprite || !this.spriteDef) return;
        const textSprite = this.spriteDef.TEXT_SPRITE;
        const restartSprite = this.spriteDef.RESTART;
        const textWidth = textSprite.width / 2;
        const textHeight = textSprite.height / 2;
        const restartWidth = restartSprite.width / 2;
        const restartHeight = restartSprite.height/ 2;

        const centerX = (this.canvas.width / (window.devicePixelRatio || 1)) / 2;
        const centerY = (this.canvas.height / (window.devicePixelRatio || 1)) / 2;

        this.bufferCtx.drawImage(this.imageSprite, textSprite.x, textSprite.y, textSprite.width, textSprite.height, 
            centerX - textWidth / 2, centerY - textHeight / 2 - 20, textWidth, textHeight);

        this.bufferCtx.drawImage(this.imageSprite, restartSprite.x, restartSprite.y, restartSprite.width, restartSprite.height,
            centerX - restartWidth / 2, centerY, restartWidth, restartHeight);
    };

    GameRenderer.prototype.renderToScreen = function() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.buffer, 0, 0);
    };

    // No final do renderer.js, substitua por:
if (typeof GameRenderer === 'undefined') {
    console.error('❌ CRÍTICO: GameRenderer não definido!');
    updateLoaderStatus('Falha ao carregar renderizador');
} else {
    console.log('✅ GameRenderer pronto');
    window.GameRenderer = GameRenderer;
    updateLoaderStatus('Renderizador carregado');
}
})();