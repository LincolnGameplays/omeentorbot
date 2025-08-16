// Otimização do RankingSystem
class RankingSystem {
    constructor() {
        this.players = [];
        this.updateInterval = 10000; // Aumentado para 10 segundos para reduzir requisições
        this.container = null;
        this.isMinimized = false;
        this.lastUpdate = 0;
        this.throttleDelay = 1000; // Limitar atualizações a 1 por segundo
    }

    setContainer(containerElement) {
        this.container = containerElement;
    }

    requestRanking() {
        const now = Date.now();
        if (now - this.lastUpdate < this.throttleDelay) return;

        const socket = window.dinoClient?.ws; // Assuming dinoClient.ws is the WebSocket instance
        if (socket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({ type: 'get_ranking' }));
                this.lastUpdate = now;
            } catch (e) {
                console.error('Failed to send ranking request:', e);
            }
        }
    }

    updateRanking(playersData) {
        this.players = playersData;
        this.render();
    }

    render() {
        if (!this.container) return;

        let content = this.container.querySelector('.ranking-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'ranking-content';
            this.container.appendChild(content);
        }

        // Usar DocumentFragment para melhor performance
        const fragment = document.createDocumentFragment();
        const topPlayers = this.players.slice(0, 5);

        const title = document.createElement('h3');
        title.textContent = 'Ranking';
        title.style.cssText = 'margin: 0 0 10px 0; font-size: 16px; color: #4361ee;';
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
            li.textContent = `${player.name}: ${player.highScore}`;
            ol.appendChild(li);
        });

        fragment.appendChild(ol);
        content.innerHTML = '';
        content.appendChild(fragment);
    }
}

class SpectatorMode {
    constructor(canvas, isActiveGame, playerName) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isActiveGame = isActiveGame;
        this.playerName = playerName;

        // Adicionar efeitos visuais
        this.effects = {
            particles: [],
            maxParticles: 50
        };

        // Configurar canvas para melhor qualidade visual
        this.setupCanvas();
        this.loadResources(); // Placeholder for resource loading
    }

    setupCanvas() {
        // Ajustar para resolução do dispositivo
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.canvas.clientWidth * dpr;
        this.canvas.height = this.canvas.clientHeight * dpr;
        this.ctx.scale(dpr, dpr);

        // Ativar antialiasing
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    loadResources() {
        // Placeholder: In a real scenario, load images, sounds, etc.
        console.log('Loading spectator mode resources...');
    }

    renderGameState(state) {
        // Limpar canvas com fade
        this.ctx.fillStyle = 'rgba(247, 247, 247, 0.9)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Renderizar efeitos de parallax (Placeholder)
        this.renderParallaxBackground();

        // Renderizar dinossauro com sombra (Placeholder)
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        this.ctx.shadowBlur = 5;
        this.ctx.shadowOffsetY = 2;
        this.renderDino(state.tRex);
        this.ctx.restore();

        // Renderizar obstáculos com efeitos (Placeholder)
        state.obstacles.forEach(obs => {
            this.renderObstacle(obs);
        });

        // Renderizar partículas
        this.updateAndRenderParticles();

        // UI com estilo moderno
        this.renderUI(state);
    }

    renderParallaxBackground() {
        // Placeholder for parallax background rendering
        // console.log('Rendering parallax background');
    }

    renderDino(tRexState) {
        // Placeholder for dino rendering
        // console.log('Rendering dino:', tRexState);
    }

    renderObstacle(obstacleState) {
        // Placeholder for obstacle rendering
        // console.log('Rendering obstacle:', obstacleState);
    }

    updateAndRenderParticles() {
        // Placeholder for particle effects
        // console.log('Updating and rendering particles');
    }

    renderUI(state) {
        // Score com efeito de gradiente
        const score = Math.floor(state.distance);
        this.ctx.save();
        const gradient = this.ctx.createLinearGradient(0, 0, 200, 0);
        gradient.addColorStop(0, '#4361ee');
        gradient.addColorStop(1, '#3f37c9');
        this.ctx.fillStyle = gradient;
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText(`Score: ${score}`, 20, 40);

        // Nome do jogador com estilo
        this.ctx.font = '18px Arial';
        this.ctx.fillStyle = '#2b2d42';
        this.ctx.fillText(this.playerName, 20, 70);
        this.ctx.restore();

        // Game Over com animação
        if (state.crashed) {
            this.renderGameOver(score);
        }
    }

    renderGameOver(score) {
        this.ctx.save();
        // Fundo semi-transparente
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Texto do Game Over
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 36px Arial';
        this.ctx.fillText('Game Over', this.canvas.width / 2, this.canvas.height / 2 - 30);

        // Pontuação final
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`Final Score: ${score}`, this.canvas.width / 2, this.canvas.height / 2 + 20);
        this.ctx.restore();
    }
}
