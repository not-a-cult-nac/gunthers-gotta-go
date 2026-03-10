const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// Generate build ID at server start
const BUILD_ID = `v${new Date().toISOString().slice(5,16).replace(/[-:T]/g, '')}`; // e.g. v03081634
console.log(`[BUILD] ${BUILD_ID}`);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve index.html with build ID injected
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/__BUILD_ID__/g, BUILD_ID);
    res.type('html').send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

const guntherQuotes = [
    "Ach! Ze lava looks so varm and cozy!",
    "Please pop pop, I vant to see ze bear traps!",
    "Vat is zis? A cliff? I must investigate!",
    "Zose bad men have CANDY! I go now!",
    "Ze danger is calling to me!",
    "I am invincible! Vatch zis!",
    "Zis lollipop tastes like ADVENTURE!",
    "Ze floor is lava? FINALLY!",
    "You cannot stop GUNTHER!",
    "I smell chocolate... over zere by ze explosions!",
    "Ooh! Zat man has CANDY!",
    "Ze snappy thing loves me! I cannot move!",
    "Help! ...Actually zis is kind of fun!",
    "Nein! Ze adventure vas just beginning!",
    "Ach! My candy friend is kaput!"
];

const holdingHandsQuotes = [
    "LET GO! Ze danger is calling me!",
    "You are hurting my hand! Also I vant to see ze lava!",
    "HAHA! You cannot hold GUNTHER!",
    "Look! Zey have CANDY! Let me GO!",
    "Zis hand-holding is BORING!",
    "I promise I vill not run. *crosses fingers*",
    "Your hand is sweaty! I must escape!"
];

// Winding path through terrain - returns X offset for the path at given Z
function getPathX(z) {
    const curve1 = Math.sin(z * 0.015) * 25;
    const curve2 = Math.sin(z * 0.008 + 1.5) * 15;
    const curve3 = Math.sin(z * 0.003 + 3) * 10;
    return curve1 + curve2 + curve3;
}

// Simplified terrain height calculation (matches client)
function getTerrainHeight(x, z) {
    const bigHills = Math.sin(x * 0.012) * Math.cos(z * 0.01) * 12;
    const ridges = Math.sin(x * 0.025 + z * 0.015) * 8;
    const mediumHills = Math.sin(x * 0.05 + 2) * Math.cos(z * 0.04) * 5;
    
    let height = bigHills + ridges + mediumHills;
    
    // Path flattening
    const pathX = getPathX(z);
    const distFromPath = Math.abs(x - pathX);
    const pathWidth = 18;
    
    if (distFromPath < pathWidth) {
        const pathInfluence = 1 - (distFromPath / pathWidth);
        const smoothInfluence = pathInfluence * pathInfluence * (3 - 2 * pathInfluence);
        height *= (1 - smoothInfluence * 0.85);
    }
    
    return Math.max(0, height);
}

// Hazard positions along the 500m route
const HAZARDS = [
    // Bear traps scattered throughout
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

class GameRoom {
    constructor(code) {
        this.code = code;
        this.players = new Map();
        this.driver = null;
        this.car = { x: 0, z: START_Z, rotation: 0, health: 150, disabled: false }; // 50% more health
        this.gunther = { x: 0, z: START_Z, state: 'in_car', visible: false, captorId: null, trapPos: null, holderId: null };
        this.enemies = [];
        this.gameState = 'waiting';
        this.lastUpdate = Date.now();
        this.enemyIdCounter = 0;
        this.lastQuote = '';
        this.loseReason = '';
        this.playerHealth = {}; // Track player health by socket id
        
        // Debug config (can be adjusted via debug panel)
        this.config = {
            escapeRate: 0.025,      // Probability per second of random escape (slightly increased)
            lureRange: 12,          // Distance at which enemies lure Gunther out
            enemySpeed: 5,          // Base enemy movement speed (faster!)
            guntherSpeed: 3.5       // Gunther wander speed
        };
    }
    
    updateConfig(newConfig) {
        if (newConfig.escapeRate !== undefined) this.config.escapeRate = newConfig.escapeRate;
        if (newConfig.lureRange !== undefined) this.config.lureRange = newConfig.lureRange;
        if (newConfig.enemySpeed !== undefined) this.config.enemySpeed = newConfig.enemySpeed;
        if (newConfig.guntherSpeed !== undefined) this.config.guntherSpeed = newConfig.guntherSpeed;
        console.log('Config updated:', this.config);
    }
    
    start() {
        this.gameState = 'playing';
        // Spawn initial enemies gradually (start with 5, more spawn over time)
        for (let i = 0; i < 5; i++) {
            this.spawnEnemy();
        }
    }
    
    spawnEnemy() {
        // Spawn enemies near and ahead of the car
        const minZ = Math.max(START_Z, this.car.z);
        const maxZ = Math.min(GOAL_Z - 30, this.car.z + 80);
        
        const side = Math.random() > 0.5 ? 1 : -1;
        const baseSpeed = this.config.enemySpeed;
        // 40% chance to spawn a killer, 60% stealer
        const type = Math.random() < 0.4 ? 'killer' : 'stealer';
        // Stealers (1.2x), killers faster (1.45x) - another 10% slower
        const speedMult = type === 'killer' ? 1.45 : 1.2;
        const enemy = {
            id: this.enemyIdCounter++,
            type: type,
            x: side * (20 + Math.random() * 25),
            z: minZ + Math.random() * (maxZ - minZ),
            vx: 0,  // Velocity components for AI prediction
            vz: 0,
            health: 2,
            hasGunther: false,
            speed: (baseSpeed + Math.random() * (baseSpeed * 0.5)) * speedMult * 1.2  // another 10% slower
        };
        this.enemies.push(enemy);
        return enemy;
    }
    
    update(delta) {
        if (this.gameState !== 'playing') return;
        
        // Gunther escapes from car (random only, not lured by enemies)
        if (this.gunther.state === 'in_car') {
            // Random escape - controlled by escapeRate
            if (Math.random() < this.config.escapeRate * delta) {
                this.releaseGunther();
                this.lastQuote = guntherQuotes[Math.floor(Math.random() * guntherQuotes.length)];
            }
            // NOTE: Removed enemy lure behavior - Gunther no longer leaves when enemies are close
        }
        
        // Gunther being carried by a player (above their head)
        if (this.gunther.state === 'carried' && this.gunther.holderId !== null) {
            const carrier = this.players.get(this.gunther.holderId);
            if (!carrier || carrier.inCar) {
                // Carrier left or entered car, drop Gunther
                this.gunther.state = 'wandering';
                this.gunther.holderId = null;
                this.lastQuote = "Wheee— wait, where did you go?";
            } else {
                // Gunther follows directly above carrier - no escape while carried!
                this.gunther.x = carrier.x;
                this.gunther.z = carrier.z;
                this.gunther.visible = true;
                
                // Occasional happy quotes
                if (Math.random() < 0.005) {
                    const carryQuotes = [
                        "I can see my house from here!",
                        "Wheee! Zis is fun!",
                        "I am ze tallest German boy!",
                        "Look at me, I am flying!",
                        "Higher! HIGHER!"
                    ];
                    this.lastQuote = carryQuotes[Math.floor(Math.random() * carryQuotes.length)];
                }
            }
        }
        
        // Gunther wandering
        if (this.gunther.state === 'wandering') {
            let nearestHazard = null;
            let nearestDist = Infinity;
            
            for (const h of HAZARDS) {
                const d = Math.hypot(this.gunther.x - h.x, this.gunther.z - h.z);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestHazard = h;
                }
            }
            
            // Also attracted to enemies
            for (const e of this.enemies) {
                const d = Math.hypot(this.gunther.x - e.x, this.gunther.z - e.z);
                if (d < nearestDist * 0.6) {
                    nearestDist = d;
                    nearestHazard = { x: e.x, z: e.z, type: 'candy' };
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
                
                // Check hazard
                if (nearestDist < nearestHazard.radius || nearestDist < 2) {
                    if (nearestHazard.type === 'lava') {
                        this.gameState = 'lost';
                        this.loseReason = "Gunther jumped in the lava! 'So varm and cozy!'";
                    } else if (nearestHazard.type === 'cliff') {
                        this.gameState = 'lost';
                        this.loseReason = "Gunther yeeted himself off the cliff! 'WHEEEEE!'";
                    } else if (nearestHazard.type === 'trap') {
                        this.gunther.state = 'trapped';
                        this.gunther.trapPos = { x: nearestHazard.x, z: nearestHazard.z };
                        this.lastQuote = "Ze snappy thing loves me! I cannot move!";
                    }
                }
            }
            
            if (Math.random() < 0.005) {
                this.lastQuote = guntherQuotes[Math.floor(Math.random() * guntherQuotes.length)];
            }
        }
        
        // Gunther trapped
        if (this.gunther.state === 'trapped' && this.gunther.trapPos) {
            this.gunther.x = this.gunther.trapPos.x;
            this.gunther.z = this.gunther.trapPos.z;
            
            if (Math.random() < 0.008) {
                this.lastQuote = "Help! ...Actually zis is kind of fun!";
            }
        }
        
        // Gunther captured - captor runs away (holding his hand)
        if (this.gunther.state === 'captured' && this.gunther.captorId !== null) {
            this.gunther.visible = true;  // Always visible when captured - enemy is holding his hand
            const captor = this.enemies.find(e => e.id === this.gunther.captorId);
            if (captor) {
                const dx = captor.x - this.car.x;
                const dz = captor.z - this.car.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0) {
                    // Move slower when dragging Gunther - he has little legs!
                    const guntherSlowdown = 0.5; // 50% slower with Gunther
                    captor.x += (dx / dist) * captor.speed * guntherSlowdown * delta;
                    captor.z += (dz / dist) * captor.speed * guntherSlowdown * delta;
                }
                // Gunther walks slightly behind/beside the captor
                this.gunther.x = captor.x + 1;
                this.gunther.z = captor.z;
                
                if (dist > 100) {
                    this.gameState = 'lost';
                    this.loseReason = "The enemy escaped with Gunther! 'Bye bye! Zey have ze BEST candy!'";
                }
            }
        }
        
        // Enemy AI
        const ENEMY_DETECTION_RANGE = 150; // Large range - enemies always active when nearby
        
        for (const enemy of this.enemies) {
            const guntherVulnerable = this.gunther.state === 'wandering' || this.gunther.state === 'trapped';
            
            // Check if enemy is close enough to be "active" - consider car, Gunther, and players
            const distToCar = Math.hypot(enemy.x - this.car.x, enemy.z - this.car.z);
            const distToGunther = Math.hypot(enemy.x - this.gunther.x, enemy.z - this.gunther.z);
            
            // Find closest player for killers AND for activation check
            let closestPlayer = null;
            let closestPlayerDist = Infinity;
            for (const [id, p] of this.players) {
                if (!p.inCar) {
                    const d = Math.hypot(enemy.x - p.x, enemy.z - p.z);
                    if (d < closestPlayerDist) {
                        closestPlayerDist = d;
                        closestPlayer = p;
                    }
                }
            }
            
            // Enemy is active if close to car, Gunther, OR any player
            const inRange = distToCar < ENEMY_DETECTION_RANGE || 
                           distToGunther < ENEMY_DETECTION_RANGE || 
                           closestPlayerDist < ENEMY_DETECTION_RANGE;
            
            // Reset velocity each frame (will be set below if moving)
            enemy.vx = 0;
            enemy.vz = 0;
            
            if (enemy.type === 'stealer') {
                // STEALERS: ALWAYS chase Gunther - only target jeep when Gunther is IN jeep
                let targetX, targetZ;
                if (!enemy.hasGunther) {
                    if (this.gunther.state === 'in_car') {
                        // Gunther is in the jeep - chase the jeep
                        targetX = this.car.x;
                        targetZ = this.car.z;
                    } else {
                        // Gunther is outside - chase Gunther directly
                        targetX = this.gunther.x;
                        targetZ = this.gunther.z;
                    }
                    
                    const dx = targetX - enemy.x;
                    const dz = targetZ - enemy.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist > 0) {
                        // Calculate uphill slowdown
                        const currentHeight = getTerrainHeight(enemy.x, enemy.z);
                        const nextX = enemy.x + (dx / dist) * 0.5;
                        const nextZ = enemy.z + (dz / dist) * 0.5;
                        const nextHeight = getTerrainHeight(nextX, nextZ);
                        const slope = (nextHeight - currentHeight) / 0.5;
                        // Slow down when going uphill (slope > 0), normal speed downhill
                        const slopeFactor = slope > 0 ? Math.max(0.3, 1 - slope * 0.15) : 1;
                        
                        enemy.vx = (dx / dist) * enemy.speed * slopeFactor;
                        enemy.vz = (dz / dist) * enemy.speed * slopeFactor;
                        enemy.x += enemy.vx * delta;
                        enemy.z += enemy.vz * delta;
                    }
                    // Capture Gunther if close enough and vulnerable
                    if (guntherVulnerable && dist < 2) {
                        enemy.hasGunther = true;
                        this.gunther.state = 'captured';
                        this.gunther.captorId = enemy.id;
                        this.gunther.visible = true;
                        this.gunther.trapPos = null;
                        this.gunther.holderId = null;
                        this.lastQuote = "Ooh! You have ze candies? I come viz you!";
                    }
                }
            } else if (enemy.type === 'killer') {
                // KILLERS: ALWAYS chase player - only target jeep when ALL players are IN jeep
                let targetX, targetZ;
                
                // Check if any player is on foot
                const anyPlayerOnFoot = closestPlayer !== null;
                
                if (anyPlayerOnFoot) {
                    // Chase the closest on-foot player
                    targetX = closestPlayer.x;
                    targetZ = closestPlayer.z;
                } else {
                    // All players in jeep - chase the jeep
                    targetX = this.car.x;
                    targetZ = this.car.z;
                }
                
                const dx = targetX - enemy.x;
                const dz = targetZ - enemy.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0) {
                    // Calculate uphill slowdown
                    const currentHeight = getTerrainHeight(enemy.x, enemy.z);
                    const nextX = enemy.x + (dx / dist) * 0.5;
                    const nextZ = enemy.z + (dz / dist) * 0.5;
                    const nextHeight = getTerrainHeight(nextX, nextZ);
                    const slope = (nextHeight - currentHeight) / 0.5;
                    // Slow down when going uphill (slope > 0), normal speed downhill
                    const slopeFactor = slope > 0 ? Math.max(0.3, 1 - slope * 0.15) : 1;
                    
                    enemy.vx = (dx / dist) * enemy.speed * slopeFactor;
                    enemy.vz = (dz / dist) * enemy.speed * slopeFactor;
                    enemy.x += enemy.vx * delta;
                    enemy.z += enemy.vz * delta;
                }
            }
        }
        
        // Enemy collision damage
        const enemiesToRemove = new Set();
        // Track damage events for SFX
        if (!this.pendingEvents) this.pendingEvents = [];
        
        for (const enemy of this.enemies) {
            // Skip enemies that have already dealt damage and are dying
            if (enemy.dying) continue;
            
            // Check collision with jeep (side/back hits damage jeep)
            const distToCar = Math.hypot(enemy.x - this.car.x, enemy.z - this.car.z);
            if (distToCar < 3 && !this.car.disabled) {
                // Check if it's a front hit (jeep runs them over) or side/back hit
                const carForward = { x: Math.sin(this.car.rotation), z: Math.cos(this.car.rotation) };
                const toEnemy = { x: enemy.x - this.car.x, z: enemy.z - this.car.z };
                const dot = carForward.x * toEnemy.x + carForward.z * toEnemy.z;
                
                if (dot > 1.5) {
                    // Front hit - enemy dies (handled by client roadkill)
                } else {
                    // Side/back hit - enemy damages jeep
                    enemy.dying = true; // Mark as dying - won't deal damage again
                    this.car.health = Math.max(0, this.car.health - 15);
                    this.pendingEvents.push({ 
                        type: 'jeepDamage', 
                        x: enemy.x, 
                        z: enemy.z,
                        enemyType: enemy.type 
                    });
                    // ALL enemies die after dealing damage (kamikaze)
                    enemiesToRemove.add(enemy.id);
                    if (this.car.health <= 0 && !this.car.disabled) {
                        this.car.disabled = true;
                        // Eject everyone from jeep
                        this.releaseGunther();
                        for (const [id, p] of this.players) {
                            if (p.inCar) {
                                p.inCar = false;
                                p.x = this.car.x + (Math.random() - 0.5) * 6;
                                p.z = this.car.z + (Math.random() - 0.5) * 6;
                            }
                        }
                    }
                }
            }
            
            // Check collision with on-foot players
            for (const [id, p] of this.players) {
                if (!p.inCar) {
                    const distToPlayer = Math.hypot(enemy.x - p.x, enemy.z - p.z);
                    if (distToPlayer < 2 && !enemy.dying) {
                        enemy.dying = true; // Mark as dying - won't deal damage again
                        // Player takes damage
                        if (!this.playerHealth[id]) this.playerHealth[id] = 100;
                        this.playerHealth[id] = Math.max(0, this.playerHealth[id] - 20);
                        this.pendingEvents.push({ 
                            type: 'playerDamage', 
                            playerId: id,
                            x: enemy.x,
                            z: enemy.z,
                            enemyType: enemy.type
                        });
                        // Check if this player died
                        if (this.playerHealth[id] <= 0 && this.gameState === 'playing') {
                            this.gameState = 'lost';
                            this.loseReason = 'You were overwhelmed by the enemies!';
                        }
                        // ALL enemies die after dealing damage (kamikaze)
                        enemiesToRemove.add(enemy.id);
                    }
                }
            }
        }
        
        // Note: hit flags replaced with 'dying' flag that persists until enemy removed
        
        // Remove exploded killers
        this.enemies = this.enemies.filter(e => !enemiesToRemove.has(e.id));
        
        // Enemy-enemy separation (prevent stacking)
        const ENEMY_RADIUS = 1.5;
        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                const a = this.enemies[i];
                const b = this.enemies[j];
                const dx = b.x - a.x;
                const dz = b.z - a.z;
                const dist = Math.hypot(dx, dz);
                const minDist = ENEMY_RADIUS * 2;
                
                if (dist < minDist && dist > 0) {
                    // Push them apart
                    const overlap = (minDist - dist) / 2;
                    const nx = dx / dist;
                    const nz = dz / dist;
                    a.x -= nx * overlap;
                    a.z -= nz * overlap;
                    b.x += nx * overlap;
                    b.z += nz * overlap;
                }
            }
        }
        
        // Enemy-jeep collision (keep enemies outside the jeep)
        const JEEP_RADIUS = 3.5;
        for (const enemy of this.enemies) {
            const dx = enemy.x - this.car.x;
            const dz = enemy.z - this.car.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist < JEEP_RADIUS && dist > 0) {
                // Push enemy outside jeep
                const pushDist = JEEP_RADIUS - dist;
                enemy.x += (dx / dist) * pushDist;
                enemy.z += (dz / dist) * pushDist;
            }
        }
        
        // Check if all players are dead
        let allDead = true;
        for (const [id, p] of this.players) {
            const health = this.playerHealth[id] || 100;
            if (health > 0) allDead = false;
        }
        if (allDead && this.players.size > 0 && this.gameState === 'playing') {
            this.gameState = 'lost';
            this.loseReason = 'All players have been eliminated!';
        }
        
        // Spawn enemies continuously up to 50 max (steady flow)
        // Higher spawn rate to replace killed enemies
        if (Math.random() < 0.025 && this.enemies.length < 50) {
            this.spawnEnemy();
        }
        
        // Remove enemies too far behind (silently despawn - no death effect)
        this.enemies = this.enemies.filter(e => e.z > this.car.z - 150 || e.hasGunther);
        
        // Win check - use 15m threshold for margin
        const goalDist = Math.hypot(this.car.x, this.car.z - GOAL_Z);
        if (goalDist < 20) {
            console.log(`[WIN CHECK] goalDist=${goalDist.toFixed(2)}, gunther=${this.gunther.state}, gameState=${this.gameState}`);
        }
        if (goalDist <= 12 && this.gunther.state === 'in_car') {
            console.log(`[WIN] Game won! goalDist=${goalDist.toFixed(2)}`);
            this.gameState = 'won';
        }
    }
    
    releaseGunther() {
        this.gunther.state = 'wandering';
        this.gunther.visible = true;
        this.gunther.x = this.car.x - 4;
        this.gunther.z = this.car.z;
    }
    
    grabGunther(playerId) {
        const player = this.players.get(playerId);
        if (!player || player.inCar) return false;
        
        // If Gunther is wandering, trapped, OR captured by enemy - pick him up
        if (this.gunther.state === 'wandering' || this.gunther.state === 'trapped' || this.gunther.state === 'captured') {
            const dist = Math.hypot(player.x - this.gunther.x, player.z - this.gunther.z);
            if (dist < 4) {
                const wasTrapped = this.gunther.state === 'trapped';
                const wasCaptured = this.gunther.state === 'captured';
                
                // If captured, free him from the enemy
                if (wasCaptured && this.gunther.captorId !== null) {
                    const captor = this.enemies.find(e => e.id === this.gunther.captorId);
                    if (captor) captor.hasGunther = false;
                    this.gunther.captorId = null;
                }
                
                this.gunther.state = 'carried';
                this.gunther.holderId = playerId;
                this.gunther.trapPos = null;
                this.lastQuote = wasTrapped ? "Ach! You freed me from ze snappy thing!" : 
                                 wasCaptured ? "You saved me! But zey had ze best candies!" :
                                 "Wheee! I am flying! Like a beautiful German eagle!";
                return true;
            }
        }
        return false;
    }
    
    // Put Gunther in car while carrying him (called when entering car while carrying)
    putGuntherInCar(playerId) {
        if (this.gunther.state === 'carried' && this.gunther.holderId === playerId) {
            this.gunther.state = 'in_car';
            this.gunther.visible = false;
            this.gunther.holderId = null;
            this.lastQuote = "Zank you for ze ride! But I vas having fun up zere!";
            // Check win immediately when Gunther enters car
            const goalDist = Math.hypot(this.car.x, this.car.z - GOAL_Z);
            if (goalDist <= 12) {
                this.gameState = 'won';
            }
            return true;
        }
        return false;
    }
    
    tossGunther(playerId, dirX, dirZ) {
        if (this.gunther.state === 'carried' && this.gunther.holderId === playerId) {
            const player = this.players.get(playerId);
            if (!player) return false;
            
            // Toss Gunther in the direction player is facing
            const tossDistance = 8;
            const targetX = player.x + dirX * tossDistance;
            const targetZ = player.z + dirZ * tossDistance;
            
            // Check if tossed near jeep - if so, put him in car
            const distToCar = Math.hypot(targetX - this.car.x, targetZ - this.car.z);
            if (distToCar < 6) {
                this.gunther.state = 'in_car';
                this.gunther.visible = false;
                this.gunther.holderId = null;
                this.lastQuote = "Back in ze comfy car! Zank you for ze flight!";
                return { landed: 'car' };
            }
            
            // Otherwise he lands and starts wandering
            this.gunther.x = targetX;
            this.gunther.z = targetZ;
            this.gunther.state = 'wandering';
            this.gunther.visible = true;
            this.gunther.holderId = null;
            this.lastQuote = "Wheeee— OOF! Zat vas fun! Again, again!";
            return { landed: 'ground', x: targetX, z: targetZ };
        }
        return false;
    }
    
    shoot(playerId, x, z, dirX, dirZ) {
        if (this.gameState !== 'playing') return;
        
        let closestEnemy = null;
        let closestDist = Infinity;
        
        for (const enemy of this.enemies) {
            const dx = enemy.x - x;
            const dz = enemy.z - z;
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
                    this.lastQuote = "Ach! My candy friend is kaput!";
                }
                
                this.enemies = this.enemies.filter(e => e !== closestEnemy);
                
                setTimeout(() => {
                    if (this.gameState === 'playing') this.spawnEnemy();
                }, 2000);
            }
            
            return { id: closestEnemy.id, killed: closestEnemy.health <= 0 };
        }
        return null;
    }
    
    getState() {
        // Add derived fields to enemies for AI
        const enrichedEnemies = this.enemies.map(e => {
            const distToCar = Math.hypot(e.x - this.car.x, e.z - this.car.z);
            const distToGunther = Math.hypot(e.x - this.gunther.x, e.z - this.gunther.z);
            const angleFromCar = Math.atan2(e.x - this.car.x, e.z - this.car.z);
            return {
                ...e,
                distToCar,
                distToGunther,
                angleFromCar
            };
        });
        
        // Find nearest enemy to Gunther
        let nearestEnemyToGunther = null;
        let nearestDist = Infinity;
        for (const e of enrichedEnemies) {
            if (e.distToGunther < nearestDist && !e.hasGunther) {
                nearestDist = e.distToGunther;
                nearestEnemyToGunther = e.id;
            }
        }
        
        // Spatial calculations for AI
        const distCarToGunther = Math.hypot(this.gunther.x - this.car.x, this.gunther.z - this.car.z);
        const angleCarToGunther = Math.atan2(this.gunther.x - this.car.x, this.gunther.z - this.car.z);
        const distCarToGoal = Math.hypot(this.car.x - 0, this.car.z - GOAL_Z);
        const angleCarToGoal = Math.atan2(0 - this.car.x, GOAL_Z - this.car.z);
        
        // Angle difference (how far car needs to turn)
        const normalizeAngle = (a) => ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
        const turnToGunther = normalizeAngle(angleCarToGunther - this.car.rotation);
        const turnToGoal = normalizeAngle(angleCarToGoal - this.car.rotation);
        
        return {
            car: {
                ...this.car,
                // Spatial awareness
                distToGunther: distCarToGunther,
                angleToGunther: angleCarToGunther,
                turnToGunther,  // How much to turn to face Gunther
                distToGoal: distCarToGoal,
                angleToGoal: angleCarToGoal,
                turnToGoal,     // How much to turn to face goal
            },
            gunther: {
                ...this.gunther,
                distToCar: distCarToGunther,
                angleToCar: normalizeAngle(angleCarToGunther + Math.PI),  // Opposite direction
            },
            enemies: enrichedEnemies,
            hazards: HAZARDS,
            nearestEnemyToGunther,
            nearestEnemyDist: nearestDist,
            guntherInDanger: nearestDist < 15 && (this.gunther.state === 'wandering' || this.gunther.state === 'trapped'),
            gameState: this.gameState,
            players: Array.from(this.players.entries()).map(([id, p]) => {
                const distToGunther = Math.hypot(p.x - this.gunther.x, p.z - this.gunther.z);
                const distToCar = Math.hypot(p.x - this.car.x, p.z - this.car.z);
                return {
                    id, name: p.name, inCar: p.inCar, x: p.x, z: p.z, color: p.color, 
                    isDriver: p.isDriver, seatIndex: p.seatIndex,
                    distToGunther, distToCar,
                    health: this.playerHealth[id] || 100
                };
            }),
            driver: this.driver,
            lastQuote: this.lastQuote,
            loseReason: this.loseReason,
            goalZ: GOAL_Z,
            startZ: START_Z,
            jeepHealth: this.car.health,
            jeepDisabled: this.car.disabled
        };
    }
    
    // Get and clear pending events (damage sounds, etc.)
    flushEvents() {
        const events = this.pendingEvents || [];
        this.pendingEvents = [];
        return events;
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    let currentRoom = null;
    
    socket.on('createRoom', (playerName) => {
        const code = generateRoomCode();
        const room = new GameRoom(code);
        rooms.set(code, room);
        
        const playerIndex = room.players.size;
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12']; // Blue, Red, Green, Orange
        room.players.set(socket.id, { 
            name: playerName || 'Player', 
            inCar: true, 
            seatIndex: playerIndex,  // First player gets seat 0 (driver)
            x: 0, 
            z: START_Z,
            color: colors[playerIndex % 4],
            isDriver: true  // First player is driver
        });
        room.driver = socket.id;
        currentRoom = room;
        socket.join(code);
        socket.emit('roomCreated', { code, playerId: socket.id, isDriver: true });
        console.log(`Room ${code} created`);
    });
    
    socket.on('joinRoom', ({ code, playerName }) => {
        const room = rooms.get(code.toUpperCase());
        if (!room) return socket.emit('error', 'Room not found');
        if (room.players.size >= 4) return socket.emit('error', 'Room is full');
        
        const playerIndex = room.players.size;
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12'];
        
        // Find first available seat
        const takenSeats = new Set();
        for (const [id, p] of room.players) {
            if (p.seatIndex !== undefined) takenSeats.add(p.seatIndex);
        }
        let seatIndex = 0;
        for (let i = 0; i < 4; i++) {
            if (!takenSeats.has(i)) { seatIndex = i; break; }
        }
        
        room.players.set(socket.id, { 
            name: playerName || 'Player', 
            inCar: true, 
            seatIndex: seatIndex,
            x: room.car.x, 
            z: room.car.z,
            color: colors[playerIndex % 4],
            isDriver: false
        });
        currentRoom = room;
        socket.join(code);
        socket.emit('roomJoined', { code, playerId: socket.id, isDriver: false });
        io.to(code).emit('playerJoined', { id: socket.id, name: playerName, color: colors[playerIndex % 4] });
        console.log(`${playerName} joined ${code}`);
    });
    
    socket.on('startGame', () => {
        if (currentRoom && currentRoom.gameState === 'waiting') {
            currentRoom.start();
            io.to(currentRoom.code).emit('gameStarted');
        }
    });
    
    socket.on('carUpdate', (data) => {
        if (!currentRoom || currentRoom.gameState !== 'playing') return;
        // Only the driver can update car position
        if (currentRoom.driver !== socket.id) return;
        currentRoom.car.x = data.x;
        currentRoom.car.z = data.z;
        currentRoom.car.rotation = data.rotation;
    });
    
    socket.on('playerUpdate', (data) => {
        if (!currentRoom) return;
        const player = currentRoom.players.get(socket.id);
        if (player) {
            player.x = data.x;
            player.z = data.z;
            player.inCar = data.inCar;
        }
    });
    
    socket.on('exitCar', () => {
        if (!currentRoom) return;
        const player = currentRoom.players.get(socket.id);
        if (player) {
            player.inCar = false;
            player.isDriver = false;
            player.seatIndex = undefined;  // Clear seat assignment
            player.x = currentRoom.car.x + 4;
            player.z = currentRoom.car.z;
            
            // If driver exits, assign new driver to someone still in car
            if (currentRoom.driver === socket.id) {
                currentRoom.driver = null;
                for (const [id, p] of currentRoom.players) {
                    if (p.inCar) {
                        currentRoom.driver = id;
                        p.isDriver = true;
                        break;
                    }
                }
            }
        }
    });
    
    socket.on('enterCar', () => {
        if (!currentRoom) return;
        const player = currentRoom.players.get(socket.id);
        if (player) {
            const dist = Math.hypot(player.x - currentRoom.car.x, player.z - currentRoom.car.z);
            if (dist < 6) {
                player.inCar = true;
                
                // Assign seat based on entry order (find first empty seat)
                const takenSeats = new Set();
                for (const [id, p] of currentRoom.players) {
                    if (p.inCar && p.seatIndex !== undefined && id !== socket.id) {
                        takenSeats.add(p.seatIndex);
                    }
                }
                // Find first available seat (0-3)
                for (let i = 0; i < 4; i++) {
                    if (!takenSeats.has(i)) {
                        player.seatIndex = i;
                        break;
                    }
                }
                
                // First person in (seat 0) becomes driver
                const playersInCar = Array.from(currentRoom.players.values()).filter(p => p.inCar);
                if (playersInCar.length === 1 || player.seatIndex === 0) {
                    // This player is first in, they become driver
                    currentRoom.driver = socket.id;
                    for (const [id, p] of currentRoom.players) {
                        p.isDriver = (id === socket.id);
                    }
                }
                
                // If carrying Gunther, bring him into the car!
                if (currentRoom.gunther.state === 'carried' && currentRoom.gunther.holderId === socket.id) {
                    currentRoom.gunther.state = 'in_car';
                    currentRoom.gunther.visible = false;
                    currentRoom.gunther.holderId = null;
                    // Check win immediately when Gunther enters car
                    const goalDist = Math.hypot(currentRoom.car.x, currentRoom.car.z - GOAL_Z);
                    currentRoom.lastQuote = `DEBUG: car.z=${currentRoom.car.z.toFixed(0)}, goalDist=${goalDist.toFixed(0)}`;
                    if (goalDist <= 12) {
                        currentRoom.gameState = 'won';
                    }
                }
            }
        }
    });
    
    socket.on('grabGunther', () => {
        if (currentRoom) currentRoom.grabGunther(socket.id);
    });
    
    socket.on('tossGunther', (data) => {
        if (currentRoom) currentRoom.tossGunther(socket.id, data.dirX, data.dirZ);
    });
    
    socket.on('shoot', (data) => {
        if (!currentRoom) return;
        const result = currentRoom.shoot(socket.id, data.x, data.z, data.dirX, data.dirZ);
        // Emit result to shooter for AI feedback
        socket.emit('shootResult', { 
            hit: !!result, 
            enemyId: result?.id || null,
            killed: result?.killed || false
        });
        if (result) io.to(currentRoom.code).emit('enemyHit', result);
    });
    
    socket.on('enemyHit', (data) => {
        // Handle roadkill (jeep hitting enemies)
        if (!currentRoom || !data.id) return;
        const idx = currentRoom.enemies.findIndex(e => e.id === data.id);
        if (idx !== -1) {
            currentRoom.enemies.splice(idx, 1);
            io.to(currentRoom.code).emit('enemyHit', { id: data.id, killed: true, type: 'roadkill' });
        }
    });
    
    socket.on('debugConfig', (config) => {
        if (!currentRoom) return;
        currentRoom.updateConfig(config);
        // Broadcast config change to all players in room
        io.to(currentRoom.code).emit('configUpdated', currentRoom.config);
    });
    
    socket.on('disconnect', () => {
        if (currentRoom) {
            currentRoom.players.delete(socket.id);
            io.to(currentRoom.code).emit('playerLeft', socket.id);
            if (currentRoom.players.size === 0) {
                rooms.delete(currentRoom.code);
                console.log(`Room ${currentRoom.code} deleted`);
            }
        }
    });
});

// Game loop
setInterval(() => {
    const now = Date.now();
    rooms.forEach((room) => {
        const delta = (now - room.lastUpdate) / 1000;
        room.lastUpdate = now;
        room.update(delta);
        
        // Emit damage events (for SFX and visual effects)
        const events = room.flushEvents();
        for (const event of events) {
            if (event.type === 'jeepDamage') {
                io.to(room.code).emit('jeepDamage', { x: event.x, z: event.z, enemyType: event.enemyType });
            } else if (event.type === 'playerDamage' && event.playerId) {
                io.to(event.playerId).emit('playerDamage', { x: event.x, z: event.z, enemyType: event.enemyType });
            }
        }
        
        io.to(room.code).emit('gameState', room.getState());
    });
}, 1000 / 20); // 20 FPS server tick

const PORT = 8080;
server.listen(PORT, () => console.log(`GGG server running on port ${PORT}`));

