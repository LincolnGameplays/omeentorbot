class SpectatorMode {
    constructor(canvas, isActiveGame, name) {
        console.log('SpectatorMode initialized', name);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        // Basic placeholder for rendering
    }

    renderGameState(state) {
        // Placeholder for rendering logic
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'grey';
        this.ctx.font = '20px Arial';
        this.ctx.fillText('Spectator Mode', 50, 50);
        this.ctx.fillText(`Speed: ${state.speed}`, 50, 80);
        this.ctx.fillText(`Distance: ${Math.floor(state.distance)}`, 50, 110);
    }
}

if (typeof SpectatorMode === 'undefined') {
    console.error('❌ SpectatorMode não definido!');
} else {
    console.log('✅ SpectatorMode exportado');
    window.SpectatorMode = SpectatorMode;
}