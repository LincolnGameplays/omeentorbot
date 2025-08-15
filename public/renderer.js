class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.buffer = document.createElement('canvas');
        this.bufferCtx = this.buffer.getContext('2d');
        
        this.imageSprite = null;
        this.spriteDef = null;

        // Configurações de estilo
        this.style = {
            background: 'rgba(247, 247, 247, 0.2)',
            text: '#535353', // Cor do texto original do dino
            scoreFont: 'bold 16px Poppins',
        };
    }

    setResources(image, def) {
        this.imageSprite = image;
        this.spriteDef = def;
    }

    resize() {
        const { width, height } = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        this.buffer.width = this.canvas.width;
        this.buffer.height = this.canvas.height;

        this.ctx.scale(dpr, dpr);
    }

    clear() {
        this.bufferCtx.clearRect(0, 0, this.buffer.width, this.buffer.height);
    }

    drawBackground() {
        this.bufferCtx.fillStyle = this.style.background;
        this.bufferCtx.fillRect(0, 0, this.buffer.width, this.buffer.height);
    }

    drawGround(yPos, horizonSprite, xPos) {
        if (!this.imageSprite) return;
        this.bufferCtx.drawImage(
            this.imageSprite,
            horizonSprite.x,
            horizonSprite.y,
            horizonSprite.width,
            horizonSprite.height,
            xPos, yPos, horizonSprite.width, horizonSprite.height
        );
    }

    drawDino(x, y, width, height, tRexSprite, sourceX) {
        if (!this.imageSprite) return;
        const sX = tRexSprite.x + sourceX;
        const sY = tRexSprite.y;
        const sWidth = width * 2; // Account for HDPI sprite sheet
        const sHeight = height * 2;

        this.bufferCtx.drawImage(
            this.imageSprite, 
            sX, sY, 
            sWidth, sHeight,
            x, y, 
            width, height
        );
    }

    drawObstacle(x, y, width, height, obstacleSprite) {
        if (!this.imageSprite || !obstacleSprite) return;
        this.bufferCtx.drawImage(
            this.imageSprite,
            obstacleSprite.x,
            obstacleSprite.y,
            obstacleSprite.width * 2, // Account for HDPI
            obstacleSprite.height * 2,
            x, y, width, height
        );
    }

    drawScore(score) {
        this.bufferCtx.fillStyle = this.style.text;
        this.bufferCtx.font = this.style.scoreFont;
        this.bufferCtx.textAlign = 'right';
        this.bufferCtx.fillText(String(score).padStart(5, '0'), this.canvas.width / (window.devicePixelRatio || 1) - 20, 30);
        this.bufferCtx.textAlign = 'left'; // Reset alignment
    }

    drawHighScore(highScore) {
        if (highScore <= 0) return;
        this.bufferCtx.fillStyle = this.style.text;
        this.bufferCtx.font = this.style.scoreFont;
        this.bufferCtx.textAlign = 'right';
        const scoreText = String(highScore).padStart(5, '0');
        this.bufferCtx.fillText(`HI ${scoreText}`, this.canvas.width / (window.devicePixelRatio || 1) - 100, 30);
        this.bufferCtx.textAlign = 'left'; // Reset alignment
    }

    drawGameOver(score) {
        if (!this.spriteDef) return;
        const textSprite = this.spriteDef.TEXT_SPRITE;
        const restartSprite = this.spriteDef.RESTART;
        const textWidth = textSprite.width / 2;
        const textHeight = textSprite.height / 2;
        const restartWidth = restartSprite.width / 2;
        const restartHeight = restartSprite.height/ 2;

        const centerX = (this.canvas.width / (window.devicePixelRatio || 1)) / 2;
        const centerY = (this.canvas.height / (window.devicePixelRatio || 1)) / 2;

        // Game Over Text
        this.bufferCtx.drawImage(this.imageSprite, textSprite.x, textSprite.y, textSprite.width, textSprite.height, 
            centerX - textWidth / 2, centerY - textHeight / 2 - 20, textWidth, textHeight);

        // Restart Button
        this.bufferCtx.drawImage(this.imageSprite, restartSprite.x, restartSprite.y, restartSprite.width, restartSprite.height,
            centerX - restartWidth / 2, centerY, restartWidth, restartHeight);
    }

    renderToScreen() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.buffer, 0, 0);
    }
}