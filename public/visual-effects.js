class VisualEffects {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.effects = new Map();
        
        // Sistema de partículas
        this.particleConfigs = {
            jump: {
                color: '#4361ee',
                size: 3,
                speed: 2,
                lifetime: 500,
                spread: 20
            },
            land: {
                color: '#2b2d42',
                size: 2,
                speed: 1,
                lifetime: 300,
                spread: 30
            },
            crash: {
                color: '#e63946',
                size: 4,
                speed: 3,
                lifetime: 1000,
                spread: 45
            }
        };
    }

    createParticles(type, x, y, amount) {
        const config = this.particleConfigs[type];
        for (let i = 0; i < amount; i++) {
            this.particles.push(new Particle(x, y, config));
        }
    }

    update(deltaTime) {
        // Atualizar partículas
        this.particles = this.particles.filter(particle => {
            particle.update(deltaTime);
            return particle.alive;
        });

        // Atualizar efeitos
        for (const [key, effect] of this.effects) {
            effect.update(deltaTime);
            if (effect.finished) {
                this.effects.delete(key);
            }
        }
    }

    render() {
        // Renderizar partículas
        this.particles.forEach(particle => {
            this.ctx.save();
            this.ctx.globalAlpha = particle.alpha;
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });

        // Renderizar efeitos
        this.effects.forEach(effect => effect.render(this.ctx));
    }

    addJumpEffect(x, y) {
        this.createParticles('jump', x, y + 30, 10);
    }

    addLandEffect(x, y) {
        this.createParticles('land', x, y, 15);
    }

    addCrashEffect(x, y) {
        this.createParticles('crash', x, y, 30);
        this.effects.set('flash', new ScreenFlash('#e63946', 300));
        this.effects.set('shake', new ScreenShake(500, 5));
    }
}

class Particle {
    constructor(x, y, config) {
        this.x = x;
        this.y = y;
        this.color = config.color;
        this.size = config.size * (0.5 + Math.random() * 0.5);
        this.speedX = (Math.random() - 0.5) * config.speed * 2;
        this.speedY = (Math.random() - 0.5) * config.speed * 2;
        this.lifetime = config.lifetime;
        this.age = 0;
        this.alive = true;
        this.alpha = 1;
    }

    update(deltaTime) {
        this.x += this.speedX * deltaTime;
        this.y += this.speedY * deltaTime;
        this.age += deltaTime;
        this.alpha = 1 - (this.age / this.lifetime);
        
        if (this.age >= this.lifetime) {
            this.alive = false;
        }
    }
}

class ScreenFlash {
    constructor(color, duration) {
        this.color = color;
        this.duration = duration;
        this.currentTime = 0;
        this.finished = false;
    }

    update(deltaTime) {
        this.currentTime += deltaTime;
        if (this.currentTime >= this.duration) {
            this.finished = true;
        }
    }

    render(ctx) {
        const alpha = 1 - (this.currentTime / this.duration);
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }
}

class ScreenShake {
    constructor(duration, intensity) {
        this.duration = duration;
        this.intensity = intensity;
        this.currentTime = 0;
        this.finished = false;
        this.originalTranslateX = 0;
        this.originalTranslateY = 0;
    }

    update(deltaTime) {
        this.currentTime += deltaTime;
        if (this.currentTime >= this.duration) {
            this.finished = true;
            return;
        }

        const progress = this.currentTime / this.duration;
        const shakeAmount = this.intensity * (1 - progress);

        // Apply shake directly to canvas context
        const translateX = (Math.random() - 0.5) * shakeAmount * 2;
        const translateY = (Math.random() - 0.5) * shakeAmount * 2;

        // This needs to be applied to the canvas transform, not directly here.
        // The renderer will need to expose a way to apply global transforms.
        // For now, this class will just calculate the offset.
        this.offsetX = translateX;
        this.offsetY = translateY;
    }

    render(ctx) {
        // The actual shake transform will be applied by the renderer
        // This method is mostly a placeholder for the effect's lifecycle
    }
}

if (typeof VisualEffects === 'undefined') {
    console.error('❌ VisualEffects não definido!');
} else {
    console.log('✅ VisualEffects exportado');
    window.VisualEffects = VisualEffects;
}