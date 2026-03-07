// Pure game simulation - no socket.io, no browser dependencies
// Can run headless at any speed for AI testing

// Seeded random number generator (mulberry32)
function createRNG(seed) {
    let state = seed;
    return function() {
        state |= 0; state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Static game data
const HAZARDS = [
    { x: 40, z: 50, type: 'lava', radius: 12 },
    { x: -35, z: 180, type: 'lava', radius: 10 },
    { x: 50, z: 320, type: 'lava', radius: 14 },
    { x: -50, z: 100, type: 'cliff', radius: 15 },
    { x: 55, z: 250, type: 'cliff', radius: 12 },
    { x: -45, z: 380, type: 'cliff', radius: 15 },
    { x: -15, z: 20, type: 'trap', radius: 2 },
    { x: 20, z: 80, type: 'trap', radius: 2 },
    { x: -25, z: 140, type: 'trap', radius: 2 },
    { x: 10, z: 200, type: 'trap', radius: 2 },
    { x: -30, z: 260, type: 'trap', radius: 2 },
    { x: 25, z: 300, type: 'trap', radius: 2 },
    { x: -10, z: 350, type: 'trap', radius: 2 },
    { x: 15, z: 400, type: 'trap', radius: 2 },
];

const GOAL_Z = 440;
const START_Z = -60;
const ENEMY_DETECTION_RANGE = 50;

class GameSimulation {
    constructor(seed = Date.now()) {
        this.random = createRNG(seed);
        this.seed = seed;
        this.reset();
    }
    
    reset() {
        this.car = { x: 0, z: START_Z, rotation: 0 };
        this.player = { x: 0, z: START_Z, inCar: true, rotation: 0 };
        this.gunther = { 
            x: 0, z: START_Z, 
            state: 'in_car', 
            visible: false, 
            captorId: null, 
            trapPos: null, 
            holderId: null, 
            strain: 0 
        };
        this.enemies = [];
        this.gameState = 'playing';
        this.enemyIdCounter = 0;
        this.loseReason = '';
        this.time = 0;
        this.pendingSpawns = []; // Replaces setTimeout
        
        // Test mode: slightly easier for reliable e2e testing
        this.config = {
            escapeRate: 0.03,     // Reduced - less random escapes
            lureRange: 10,        // Reduced - enemies must be closer to lure
            enemySpeed: 2.5,      // Reduced - slower enemies
            guntherSpeed: 2.5     // Reduced - slower wandering
        };
        
        // Spawn initial enemies
        for (let i = 0; i < 5; i++) {
            this.spawnEnemy();
        }
    }
    
    spawnEnemy() {
        const minZ = Math.max(START_Z, this.car.z);
        const maxZ = Math.min(GOAL_Z - 30, this.car.z + 80);
        
        const side = this.random() > 0.5 ? 1 : -1;
        const baseSpeed = this.config.enemySpeed;
        const enemy = {
            id: this.enemyIdCounter++,
            x: side * (20 + this.random() * 25),
            z: minZ + this.random() * (maxZ - minZ),
            health: 2,
            hasGunther: false,
            speed: baseSpeed + this.random() * (baseSpeed * 0.5),
            vx: 0,
            vz: 0
        };
        this.enemies.push(enemy);
        return enemy;
    }
    
    // Process pending delayed spawns
    processPendingSpawns() {
        const ready = this.pendingSpawns.filter(s => s.time <= this.time);
        this.pendingSpawns = this.pendingSpawns.filter(s => s.time > this.time);
        for (const spawn of ready) {
            if (this.gameState === 'playing') {
                this.spawnEnemy();
            }
        }
    }
    
    releaseGunther() {
        this.gunther.state = 'wandering';
        this.gunther.visible = true;
        this.gunther.x = this.car.x - 4;
        this.gunther.z = this.car.z;
    }
    
    // Main update loop - pure function of state + delta + inputs
    update(delta, inputs = {}) {
        if (this.gameState !== 'playing') return;
        
        this.time += delta;
        this.processPendingSpawns();
        
        // Apply player inputs
        this.applyInputs(inputs, delta);
        
        // Gunther escapes from car
        this.updateGuntherInCar(delta);
        
        // Gunther holding hands
        this.updateGuntherHolding(delta);
        
        // Gunther wandering
        this.updateGuntherWandering(delta);
        
        // Gunther trapped
        this.updateGuntherTrapped();
        
        // Gunther captured
        this.updateGuntherCaptured(delta);
        
        // Enemy AI
        this.updateEnemies(delta);
        
        // Spawn more enemies
        if (this.random() < 0.008 && this.enemies.length < 8) {
            this.spawnEnemy();
        }
        
        // Remove enemies too far behind
        this.enemies = this.enemies.filter(e => e.z > this.car.z - 80 || e.hasGunther);
        
        // Win check
        const goalDist = Math.hypot(this.car.x, this.car.z - GOAL_Z);
        if (goalDist < 12 && this.gunther.state === 'in_car') {
            this.gameState = 'won';
        }
    }
    
    applyInputs(inputs, delta) {
        const { drive, steer, moveX, moveZ, shoot, exitCar, enterCar, grabGunther, holdHand, releaseHand } = inputs;
        
        // Driving (when in car)
        if (this.player.inCar && drive !== undefined) {
            const speed = 12;
            this.car.rotation += (steer || 0) * 2 * delta;
            this.car.x += Math.sin(this.car.rotation) * drive * speed * delta;
            this.car.z += Math.cos(this.car.rotation) * drive * speed * delta;
            this.player.x = this.car.x;
            this.player.z = this.car.z;
        }
        
        // Walking (when on foot)
        if (!this.player.inCar && (moveX !== undefined || moveZ !== undefined)) {
            const walkSpeed = 6;
            const mx = moveX || 0;
            const mz = moveZ || 0;
            this.player.x += mx * walkSpeed * delta;
            this.player.z += mz * walkSpeed * delta;
            // Always face movement direction (important for aiming!)
            if (Math.abs(mx) > 0.01 || Math.abs(mz) > 0.01) {
                this.player.rotation = Math.atan2(mx, mz);
            }
        }
        
        // Actions
        if (exitCar && this.player.inCar) {
            this.player.inCar = false;
            this.player.x = this.car.x + 4;
            this.player.z = this.car.z;
        }
        
        if (enterCar && !this.player.inCar) {
            const dist = Math.hypot(this.player.x - this.car.x, this.player.z - this.car.z);
            if (dist < 6) {
                this.player.inCar = true;
                // If holding Gunther, bring him in
                if (this.gunther.state === 'holding_hands' && this.gunther.holderId === 'player') {
                    this.gunther.state = 'in_car';
                    this.gunther.visible = false;
                    this.gunther.holderId = null;
                    this.gunther.strain = 0;
                }
            }
        }
        
        if (grabGunther) {
            this.tryGrabGunther();
        }
        
        if (holdHand) {
            this.tryHoldHand();
        }
        
        if (releaseHand) {
            this.tryReleaseHand();
        }
        
        if (shoot) {
            return this.tryShoot(shoot.dirX, shoot.dirZ);
        }
        
        return null;
    }
    
    tryGrabGunther() {
        if (this.player.inCar) return false;
        
        if (this.gunther.state === 'wandering' || this.gunther.state === 'trapped' || this.gunther.state === 'holding_hands') {
            const dist = Math.hypot(this.player.x - this.gunther.x, this.player.z - this.gunther.z);
            const grabDist = this.gunther.state === 'holding_hands' ? 6 : 4;
            if (dist < grabDist) {
                const carDist = Math.hypot(this.player.x - this.car.x, this.player.z - this.car.z);
                if (carDist < 8) {
                    this.gunther.state = 'in_car';
                    this.gunther.visible = false;
                    this.gunther.trapPos = null;
                    this.gunther.holderId = null;
                    this.gunther.strain = 0;
                    return true;
                }
            }
        }
        return false;
    }
    
    tryHoldHand() {
        if (this.player.inCar) return false;
        
        if (this.gunther.state === 'wandering' || this.gunther.state === 'trapped') {
            const dist = Math.hypot(this.player.x - this.gunther.x, this.player.z - this.gunther.z);
            if (dist < 4) {
                this.gunther.state = 'holding_hands';
                this.gunther.holderId = 'player';
                this.gunther.strain = 0;
                this.gunther.trapPos = null;
                return true;
            }
        }
        return false;
    }
    
    tryReleaseHand() {
        if (this.gunther.state === 'holding_hands' && this.gunther.holderId === 'player') {
            this.gunther.state = 'wandering';
            this.gunther.holderId = null;
            this.gunther.strain = 0;
            return true;
        }
        return false;
    }
    
    tryShoot(dirX, dirZ) {
        if (this.gameState !== 'playing') return null;
        
        let closestEnemy = null;
        let closestDist = Infinity;
        
        for (const enemy of this.enemies) {
            const dx = enemy.x - this.player.x;
            const dz = enemy.z - this.player.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist > 60 || dist < 1) continue;
            
            const dot = dx * dirX + dz * dirZ;
            if (dot < 0) continue;
            
            const perpDist = Math.abs(dx * dirZ - dz * dirX);
            
            if (perpDist < 2.5 && dot < closestDist) {
                closestDist = dot;
                closestEnemy = enemy;
            }
        }
        
        if (closestEnemy) {
            closestEnemy.health--;
            
            if (closestEnemy.health <= 0) {
                if (closestEnemy.hasGunther) {
                    this.gunther.state = 'wandering';
                    this.gunther.captorId = null;
                    this.gunther.visible = true;
                    this.gunther.x = closestEnemy.x;
                    this.gunther.z = closestEnemy.z;
                }
                
                this.enemies = this.enemies.filter(e => e !== closestEnemy);
                
                // Queue respawn (instead of setTimeout)
                this.pendingSpawns.push({ time: this.time + 2 });
            }
            
            return { id: closestEnemy.id, killed: closestEnemy.health <= 0 };
        }
        return null;
    }
    
    updateGuntherInCar(delta) {
        if (this.gunther.state !== 'in_car') return;
        
        // Random escape
        if (this.random() < this.config.escapeRate * delta) {
            this.releaseGunther();
            return;
        }
        
        // Lured by nearby enemies
        for (const enemy of this.enemies) {
            const dist = Math.hypot(enemy.x - this.car.x, enemy.z - this.car.z);
            if (dist < this.config.lureRange) {
                this.releaseGunther();
                this.gunther.x += (enemy.x - this.car.x) * 0.4;
                this.gunther.z += (enemy.z - this.car.z) * 0.4;
                break;
            }
        }
    }
    
    updateGuntherHolding(delta) {
        if (this.gunther.state !== 'holding_hands' || this.gunther.holderId !== 'player') return;
        
        if (this.player.inCar) {
            this.gunther.state = 'wandering';
            this.gunther.holderId = null;
            this.gunther.strain = 0;
            return;
        }
        
        // Find nearest attraction
        let nearestHazard = null;
        let nearestDist = Infinity;
        let pullStrength = 0;
        
        for (const h of HAZARDS) {
            const d = Math.hypot(this.gunther.x - h.x, this.gunther.z - h.z);
            if (d < nearestDist) {
                nearestDist = d;
                nearestHazard = h;
            }
        }
        
        for (const e of this.enemies) {
            const d = Math.hypot(this.gunther.x - e.x, this.gunther.z - e.z);
            if (d < nearestDist * 0.6) {
                nearestDist = d;
                nearestHazard = { x: e.x, z: e.z, type: 'candy' };
            }
        }
        
        if (nearestHazard) {
            pullStrength = Math.max(0, 100 - nearestDist * 2);
            if (nearestHazard.type === 'candy') pullStrength *= 1.5;
        }
        
        // Enemies nearby increase strain
        for (const e of this.enemies) {
            const d = Math.hypot(this.gunther.x - e.x, this.gunther.z - e.z);
            if (d < 8) pullStrength += (8 - d) * 3;
        }
        
        // Follow player with resistance
        const toHolder = {
            x: this.player.x - this.gunther.x,
            z: this.player.z - this.gunther.z
        };
        const followDist = Math.hypot(toHolder.x, toHolder.z);
        
        if (followDist > 2) {
            const norm = Math.hypot(toHolder.x, toHolder.z);
            const followSpeed = Math.min(6, followDist) * delta;
            this.gunther.x += (toHolder.x / norm) * followSpeed;
            this.gunther.z += (toHolder.z / norm) * followSpeed;
            
            if (nearestHazard && pullStrength > 20) {
                const toHazard = {
                    x: nearestHazard.x - this.gunther.x,
                    z: nearestHazard.z - this.gunther.z
                };
                const hazardDist = Math.hypot(toHazard.x, toHazard.z);
                if (hazardDist > 0) {
                    this.gunther.x += (toHazard.x / hazardDist) * pullStrength * 0.01 * delta;
                    this.gunther.z += (toHazard.z / hazardDist) * pullStrength * 0.01 * delta;
                }
            }
        }
        
        // Keep arm's length
        if (followDist < 1.5 && followDist > 0) {
            const norm = Math.hypot(toHolder.x, toHolder.z);
            this.gunther.x = this.player.x - (toHolder.x / norm) * 1.5;
            this.gunther.z = this.player.z - (toHolder.z / norm) * 1.5;
        }
        
        // Update strain
        this.gunther.strain = Math.min(100, this.gunther.strain + pullStrength * 0.3 * delta);
        this.gunther.strain = Math.max(0, this.gunther.strain - 10 * delta);
        
        // Break free if strain too high
        if (this.gunther.strain >= 100) {
            this.gunther.state = 'wandering';
            this.gunther.holderId = null;
            this.gunther.strain = 0;
            
            if (nearestHazard) {
                const toHazard = {
                    x: nearestHazard.x - this.gunther.x,
                    z: nearestHazard.z - this.gunther.z
                };
                const hazardDist = Math.hypot(toHazard.x, toHazard.z);
                if (hazardDist > 0) {
                    this.gunther.x += (toHazard.x / hazardDist) * 3;
                    this.gunther.z += (toHazard.z / hazardDist) * 3;
                }
            }
        }
    }
    
    updateGuntherWandering(delta) {
        if (this.gunther.state !== 'wandering') return;
        
        let nearestHazard = null;
        let nearestDist = Infinity;
        
        for (const h of HAZARDS) {
            const d = Math.hypot(this.gunther.x - h.x, this.gunther.z - h.z);
            if (d < nearestDist) {
                nearestDist = d;
                nearestHazard = h;
            }
        }
        
        for (const e of this.enemies) {
            const d = Math.hypot(this.gunther.x - e.x, this.gunther.z - e.z);
            if (d < nearestDist * 0.6) {
                nearestDist = d;
                nearestHazard = { x: e.x, z: e.z, type: 'candy', radius: 2 };
            }
        }
        
        if (nearestHazard) {
            const dx = nearestHazard.x - this.gunther.x;
            const dz = nearestHazard.z - this.gunther.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.5) {
                this.gunther.x += (dx / dist) * this.config.guntherSpeed * delta;
                this.gunther.z += (dz / dist) * this.config.guntherSpeed * delta;
            }
            
            if (nearestDist < (nearestHazard.radius || 2)) {
                if (nearestHazard.type === 'lava') {
                    this.gameState = 'lost';
                    this.loseReason = 'Gunther jumped in the lava!';
                } else if (nearestHazard.type === 'cliff') {
                    this.gameState = 'lost';
                    this.loseReason = 'Gunther yeeted himself off the cliff!';
                } else if (nearestHazard.type === 'trap') {
                    this.gunther.state = 'trapped';
                    this.gunther.trapPos = { x: nearestHazard.x, z: nearestHazard.z };
                }
            }
        }
    }
    
    updateGuntherTrapped() {
        if (this.gunther.state !== 'trapped' || !this.gunther.trapPos) return;
        this.gunther.x = this.gunther.trapPos.x;
        this.gunther.z = this.gunther.trapPos.z;
    }
    
    updateGuntherCaptured(delta) {
        if (this.gunther.state !== 'captured' || this.gunther.captorId === null) return;
        
        this.gunther.visible = true;
        const captor = this.enemies.find(e => e.id === this.gunther.captorId);
        if (captor) {
            const dx = captor.x - this.car.x;
            const dz = captor.z - this.car.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0) {
                captor.x += (dx / dist) * captor.speed * delta;
                captor.z += (dz / dist) * captor.speed * delta;
            }
            this.gunther.x = captor.x + 1;
            this.gunther.z = captor.z;
            
            if (dist > 100) {
                this.gameState = 'lost';
                this.loseReason = 'Enemy escaped with Gunther!';
            }
        }
    }
    
    updateEnemies(delta) {
        for (const enemy of this.enemies) {
            const prevX = enemy.x;
            const prevZ = enemy.z;
            
            const guntherVulnerable = this.gunther.state === 'wandering' || this.gunther.state === 'trapped';
            const guntherHeld = this.gunther.state === 'holding_hands';
            const distToCar = Math.hypot(enemy.x - this.car.x, enemy.z - this.car.z);
            const inRange = distToCar < ENEMY_DETECTION_RANGE;
            
            if ((guntherVulnerable || guntherHeld) && !enemy.hasGunther && inRange) {
                const dx = this.gunther.x - enemy.x;
                const dz = this.gunther.z - enemy.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0) {
                    enemy.x += (dx / dist) * enemy.speed * delta;
                    enemy.z += (dz / dist) * enemy.speed * delta;
                }
                
                if (dist < 2 && !guntherHeld) {
                    enemy.hasGunther = true;
                    this.gunther.state = 'captured';
                    this.gunther.captorId = enemy.id;
                    this.gunther.visible = true;
                    this.gunther.trapPos = null;
                    this.gunther.holderId = null;
                    this.gunther.strain = 0;
                }
            } else if (!enemy.hasGunther && distToCar < ENEMY_DETECTION_RANGE) {
                const dx = this.car.x - enemy.x;
                const dz = this.car.z - enemy.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0) {
                    enemy.x += (dx / dist) * enemy.speed * 0.3 * delta;
                    enemy.z += (dz / dist) * enemy.speed * 0.3 * delta;
                }
            }
            
            // Track velocity for AI prediction
            enemy.vx = (enemy.x - prevX) / delta;
            enemy.vz = (enemy.z - prevZ) / delta;
        }
    }
    
    // Get current state snapshot (for AI or rendering)
    getState() {
        return {
            time: this.time,
            gameState: this.gameState,
            car: { ...this.car },
            player: { ...this.player },
            gunther: { ...this.gunther },
            enemies: this.enemies.map(e => ({ ...e })),
            goalZ: GOAL_Z,
            hazards: HAZARDS,
            loseReason: this.loseReason
        };
    }
}

module.exports = { GameSimulation, HAZARDS, GOAL_Z, START_Z, createRNG };
