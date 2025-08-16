// Shared Game Logic for Dino Game

// Constants
const FPS = 60;
const DEFAULT_WIDTH = 600;

// --- GAME CONFIGURATION ---
// This object is now self-contained and doesn't rely on a Runner instance.
const defaultConfig = {
    ACCELERATION: 0.001,
    BG_CLOUD_SPEED: 0.2,
    BOTTOM_PAD: 10,
    CLEAR_TIME: 3000,
    CLOUD_FREQUENCY: 0.5,
    GAMEOVER_CLEAR_TIME: 750,
    GAP_COEFFICIENT: 0.6,
    GRAVITY: 0.6,
    INITIAL_JUMP_VELOCITY: 12,
    INVERT_FADE_DURATION: 12000,
    INVERT_DISTANCE: 700,
    MAX_BLINK_COUNT: 3,
    MAX_CLOUDS: 6,
    MAX_OBSTACLE_LENGTH: 3,
    MAX_OBSTACLE_DUPLICATION: 2,
    MAX_SPEED: 13,
    MIN_JUMP_HEIGHT: 35,
    SPEED: 6,
    SPEED_DROP_COEFFICIENT: 3,
};

// --- UTILITY FUNCTIONS ---
function getRandomNum(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getTimeStamp() {
    return new Date().getTime();
}

// --- COLLISION DETECTION ---
class CollisionBox {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
    }
}

function checkForCollision(obstacle, tRex) {
    if (!obstacle) return false;

    const tRexBox = new CollisionBox(
        tRex.xPos + 1,
        tRex.yPos + 1,
        tRex.config.WIDTH - 2,
        tRex.config.HEIGHT - 2
    );

    const obstacleBox = new CollisionBox(
        obstacle.xPos + 1,
        obstacle.yPos + 1,
        obstacle.typeConfig.width * obstacle.size - 2,
        obstacle.typeConfig.height - 2
    );

    if (boxCompare(tRexBox, obstacleBox)) {
        const collisionBoxes = obstacle.collisionBoxes;
        const tRexCollisionBoxes = tRex.ducking ?
            Trex.collisionBoxes.DUCKING : Trex.collisionBoxes.RUNNING;

        for (let t = 0; t < tRexCollisionBoxes.length; t++) {
            for (let i = 0; i < collisionBoxes.length; i++) {
                const adjTrexBox = createAdjustedCollisionBox(tRexCollisionBoxes[t], tRexBox);
                const adjObstacleBox = createAdjustedCollisionBox(collisionBoxes[i], obstacleBox);
                const crashed = boxCompare(adjTrexBox, adjObstacleBox);
                if (crashed) {
                    return [adjTrexBox, adjObstacleBox];
                }
            }
        }
    }
    return false;
}

function createAdjustedCollisionBox(box, adjustment) {
    return new CollisionBox(
        box.x + adjustment.x,
        box.y + adjustment.y,
        box.width,
        box.height
    );
}

function boxCompare(tRexBox, obstacleBox) {
    const tRexBoxX = tRexBox.x;
    const tRexBoxY = tRexBox.y;
    const obstacleBoxX = obstacleBox.x;
    const obstacleBoxY = obstacleBox.y;

    return (
        tRexBoxX < obstacleBoxX + obstacleBox.width &&
        tRexBoxX + tRexBox.width > obstacleBoxX &&
        tRexBoxY < obstacleBoxY + obstacleBox.height &&
        tRexBox.height + tRexBoxY > obstacleBoxY
    );
}


// --- OBSTACLE CLASS ---
class Obstacle {
    constructor(type, gapCoefficient, speed, opt_xOffset) {
        this.typeConfig = type;
        this.gapCoefficient = gapCoefficient;
        this.size = getRandomNum(1, Obstacle.MAX_OBSTACLE_LENGTH);
        this.dimensions = { WIDTH: DEFAULT_WIDTH, HEIGHT: 150 }; // Use default dimensions
        this.remove = false;
        this.xPos = this.dimensions.WIDTH + (opt_xOffset || 0);
        this.yPos = 0;
        this.width = 0;
        this.collisionBoxes = [];
        this.gap = 0;
        this.speedOffset = 0;
        this.currentFrame = 0;
        this.timer = 0;
        this.init(speed);
    }

    init(speed) {
        this.cloneCollisionBoxes();
        if (this.size > 1 && this.typeConfig.multipleSpeed > speed) {
            this.size = 1;
        }
        this.width = this.typeConfig.width * this.size;
        if (Array.isArray(this.typeConfig.yPos)) {
            this.yPos = this.typeConfig.yPos[getRandomNum(0, this.typeConfig.yPos.length - 1)];
        } else {
            this.yPos = this.typeConfig.yPos;
        }
        if (this.size > 1) {
            this.collisionBoxes[1].width = this.width - this.collisionBoxes[0].width - this.collisionBoxes[2].width;
            this.collisionBoxes[2].x = this.width - this.collisionBoxes[2].width;
        }
        if (this.typeConfig.speedOffset) {
            this.speedOffset = Math.random() > 0.5 ? this.typeConfig.speedOffset : -this.typeConfig.speedOffset;
        }
        this.gap = this.getGap(this.gapCoefficient, speed);
    }

    update(deltaTime, speed) {
        if (!this.remove) {
            if (this.typeConfig.speedOffset) {
                speed += this.speedOffset;
            }
            this.xPos -= (speed * deltaTime / (1000 / FPS));
            if (this.typeConfig.numFrames) {
                this.timer += deltaTime;
                if (this.timer >= this.typeConfig.frameRate) {
                    this.currentFrame = this.currentFrame === this.typeConfig.numFrames - 1 ? 0 : this.currentFrame + 1;
                    this.timer = 0;
                }
            }
            if (!this.isVisible()) {
                this.remove = true;
            }
        }
    }

    getGap(gapCoefficient, speed) {
        const minGap = Math.round(this.width * speed + this.typeConfig.minGap * gapCoefficient);
        const maxGap = Math.round(minGap * Obstacle.MAX_GAP_COEFFICIENT);
        return getRandomNum(minGap, maxGap);
    }

    isVisible() {
        return this.xPos + this.width > 0;
    }

    cloneCollisionBoxes() {
        const collisionBoxes = this.typeConfig.collisionBoxes;
        for (let i = collisionBoxes.length - 1; i >= 0; i--) {
            this.collisionBoxes[i] = new CollisionBox(collisionBoxes[i].x, collisionBoxes[i].y, collisionBoxes[i].width, collisionBoxes[i].height);
        }
    }

    getCollisionBounds() {
        // For simplicity, using the first collision box as the primary bound
        // A more accurate implementation might combine all collision boxes
        const primaryBox = this.collisionBoxes[0];
        return {
            left: this.xPos + primaryBox.x,
            right: this.xPos + primaryBox.x + primaryBox.width,
            top: this.yPos + primaryBox.y,
            bottom: this.yPos + primaryBox.y + primaryBox.height
        };
    }
}
Obstacle.MAX_GAP_COEFFICIENT = 1.5;
Obstacle.MAX_OBSTACLE_LENGTH = 3;
Obstacle.types = [
    { type: 'CACTUS_SMALL', width: 17, height: 35, yPos: 105, multipleSpeed: 4, minGap: 120, minSpeed: 0, collisionBoxes: [new CollisionBox(0, 7, 5, 27), new CollisionBox(4, 0, 6, 34), new CollisionBox(10, 4, 7, 14)] },
    { type: 'CACTUS_LARGE', width: 25, height: 50, yPos: 90, multipleSpeed: 7, minGap: 120, minSpeed: 0, collisionBoxes: [new CollisionBox(0, 12, 7, 38), new CollisionBox(8, 0, 7, 49), new CollisionBox(13, 10, 10, 38)] },
    { type: 'PTERODACTYL', width: 46, height: 40, yPos: [100, 75, 50], yPosMobile: [100, 50], multipleSpeed: 999, minSpeed: 8.5, minGap: 150, collisionBoxes: [new CollisionBox(15, 15, 16, 5), new CollisionBox(18, 21, 24, 6), new CollisionBox(2, 14, 4, 3), new CollisionBox(6, 10, 4, 7), new CollisionBox(10, 8, 6, 9)], numFrames: 2, frameRate: 1000 / 6, speedOffset: .8 }
];


// --- TREX CLASS ---
class Trex {
    constructor() {
        this.xPos = 0;
        this.yPos = 0;
        this.groundYPos = 0;
        this.status = Trex.status.WAITING;
        this.jumping = false;
        this.ducking = false;
        this.jumpVelocity = 0;
        this.reachedMinHeight = false;
        this.speedDrop = false;
        this.jumpCount = 0;
        this.config = Trex.config;
        this.init();
    }

    init() {
        this.groundYPos = { WIDTH: DEFAULT_WIDTH, HEIGHT: 150 }.HEIGHT - this.config.HEIGHT - defaultConfig.BOTTOM_PAD;
        this.yPos = this.groundYPos;
        this.minJumpHeight = this.groundYPos - this.config.MIN_JUMP_HEIGHT;
        this.status = Trex.status.RUNNING;
    }

    update(deltaTime) {
        if (this.jumping) {
            this.updateJump(deltaTime);
        }
    }

    updateJump(deltaTime) {
        const msPerFrame = 1000 / FPS;
        const framesElapsed = deltaTime / msPerFrame;

        if (this.speedDrop) {
            this.yPos += Math.round(this.jumpVelocity * this.config.SPEED_DROP_COEFFICIENT * framesElapsed);
        } else {
            this.yPos += Math.round(this.jumpVelocity * framesElapsed);
        }

        this.jumpVelocity += this.config.GRAVITY * framesElapsed;

        const jumpHeight = this.jumpStartY - this.yPos; // quanto subiu
        if (jumpHeight >= this.config.MIN_JUMP_HEIGHT || this.speedDrop) {
            this.reachedMinHeight = true;
        }
        if (jumpHeight >= this.config.MAX_JUMP_HEIGHT || this.speedDrop) {
            this.endJump();
        }
        if (this.yPos > this.groundYPos) {
            this.reset();
            this.jumpCount++;
        }
    }

    startJump(speed) {
        if (!this.jumping) {
            this.status = Trex.status.JUMPING;
            this.jumpStartY = this.yPos;
            this.jumpVelocity = this.config.INITIAL_JUMP_VELOCITY - (speed / 10);
            this.jumping = true;
            this.reachedMinHeight = false;
            this.speedDrop = false;
        }
    }

    endJump() {
        if (this.reachedMinHeight && this.jumpVelocity < this.config.DROP_VELOCITY) {
            this.jumpVelocity = this.config.DROP_VELOCITY;
        }
    }

    setSpeedDrop() {
        this.speedDrop = true;
        this.jumpVelocity = 1;
    }

    setDuck(isDucking) {
        if (isDucking && this.status !== Trex.status.DUCKING) {
            this.status = Trex.status.DUCKING;
            this.ducking = true;
        } else if (this.status === Trex.status.DUCKING) {
            this.status = Trex.status.RUNNING;
            this.ducking = false;
        }
    }

    reset() {
        this.yPos = this.groundYPos;
        this.jumpVelocity = 0;
        this.jumping = false;
        this.ducking = false;
        this.status = Trex.status.RUNNING;
        this.speedDrop = false;
    }

    getCollisionBounds() {
        const collisionBox = this.ducking ? Trex.collisionBoxes.DUCKING[0] : Trex.collisionBoxes.RUNNING[0];
        return {
            left: this.xPos + collisionBox.x,
            right: this.xPos + collisionBox.x + collisionBox.width,
            top: this.yPos + collisionBox.y,
            bottom: this.yPos + collisionBox.y + collisionBox.height
        };
    }
}
Trex.config = { DROP_VELOCITY: -5, GRAVITY: 0.6, HEIGHT: 47, HEIGHT_DUCK: 25, INITIAL_JUMP_VELOCITY: -10, MAX_JUMP_HEIGHT: 90, MIN_JUMP_HEIGHT: 30, SPEED_DROP_COEFFICIENT: 3, WIDTH: 44, WIDTH_DUCK: 59 };
Trex.collisionBoxes = { DUCKING: [new CollisionBox(1, 18, 55, 25)], RUNNING: [new CollisionBox(22, 0, 17, 16), new CollisionBox(1, 18, 30, 9), new CollisionBox(10, 35, 14, 8), new CollisionBox(1, 24, 29, 5), new CollisionBox(5, 30, 21, 4), new CollisionBox(9, 34, 15, 4)] };
Trex.status = { CRASHED: 'CRASHED', DUCKING: 'DUCKING', JUMPING: 'JUMPING', RUNNING: 'RUNNING', WAITING: 'WAITING' };


// --- HORIZON CLASS ---
class Horizon {
    constructor() {
        this.dimensions = { WIDTH: DEFAULT_WIDTH, HEIGHT: 150 };
        this.gapCoefficient = defaultConfig.GAP_COEFFICIENT;
        this.obstacles = [];
        this.obstacleHistory = [];
        this.init();
    }

    init() {
        this.obstacles = [];
        this.obstacleHistory = [];
    }

    update(deltaTime, currentSpeed) {
        this.updateObstacles(deltaTime, currentSpeed);
    }

    updateObstacles(deltaTime, currentSpeed) {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.update(deltaTime, currentSpeed);
            if (obstacle.remove) this.obstacles.splice(i, 1);
        }

        if (this.obstacles.length > 0) {
            const lastObstacle = this.obstacles[this.obstacles.length - 1];
            if (lastObstacle && !lastObstacle.followingObstacleCreated && lastObstacle.isVisible() && (lastObstacle.xPos + lastObstacle.width + lastObstacle.gap) < this.dimensions.WIDTH) {
                this.addNewObstacle(currentSpeed);
                lastObstacle.followingObstacleCreated = true;
            }
        } else {
            this.addNewObstacle(currentSpeed);
        }
    }

    addNewObstacle(currentSpeed) {
        for (let attempts = 0; attempts < 5; attempts++) {
            const type = Obstacle.types[getRandomNum(0, Obstacle.types.length - 1)];
            if (!this.duplicateObstacleCheck(type.type) && currentSpeed >= type.minSpeed) {
                this.obstacles.push(new Obstacle(type, this.gapCoefficient, currentSpeed, type.width));
                this.obstacleHistory.unshift(type.type);
                if (this.obstacleHistory.length > defaultConfig.MAX_OBSTACLE_DUPLICATION) {
                    this.obstacleHistory.length = defaultConfig.MAX_OBSTACLE_DUPLICATION;
                }
                return;
            }
        }
        // nenhuma opção viável — não cria nada neste tick
    }

    duplicateObstacleCheck(nextObstacleType) {
        let duplicateCount = 0;
        for (let i = 0; i < this.obstacleHistory.length; i++) {
            duplicateCount = this.obstacleHistory[i] === nextObstacleType ? duplicateCount + 1 : 0;
        }
        return duplicateCount >= defaultConfig.MAX_OBSTACLE_DUPLICATION;
    }

    reset() {
        this.obstacles = [];
        this.obstacleHistory = [];
    }
}


// --- HEADLESS RUNNER CLASS ---


// Otimização do sistema de física e colisões
class PhysicsEngine {
    constructor() {
        this.lastTime = 0;
        this.fixedDeltaTime = 1000 / 60; // Física roda a 60 FPS fixo
        this.accumulator = 0;
        this.maxSteps = 5; // Evita spiral of death
    }

    update(currentTime) {
        if (!this.lastTime) { this.lastTime = currentTime; return { steps: 0, alpha: 0 }; }
        let deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        if (deltaTime > 200) deltaTime = 200; // clamp, mas NÃO zere para fixedDeltaTime

        this.accumulator += deltaTime;

        let steps = 0;
        while (this.accumulator >= this.fixedDeltaTime && steps < this.maxSteps) {
            this.accumulator -= this.fixedDeltaTime;
            steps++;
        }
        const alpha = this.accumulator / this.fixedDeltaTime;
        return { steps, alpha };
    }
}

// Sistema de colisões otimizado
class CollisionSystem {
    constructor() {
        this.collisionBoxes = new Map(); // Stores collision boxes for entities
        this.spatialGrid = new SpatialGrid(600, 150, 50); // Grid de 50x50 pixels (adjust dimensions as needed)
    }

    updateEntity(entity, id) {
        const boxes = entity.getCollisionBounds(); // Assuming entity has getCollisionBounds
        this.collisionBoxes.set(id, boxes);
        this.spatialGrid.updateEntity(id, boxes); // Update entity in spatial grid
    }

    checkCollision(entity1, entity2) {
        const b1 = entity1.getCollisionBounds();
        const b2 = entity2.getCollisionBounds();
        if (!this.checkAABB(b1, b2)) return false;

        // Precisão (iterate small boxes)
        const e1Boxes = entity1.ducking ? Trex.collisionBoxes.DUCKING : Trex.collisionBoxes.RUNNING;
        const e2Boxes = entity2.collisionBoxes || [ { x:0, y:0, width:b2.right-b2.left, height:b2.bottom-b2.top } ];

        for (const a of e1Boxes) {
            const A = { left: entity1.xPos + a.x, right: entity1.xPos + a.x + a.width, top: entity1.yPos + a.y, bottom: entity1.yPos + a.y + a.height };
            for (const c of e2Boxes) {
                const B = { left: entity2.xPos + c.x, right: entity2.xPos + c.x + c.width, top: entity2.yPos + c.y, bottom: entity2.yPos + c.y + c.height };
                if (!(A.right < B.left || A.left > B.right || A.bottom < B.top || A.top > B.bottom)) return true;
            }
        }
        return false;
    }

    checkAABB(box1, box2) {
        return !(box1.right < box2.left ||
                box1.left > box2.right ||
                box1.bottom < box2.top ||
                box1.top > box2.bottom);
    }
}

// Basic Spatial Grid for broad-phase collision detection
class SpatialGrid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = Array(this.cols * this.rows).fill(0).map(() => new Set());
        this.entities = new Map(); // Stores entity ID to its collision box
    }

    _getCellCoords(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        return { col, row };
    }

    _getCellIndex(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
            return -1; // Out of bounds
        }
        return row * this.cols + col;
    }

    updateEntity(id, box) {
        // Remove entity from old cells
        const oldBox = this.entities.get(id);
        if (oldBox) {
            this._removeEntityFromCells(id, oldBox);
        }

        // Add entity to new cells
        this._addEntityToCells(id, box);
        this.entities.set(id, box);
    }

    _addEntityToCells(id, box) {
        const startCol = Math.floor(box.left / this.cellSize);
        const endCol = Math.floor(box.right / this.cellSize);
        const startRow = Math.floor(box.top / this.cellSize);
        const endRow = Math.floor(box.bottom / this.cellSize);

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const index = this._getCellIndex(col, row);
                if (index !== -1) {
                    this.grid[index].add(id);
                }
            }
        }
    }

    _removeEntityFromCells(id, box) {
        const startCol = Math.floor(box.left / this.cellSize);
        const endCol = Math.floor(box.right / this.cellSize);
        const startRow = Math.floor(box.top / this.cellSize);
        const endRow = Math.floor(box.bottom / this.cellSize);

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const index = this._getCellIndex(col, row);
                if (index !== -1) {
                    this.grid[index].delete(id);
                }
            }
        }
    }

    getNearbyEntities(box) {
        const nearby = new Set();
        const startCol = Math.floor(box.left / this.cellSize);
        const endCol = Math.floor(box.right / this.cellSize);
        const startRow = Math.floor(box.top / this.cellSize);
        const endRow = Math.floor(box.bottom / this.cellSize);

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const index = this._getCellIndex(col, row);
                if (index !== -1) {
                    this.grid[index].forEach(id => nearby.add(id));
                }
            }
        }
        return Array.from(nearby);
    }
}

// --- RUNNER CLASS ---
class Runner {
    constructor(selector) {
        this.config = {
            ...defaultConfig,
            ACCELERATION: 0.001,
            MAX_SPEED: 13,
            GRAVITY: 0.6,
            INITIAL_JUMP_VELOCITY: -10,
            SPEED: 6
        };

        this.dimensions = { WIDTH: DEFAULT_WIDTH, HEIGHT: 150 };
        this.tRex = null;
        this.horizon = null;
        this.distanceRan = 0;
        this.time = 0;
        this.runningTime = 0;
        this.msPerFrame = 1000 / FPS;
        this.currentSpeed = this.config.SPEED;
        this.playing = false;
        this.crashed = false;
        this.paused = false;
        this.highScore = 0; // Added for high score saving

        // Sistema de dificuldade progressiva
        this.difficultyTimer = 0;
        this.difficultyInterval = 30000; // 30 segundos
        this.difficultyLevel = 1;

        // Physics and Collision Systems
        this.physics = new PhysicsEngine();
        this.collisionSystem = new CollisionSystem();

        // Performance monitoring
        this.frameCounter = 0;
        this.fpsTime = 0;
        this.currentFps = 0;
        this.metrics = {
            frameTime: [],
            updateTime: [],
            renderTime: []
        };

        // Rendering setup
        const container = document.querySelector(selector);
        if (!container) {
            console.error('Game container not found:', selector);
            return;
        }
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }
        this.renderer = new window.GameRenderer(canvas);
        this.renderer.resize(); // Initial resize

        // Load sprites (placeholder for now)
        const image = new Image();
        image.src = 'assets/offline-sprite-1x.png'; // Assuming this path
        image.onload = () => {
            // Assuming spriteDef is loaded from a JSON or defined elsewhere
            // For now, using a simplified spriteDef
            const spriteDef = {
                TREX: { x: 848, y: 2, width: 44, height: 47 },
                CACTUS_SMALL: { x: 228, y: 2, width: 17, height: 35 },
                CACTUS_LARGE: { x: 332, y: 2, width: 25, height: 50 },
                PTERODACTYL: { x: 134, y: 2, width: 46, height: 40 },
                HORIZON: { x: 2, y: 54, width: 600, height: 12 },
                TEXT_SPRITE: { x: 655, y: 2, width: 144, height: 14 },
                RESTART: { x: 2, y: 2, width: 36, height: 32 }
            };
            this.renderer.setResources(image, spriteDef);
            console.log("Image and spriteDef set in renderer.");
        };

        this.init();
    }

    init() {
        this.horizon = new Horizon();
        this.tRex = new Trex();
        this.time = performance.now(); // Use performance.now() for better precision
        this.playing = true;
        const saved = Number(localStorage.getItem('highScore')) || 0;
        this.highScore = saved;
    }

    update(currentTime) {
        const updateStart = performance.now();

        // Atualização física com timestep fixo
        const { steps, alpha } = this.physics.update(currentTime);
        
        // Update game state based on fixed delta time
        if (this.playing) {
            for (let i = 0; i < steps; i++) this.fixedUpdate(this.physics.fixedDeltaTime);
        }

        // Monitoramento de performance
        const updateEnd = performance.now();
        this.metrics.updateTime.push(updateEnd - updateStart);
        
        // Manter apenas últimos 60 frames de métricas
        if (this.metrics.updateTime.length > 60) {
            this.metrics.updateTime.shift();
        }

        // Calcular FPS
        this.frameCounter++;
        if (currentTime - this.fpsTime >= 1000) {
            this.currentFps = this.frameCounter;
            this.frameCounter = 0;
            this.fpsTime = currentTime;
        }

        return { alpha, metrics: this.getPerformanceMetrics() };
    }

    fixedUpdate(deltaTime) {
        if (!this.playing || this.paused) return;

        // Atualizar dificuldade
        this.difficultyTimer += deltaTime;
        if (this.difficultyTimer >= this.difficultyInterval) {
            this.increaseDifficulty();
            this.difficultyTimer = 0;
        }

        // Atualizar elementos do jogo
        this.horizon.update(deltaTime, this.currentSpeed);
        this.tRex.update(deltaTime);

        // Update collision system for entities
        this.collisionSystem.updateEntity(this.tRex, 'player');
        this.horizon.obstacles.forEach((obstacle, index) => {
            this.collisionSystem.updateEntity(obstacle, `obstacle_${index}`);
        });

        // Check for collisions
        if (this.checkCollisions()) {
            this.handleGameOver();
        } else {
            this.updateScore(deltaTime);
            this.updateSpeed();
        }
    }

    checkCollisions() {
        if (this.horizon.obstacles.length === 0) return false;

        for (const obstacle of this.horizon.obstacles) {
            if (this.collisionSystem.checkCollision(this.tRex, obstacle)) {
                return true;
            }
        }
        return false;
    }

    increaseDifficulty() {
        this.difficultyLevel++;
        this.config.ACCELERATION *= 1.1;
        this.config.MAX_SPEED *= 1.05;
        // Assuming Horizon has an updateDifficulty method
        // this.horizon.updateDifficulty(this.difficultyLevel);
    }

    updateScore(deltaTime) {
        this.distanceRan += this.currentSpeed * (deltaTime / 1000);
        // Bônus de pontuação baseado na dificuldade
        this.distanceRan += (this.difficultyLevel - 1) * 0.1;
    }

    updateSpeed() {
        if (this.currentSpeed < this.config.MAX_SPEED) {
            this.currentSpeed += this.config.ACCELERATION;
        }
    }

    handleGameOver() {
        this.crashed = true;
        this.playing = false;
        // Salvar high score
        if (this.distanceRan > (this.highScore || 0)) {
            this.highScore = this.distanceRan;
            localStorage.setItem('highScore', String(Math.floor(this.highScore)));
        }
        this.stop(); // Call stop to set paused to true
    }
    
    handleInput(type) {
        if (!this.crashed) {
            if (type === 'jump') {
                if (!this.tRex.jumping) {
                    this.tRex.startJump(this.currentSpeed);
                }
            } else if (type === 'duck') {
                if (this.tRex.jumping) {
                    this.tRex.setSpeedDrop();
                } else if (!this.tRex.ducking) {
                    this.tRex.setDuck(true);
                }
            }
        }
    }
    
    handleKeyUp(type) {
        if (type === 'duck' && this.tRex.ducking) {
            this.tRex.setDuck(false);
        }
    }

    stop() {
        this.playing = false;
        this.paused = true;
    }

    restart() {
        this.runningTime = 0;
        this.playing = true;
        this.crashed = false;
        this.paused = false;
        this.distanceRan = 0;
        this.currentSpeed = this.config.SPEED;
        this.time = performance.now(); // Use performance.now() for better precision
        this.horizon.reset();
        this.tRex.reset();
        this.difficultyLevel = 1; // Reset difficulty on restart
        this.difficultyTimer = 0;
        this.tRex.jumpCount = 0;
    }

    /**
     * Returns a simplified state object for sending to clients.
     */
    getState() {
        const obstacles = this.horizon.obstacles.map(o => ({
            x: o.xPos,
            y: o.yPos,
            width: o.width,
            height: o.typeConfig.height,
            type: o.typeConfig.type,
        }));

        return {
            tRex: {
                x: this.tRex.xPos,
                y: this.tRex.yPos,
                status: this.tRex.status,
            },
            obstacles: obstacles,
            speed: this.currentSpeed,
            distance: this.distanceRan,
            crashed: this.crashed,
            highScore: this.highScore // Include high score in state
        };
    }

    renderState(state) {
        console.log("renderState called.");
        if (!this.renderer || !this.renderer.spriteDef) {
            console.log("Renderer or spriteDef not ready in renderState.");
            return;
        }
        console.log("Renderer and spriteDef are ready in renderState. tRex.xPos:", this.tRex.xPos, "tRex.yPos:", this.tRex.yPos, "Obstacles count:", this.horizon.obstacles.length);
        console.log("TREX spriteDef:", this.renderer.spriteDef.TREX);
        // Update internal game state based on received state
        this.tRex.xPos = state.tRex.x;
        this.tRex.yPos = state.tRex.y;
        this.tRex.status = state.tRex.status;
        // Assuming Trex has a way to set ducking/jumping based on status
        this.tRex.ducking = state.tRex.status === Trex.status.DUCKING;
        this.tRex.jumping = state.tRex.status === Trex.status.JUMPING;

        // Update obstacles
        this.horizon.obstacles = state.obstacles.map(obsData => {
            // Find the corresponding Obstacle type
            const typeConfig = Obstacle.types.find(type => type.type === obsData.type);
            if (typeConfig) {
                const obs = new Obstacle(typeConfig, this.horizon.gapCoefficient, this.currentSpeed); // speed is needed for gap calculation
                obs.xPos = obsData.x;
                obs.yPos = obsData.y;
                obs.width = obsData.width; // Use width from state
                // obs.height = obsData.height; // Obstacle uses typeConfig.height
                return obs;
            }
            return null;
        }).filter(Boolean); // Remove nulls

        this.currentSpeed = state.speed;
        this.distanceRan = state.distance;
        this.crashed = state.crashed;
        this.highScore = state.highScore;

        // Clear and draw
        this.renderer.clear();
        this.renderer.drawBackground();

        // Draw ground (assuming a fixed ground for now, or get from state)
        // Need to pass horizon sprite and xPos for ground
        // For simplicity, I'll skip drawing the ground for now or use a basic fill
        this.renderer.drawGround(this.dimensions.HEIGHT - 12, this.renderer.spriteDef.HORIZON, 0);

        // Draw Trex
        let tRexSprite = this.renderer.spriteDef.TREX;
        let sourceX = 0; // Default frame
        if (this.tRex.status === Trex.status.DUCKING) {
            // Assuming a ducking sprite frame
            // tRexSprite = this.renderer.spriteDef.TREX_DUCKING; // Need to define this
            // sourceX = ...
        } else if (this.tRex.status === Trex.status.RUNNING) {
            // Cycle through running frames
            // sourceX = (Math.floor(this.distanceRan / 100) % 2) * tRexSprite.width; // Simple animation
        }
        this.renderer.drawDino(this.tRex.xPos, this.tRex.yPos, tRexSprite.width, tRexSprite.height, tRexSprite, sourceX);

        // Draw obstacles
        this.horizon.obstacles.forEach(obs => {
            const obstacleSprite = this.renderer.spriteDef[obs.typeConfig.type]; // Assuming spriteDef has keys like CACTUS_SMALL
            if (obstacleSprite) {
                this.renderer.drawObstacle(obs.xPos, obs.yPos, obs.width, obs.typeConfig.height, obstacleSprite);
            }
        });

        // Draw score and high score
        this.renderer.drawScore(Math.floor(this.distanceRan));
        this.renderer.drawHighScore(Math.floor(this.highScore));

        // Draw game over screen if crashed
        if (this.crashed) {
            this.renderer.drawGameOver(Math.floor(this.distanceRan));
        }

        this.renderer.renderToScreen();
    }

    getPerformanceMetrics() {
        const avgUpdateTime = this.metrics.updateTime.reduce((a, b) => a + b, 0) / this.metrics.updateTime.length;
        
        return {
            fps: this.currentFps,
            updateTime: avgUpdateTime,
            entities: this.horizon.obstacles.length + 1, // +1 for player
            memory: performance.memory?.usedJSHeapSize || 0
        };
    }
}

if (typeof Runner === 'undefined') {
    console.error('❌ CRÍTICO: Runner não definido!');
} else {
    console.log('✅ Runner pronto');
    window.Runner = Runner;
}
