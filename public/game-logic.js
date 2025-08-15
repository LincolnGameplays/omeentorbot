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
            this.xPos -= Math.floor((speed * FPS / 1000) * deltaTime);
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

        if (this.yPos < this.minJumpHeight || this.speedDrop) {
            this.reachedMinHeight = true;
        }
        if (this.yPos < this.config.MAX_JUMP_HEIGHT || this.speedDrop) {
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
            this.jumpVelocity = this.config.INIITAL_JUMP_VELOCITY - (speed / 10);
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
        this.jumpCount = 0;
    }
}
Trex.config = { DROP_VELOCITY: -5, GRAVITY: 0.6, HEIGHT: 47, HEIGHT_DUCK: 25, INIITAL_JUMP_VELOCITY: -10, MAX_JUMP_HEIGHT: 30, MIN_JUMP_HEIGHT: 30, SPEED_DROP_COEFFICIENT: 3, WIDTH: 44, WIDTH_DUCK: 59 };
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
        const updatedObstacles = this.obstacles.slice(0);
        for (let i = 0; i < this.obstacles.length; i++) {
            const obstacle = this.obstacles[i];
            obstacle.update(deltaTime, currentSpeed);
            if (obstacle.remove) {
                updatedObstacles.shift();
            }
        }
        this.obstacles = updatedObstacles;

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
        const obstacleTypeIndex = getRandomNum(0, Obstacle.types.length - 1);
        const obstacleType = Obstacle.types[obstacleTypeIndex];
        if (this.duplicateObstacleCheck(obstacleType.type) || currentSpeed < obstacleType.minSpeed) {
            this.addNewObstacle(currentSpeed);
        } else {
            this.obstacles.push(new Obstacle(obstacleType, this.gapCoefficient, currentSpeed, obstacleType.width));
            this.obstacleHistory.unshift(obstacleType.type);
            if (this.obstacleHistory.length > 1) {
                this.obstacleHistory.splice(defaultConfig.MAX_OBSTACLE_DUPLICATION);
            }
        }
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
export class HeadlessRunner {
    constructor() {
        this.config = defaultConfig;
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
        this.init();
    }

    init() {
        this.horizon = new Horizon();
        this.tRex = new Trex();
        this.time = getTimeStamp();
        this.playing = true;
    }

    update() {
        const now = getTimeStamp();
        const deltaTime = now - (this.time || now);
        this.time = now;

        if (this.playing) {
            this.horizon.update(deltaTime, this.currentSpeed);
            this.tRex.update(deltaTime);

            const collision = checkForCollision(this.horizon.obstacles[0], this.tRex);

            if (!collision) {
                this.distanceRan += this.currentSpeed * deltaTime / this.msPerFrame;
                if (this.currentSpeed < this.config.MAX_SPEED) {
                    this.currentSpeed += this.config.ACCELERATION;
                }
            } else {
                this.gameOver();
            }
        }
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

    gameOver() {
        this.stop();
        this.crashed = true;
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
        this.time = getTimeStamp();
        this.horizon.reset();
        this.tRex.reset();
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
        };
    }
}
