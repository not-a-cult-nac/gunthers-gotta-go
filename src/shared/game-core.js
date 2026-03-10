// SHARED GAME CORE
// This is the single source of truth for game logic
// Used by: headless tests, server, browser AI

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

// Static game data - shared constants
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

// Clustering constants
const LURE_DISTANCE = 40;
const SCOUT_DETECTION_RANGE = 35;
const AMBUSH_POINTS = [80, 180, 280, 380]; // Fixed Z positions for ambush clumps

const DEFAULT_CONFIG = {
    escapeRate: 0.05,
    lureRange: 12,
    enemySpeed: 3,
    guntherSpeed: 3.5
};

// Pure game state - no side effects
function createInitialState(config = DEFAULT_CONFIG) {
    return {
        car: { x: 0, z: START_Z, rotation: 0 },
        player: { x: 0, z: START_Z, inCar: true, rotation: 0 },
        gunther: { 
            x: 0, z: START_Z, 
            state: 'in_car', 
            visible: false, 
            captorId: null, 
            trapPos: null, 
            holderId: null, 
            strain: 0 
        },
        enemies: [],
        clumps: [],
        scouts: [],
        clumpIdCounter: 0,
        scoutIdCounter: 0,
        gameState: 'playing',
        enemyIdCounter: 0,
        time: 0,
        loseReason: '',
        config: { ...config }
    };
}

// Pure function: (state, random) -> enemy
function spawnEnemy(state, random, options = {}) {
    const { x, z, dormant = false } = options;
    
    let enemyX, enemyZ;
    if (x !== undefined && z !== undefined) {
        // Spawn at specific position (for clumps)
        enemyX = x;
        enemyZ = z;
    } else {
        // Random spawn (legacy behavior)
        const minZ = Math.max(START_Z, state.car.z);
        const maxZ = Math.min(GOAL_Z - 30, state.car.z + 80);
        const side = random() > 0.5 ? 1 : -1;
        enemyX = side * (20 + random() * 25);
        enemyZ = minZ + random() * (maxZ - minZ);
    }
    
    const baseSpeed = state.config.enemySpeed;
    return {
        id: state.enemyIdCounter++,
        x: enemyX,
        z: enemyZ,
        health: 2,
        hasGunther: false,
        speed: baseSpeed + random() * (baseSpeed * 0.5),
        vx: 0,
        vz: 0,
        dormant: dormant,
        clumpId: options.clumpId || null
    };
}

// Spawn a clump of enemies at a position
function spawnClump(state, random, z, size = 'small') {
    const clumpId = state.clumpIdCounter++;
    const side = random() > 0.5 ? 1 : -1;
    const baseX = side * (15 + random() * 20);
    
    const enemyCount = size === 'large' ? 6 + Math.floor(random() * 5) : 3 + Math.floor(random() * 3);
    const enemies = [];
    
    for (let i = 0; i < enemyCount; i++) {
        const offsetX = (random() - 0.5) * 12;
        const offsetZ = (random() - 0.5) * 12;
        const enemy = spawnEnemy(state, random, {
            x: baseX + offsetX,
            z: z + offsetZ,
            dormant: true,
            clumpId: clumpId
        });
        enemies.push(enemy);
        state.enemies.push(enemy);
    }
    
    const clump = {
        id: clumpId,
        x: baseX,
        z: z,
        alerted: false,
        size: size,
        enemyIds: enemies.map(e => e.id)
    };
    
    return clump;
}

// Spawn a scout enemy
function spawnScout(state, random) {
    const minZ = Math.max(START_Z + 40, state.car.z + 30);
    const maxZ = Math.min(GOAL_Z - 50, state.car.z + 100);
    if (minZ >= maxZ) return null;
    
    const side = random() > 0.5 ? 1 : -1;
    const baseSpeed = state.config.enemySpeed * 0.7; // Scouts are slower
    
    return {
        id: state.scoutIdCounter++,
        x: side * (10 + random() * 30),
        z: minZ + random() * (maxZ - minZ),
        health: 1, // Scouts are fragile
        speed: baseSpeed,
        vx: 0,
        vz: 0,
        hasFired: false,
        wanderAngle: random() * Math.PI * 2,
        wanderTimer: 0
    };
}

// Pure function: (state, delta, inputs, random) -> { newState, events }
// Events are things the server/browser might want to react to (quotes, sounds, etc)
function updateGame(state, delta, inputs, random) {
    if (state.gameState !== 'playing') {
        return { state, events: [] };
    }
    
    const events = [];
    const newState = JSON.parse(JSON.stringify(state)); // Deep clone
    newState.time += delta;
    
    // Apply player inputs
    applyInputs(newState, inputs, delta);
    
    // Update gunther based on state
    updateGunther(newState, delta, random, events);
    
    // Update scouts
    updateScouts(newState, delta, random, events);
    
    // Update enemies
    updateEnemies(newState, delta);
    
    // Spawn clumps at ambush points as player approaches
    for (const ambushZ of AMBUSH_POINTS) {
        const alreadySpawned = newState.clumps.some(c => Math.abs(c.z - ambushZ) < 20);
        if (!alreadySpawned && newState.car.z + 120 > ambushZ && newState.car.z < ambushZ) {
            // Spawn larger clumps closer to goal
            const size = ambushZ > 250 ? 'large' : 'small';
            const clump = spawnClump(newState, random, ambushZ, size);
            newState.clumps.push(clump);
        }
    }
    
    // Spawn random clumps ahead (hybrid system)
    if (random() < 0.003 && newState.clumps.length < 8) {
        const spawnZ = newState.car.z + 60 + random() * 60;
        if (spawnZ < GOAL_Z - 40) {
            const nearAmbush = AMBUSH_POINTS.some(az => Math.abs(az - spawnZ) < 30);
            if (!nearAmbush) {
                const size = spawnZ > 300 ? (random() > 0.5 ? 'large' : 'small') : 'small';
                const clump = spawnClump(newState, random, spawnZ, size);
                newState.clumps.push(clump);
            }
        }
    }
    
    // Spawn scouts periodically
    if (random() < 0.002 && newState.scouts.length < 3) {
        const scout = spawnScout(newState, random);
        if (scout) newState.scouts.push(scout);
    }
    
    // Remove enemies too far behind
    newState.enemies = newState.enemies.filter(e => e.z > newState.car.z - 80 || e.hasGunther);
    
    // Remove clumps too far behind
    newState.clumps = newState.clumps.filter(c => c.z > newState.car.z - 60);
    
    // Remove scouts too far behind
    newState.scouts = newState.scouts.filter(s => s.z > newState.car.z - 60);
    
    // Win check
    const goalDist = Math.hypot(newState.car.x, newState.car.z - GOAL_Z);
    if (goalDist < 12 && newState.gunther.state === 'in_car') {
        newState.gameState = 'won';
        events.push({ type: 'win' });
    }
    
    return { state: newState, events };
}

function applyInputs(state, inputs, delta) {
    const { drive, steer, moveX, moveZ, shoot, exitCar, enterCar, grabGunther, holdHand, releaseHand } = inputs;
    
    // Driving (when in car)
    if (state.player.inCar && drive !== undefined) {
        const speed = 12;
        state.car.rotation += (steer || 0) * 2 * delta;
        state.car.x += Math.sin(state.car.rotation) * drive * speed * delta;
        state.car.z += Math.cos(state.car.rotation) * drive * speed * delta;
        state.player.x = state.car.x;
        state.player.z = state.car.z;
    }
    
    // Walking (when on foot)
    if (!state.player.inCar && (moveX !== undefined || moveZ !== undefined)) {
        const walkSpeed = 6;
        const mx = moveX || 0;
        const mz = moveZ || 0;
        state.player.x += mx * walkSpeed * delta;
        state.player.z += mz * walkSpeed * delta;
        if (Math.abs(mx) > 0.01 || Math.abs(mz) > 0.01) {
            state.player.rotation = Math.atan2(mx, mz);
        }
    }
    
    // Actions
    if (exitCar && state.player.inCar) {
        state.player.inCar = false;
        state.player.x = state.car.x + 4;
        state.player.z = state.car.z;
    }
    
    if (enterCar && !state.player.inCar) {
        const dist = Math.hypot(state.player.x - state.car.x, state.player.z - state.car.z);
        if (dist < 6) {
            state.player.inCar = true;
            if (state.gunther.state === 'holding_hands' && state.gunther.holderId === 'player') {
                state.gunther.state = 'in_car';
                state.gunther.visible = false;
                state.gunther.holderId = null;
                state.gunther.strain = 0;
            }
        }
    }
    
    if (grabGunther) {
        tryGrabGunther(state);
    }
    
    if (holdHand) {
        tryHoldHand(state);
    }
    
    if (releaseHand) {
        tryReleaseHand(state);
    }
    
    if (shoot) {
        return tryShoot(state, shoot.dirX, shoot.dirZ);
    }
    
    return null;
}

function tryGrabGunther(state) {
    if (state.player.inCar) return false;
    
    if (state.gunther.state === 'wandering' || state.gunther.state === 'trapped' || state.gunther.state === 'holding_hands') {
        const dist = Math.hypot(state.player.x - state.gunther.x, state.player.z - state.gunther.z);
        const grabDist = state.gunther.state === 'holding_hands' ? 6 : 4;
        if (dist < grabDist) {
            const carDist = Math.hypot(state.player.x - state.car.x, state.player.z - state.car.z);
            if (carDist < 8) {
                state.gunther.state = 'in_car';
                state.gunther.visible = false;
                state.gunther.trapPos = null;
                state.gunther.holderId = null;
                state.gunther.strain = 0;
                return true;
            }
        }
    }
    return false;
}

function tryHoldHand(state) {
    if (state.player.inCar) return false;
    
    if (state.gunther.state === 'wandering' || state.gunther.state === 'trapped') {
        const dist = Math.hypot(state.player.x - state.gunther.x, state.player.z - state.gunther.z);
        if (dist < 4) {
            state.gunther.state = 'holding_hands';
            state.gunther.holderId = 'player';
            state.gunther.strain = 0;
            state.gunther.trapPos = null;
            return true;
        }
    }
    return false;
}

function tryReleaseHand(state) {
    if (state.gunther.state === 'holding_hands' && state.gunther.holderId === 'player') {
        state.gunther.state = 'wandering';
        state.gunther.holderId = null;
        state.gunther.strain = 0;
        return true;
    }
    return false;
}

function tryShoot(state, dirX, dirZ) {
    if (state.gameState !== 'playing') return null;
    
    let closestEnemy = null;
    let closestDist = Infinity;
    
    for (const enemy of state.enemies) {
        const dx = enemy.x - state.player.x;
        const dz = enemy.z - state.player.z;
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
                state.gunther.state = 'wandering';
                state.gunther.captorId = null;
                state.gunther.visible = true;
                state.gunther.x = closestEnemy.x;
                state.gunther.z = closestEnemy.z;
            }
            
            state.enemies = state.enemies.filter(e => e !== closestEnemy);
        }
        
        return { id: closestEnemy.id, killed: closestEnemy.health <= 0 };
    }
    return null;
}

function updateGunther(state, delta, random, events) {
    // Gunther in car - might escape
    if (state.gunther.state === 'in_car') {
        if (random() < state.config.escapeRate * delta) {
            releaseGunther(state);
            events.push({ type: 'gunther_quote', category: 'escape' });
            return;
        }
        
        for (const enemy of state.enemies) {
            const dist = Math.hypot(enemy.x - state.car.x, enemy.z - state.car.z);
            if (dist < state.config.lureRange) {
                releaseGunther(state);
                state.gunther.x += (enemy.x - state.car.x) * 0.4;
                state.gunther.z += (enemy.z - state.car.z) * 0.4;
                events.push({ type: 'gunther_quote', category: 'lured' });
                break;
            }
        }
        return;
    }
    
    // Gunther holding hands
    if (state.gunther.state === 'holding_hands' && state.gunther.holderId === 'player') {
        if (state.player.inCar) {
            state.gunther.state = 'wandering';
            state.gunther.holderId = null;
            state.gunther.strain = 0;
            return;
        }
        
        // Follow player with resistance
        updateGuntherHolding(state, delta, events);
        return;
    }
    
    // Gunther wandering
    if (state.gunther.state === 'wandering') {
        updateGuntherWandering(state, delta, events);
        return;
    }
    
    // Gunther trapped
    if (state.gunther.state === 'trapped' && state.gunther.trapPos) {
        state.gunther.x = state.gunther.trapPos.x;
        state.gunther.z = state.gunther.trapPos.z;
        return;
    }
    
    // Gunther captured
    if (state.gunther.state === 'captured' && state.gunther.captorId !== null) {
        updateGuntherCaptured(state, delta, events);
    }
}

function releaseGunther(state) {
    state.gunther.state = 'wandering';
    state.gunther.visible = true;
    state.gunther.x = state.car.x - 4;
    state.gunther.z = state.car.z;
}

function updateGuntherHolding(state, delta, events) {
    let nearestHazard = null;
    let nearestDist = Infinity;
    let pullStrength = 0;
    
    for (const h of HAZARDS) {
        const d = Math.hypot(state.gunther.x - h.x, state.gunther.z - h.z);
        if (d < nearestDist) {
            nearestDist = d;
            nearestHazard = h;
        }
    }
    
    for (const e of state.enemies) {
        const d = Math.hypot(state.gunther.x - e.x, state.gunther.z - e.z);
        if (d < nearestDist * 0.6) {
            nearestDist = d;
            nearestHazard = { x: e.x, z: e.z, type: 'candy' };
        }
    }
    
    if (nearestHazard) {
        pullStrength = Math.max(0, 100 - nearestDist * 2);
        if (nearestHazard.type === 'candy') pullStrength *= 1.5;
    }
    
    for (const e of state.enemies) {
        const d = Math.hypot(state.gunther.x - e.x, state.gunther.z - e.z);
        if (d < 8) pullStrength += (8 - d) * 3;
    }
    
    const toHolder = {
        x: state.player.x - state.gunther.x,
        z: state.player.z - state.gunther.z
    };
    const followDist = Math.hypot(toHolder.x, toHolder.z);
    
    if (followDist > 2) {
        const norm = Math.hypot(toHolder.x, toHolder.z);
        const followSpeed = Math.min(6, followDist) * delta;
        state.gunther.x += (toHolder.x / norm) * followSpeed;
        state.gunther.z += (toHolder.z / norm) * followSpeed;
        
        if (nearestHazard && pullStrength > 20) {
            const toHazard = {
                x: nearestHazard.x - state.gunther.x,
                z: nearestHazard.z - state.gunther.z
            };
            const hazardDist = Math.hypot(toHazard.x, toHazard.z);
            if (hazardDist > 0) {
                state.gunther.x += (toHazard.x / hazardDist) * pullStrength * 0.01 * delta;
                state.gunther.z += (toHazard.z / hazardDist) * pullStrength * 0.01 * delta;
            }
        }
    }
    
    if (followDist < 1.5 && followDist > 0) {
        const norm = Math.hypot(toHolder.x, toHolder.z);
        state.gunther.x = state.player.x - (toHolder.x / norm) * 1.5;
        state.gunther.z = state.player.z - (toHolder.z / norm) * 1.5;
    }
    
    state.gunther.strain = Math.min(100, state.gunther.strain + pullStrength * 0.3 * delta);
    state.gunther.strain = Math.max(0, state.gunther.strain - 10 * delta);
    
    if (state.gunther.strain >= 100) {
        state.gunther.state = 'wandering';
        state.gunther.holderId = null;
        state.gunther.strain = 0;
        events.push({ type: 'gunther_quote', category: 'break_free' });
        
        if (nearestHazard) {
            const toHazard = {
                x: nearestHazard.x - state.gunther.x,
                z: nearestHazard.z - state.gunther.z
            };
            const hazardDist = Math.hypot(toHazard.x, toHazard.z);
            if (hazardDist > 0) {
                state.gunther.x += (toHazard.x / hazardDist) * 3;
                state.gunther.z += (toHazard.z / hazardDist) * 3;
            }
        }
    }
}

function updateGuntherWandering(state, delta, events) {
    let nearestHazard = null;
    let nearestDist = Infinity;
    
    for (const h of HAZARDS) {
        const d = Math.hypot(state.gunther.x - h.x, state.gunther.z - h.z);
        if (d < nearestDist) {
            nearestDist = d;
            nearestHazard = h;
        }
    }
    
    for (const e of state.enemies) {
        const d = Math.hypot(state.gunther.x - e.x, state.gunther.z - e.z);
        if (d < nearestDist * 0.6) {
            nearestDist = d;
            nearestHazard = { x: e.x, z: e.z, type: 'candy', radius: 2 };
        }
    }
    
    if (nearestHazard) {
        const dx = nearestHazard.x - state.gunther.x;
        const dz = nearestHazard.z - state.gunther.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.5) {
            state.gunther.x += (dx / dist) * state.config.guntherSpeed * delta;
            state.gunther.z += (dz / dist) * state.config.guntherSpeed * delta;
        }
        
        if (nearestDist < (nearestHazard.radius || 2)) {
            if (nearestHazard.type === 'lava') {
                state.gameState = 'lost';
                state.loseReason = 'Gunther jumped in the lava!';
                events.push({ type: 'lose', reason: 'lava' });
            } else if (nearestHazard.type === 'cliff') {
                state.gameState = 'lost';
                state.loseReason = 'Gunther yeeted himself off the cliff!';
                events.push({ type: 'lose', reason: 'cliff' });
            } else if (nearestHazard.type === 'trap') {
                state.gunther.state = 'trapped';
                state.gunther.trapPos = { x: nearestHazard.x, z: nearestHazard.z };
                events.push({ type: 'gunther_quote', category: 'trapped' });
            }
        }
    }
}

function updateGuntherCaptured(state, delta, events) {
    state.gunther.visible = true;
    const captor = state.enemies.find(e => e.id === state.gunther.captorId);
    if (captor) {
        const dx = captor.x - state.car.x;
        const dz = captor.z - state.car.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0) {
            captor.x += (dx / dist) * captor.speed * delta;
            captor.z += (dz / dist) * captor.speed * delta;
        }
        state.gunther.x = captor.x + 1;
        state.gunther.z = captor.z;
        
        if (dist > 100) {
            state.gameState = 'lost';
            state.loseReason = 'Enemy escaped with Gunther!';
            events.push({ type: 'lose', reason: 'captured' });
        }
    }
}

// Update scout enemies - they roam and fire flares
function updateScouts(state, delta, random, events) {
    for (const scout of state.scouts) {
        const prevX = scout.x;
        const prevZ = scout.z;
        
        const distToCar = Math.hypot(scout.x - state.car.x, scout.z - state.car.z);
        
        // Check if scout detects player
        if (!scout.hasFired && distToCar < SCOUT_DETECTION_RANGE) {
            scout.hasFired = true;
            
            // Find nearest dormant clump to alert
            let nearestClump = null;
            let nearestDist = Infinity;
            for (const clump of state.clumps) {
                if (!clump.alerted) {
                    const d = Math.hypot(clump.x - scout.x, clump.z - scout.z);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearestClump = clump;
                    }
                }
            }
            
            // Fire flare and alert the clump
            events.push({ type: 'flare', scoutId: scout.id, x: scout.x, z: scout.z });
            
            if (nearestClump) {
                nearestClump.alerted = true;
                // Wake up all enemies in that clump
                for (const enemy of state.enemies) {
                    if (enemy.clumpId === nearestClump.id) {
                        enemy.dormant = false;
                    }
                }
            }
        }
        
        // Roaming behavior (wander randomly)
        scout.wanderTimer -= delta;
        if (scout.wanderTimer <= 0) {
            scout.wanderAngle += (random() - 0.5) * Math.PI;
            scout.wanderTimer = 1 + random() * 2;
        }
        
        // Move in wander direction (unless has fired, then chase)
        if (scout.hasFired) {
            // After firing, scout chases like normal enemy
            const dx = state.car.x - scout.x;
            const dz = state.car.z - scout.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0) {
                scout.x += (dx / dist) * scout.speed * delta;
                scout.z += (dz / dist) * scout.speed * delta;
            }
        } else {
            // Wander
            scout.x += Math.sin(scout.wanderAngle) * scout.speed * 0.5 * delta;
            scout.z += Math.cos(scout.wanderAngle) * scout.speed * 0.5 * delta;
            
            // Keep scouts in bounds
            scout.x = Math.max(-45, Math.min(45, scout.x));
        }
        
        scout.vx = (scout.x - prevX) / delta;
        scout.vz = (scout.z - prevZ) / delta;
    }
}

function updateEnemies(state, delta) {
    for (const enemy of state.enemies) {
        // Skip dormant enemies - they don't move until alerted
        if (enemy.dormant) {
            // Check if player gets within lure distance
            const distToCar = Math.hypot(enemy.x - state.car.x, enemy.z - state.car.z);
            if (distToCar < LURE_DISTANCE) {
                enemy.dormant = false;
                // Also alert the whole clump
                if (enemy.clumpId !== null) {
                    const clump = state.clumps.find(c => c.id === enemy.clumpId);
                    if (clump && !clump.alerted) {
                        clump.alerted = true;
                        for (const e of state.enemies) {
                            if (e.clumpId === clump.id) {
                                e.dormant = false;
                            }
                        }
                    }
                }
            }
            continue;
        }
        
        const prevX = enemy.x;
        const prevZ = enemy.z;
        
        const guntherVulnerable = state.gunther.state === 'wandering' || state.gunther.state === 'trapped';
        const guntherHeld = state.gunther.state === 'holding_hands';
        const distToCar = Math.hypot(enemy.x - state.car.x, enemy.z - state.car.z);
        const inRange = distToCar < ENEMY_DETECTION_RANGE;
        
        if ((guntherVulnerable || guntherHeld) && !enemy.hasGunther && inRange) {
            const dx = state.gunther.x - enemy.x;
            const dz = state.gunther.z - enemy.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0) {
                enemy.x += (dx / dist) * enemy.speed * delta;
                enemy.z += (dz / dist) * enemy.speed * delta;
            }
            
            if (dist < 2 && !guntherHeld) {
                enemy.hasGunther = true;
                state.gunther.state = 'captured';
                state.gunther.captorId = enemy.id;
                state.gunther.visible = true;
                state.gunther.trapPos = null;
                state.gunther.holderId = null;
                state.gunther.strain = 0;
            }
        } else if (!enemy.hasGunther && distToCar < ENEMY_DETECTION_RANGE) {
            const dx = state.car.x - enemy.x;
            const dz = state.car.z - enemy.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0) {
                enemy.x += (dx / dist) * enemy.speed * 0.3 * delta;
                enemy.z += (dz / dist) * enemy.speed * 0.3 * delta;
            }
        }
        
        enemy.vx = (enemy.x - prevX) / delta;
        enemy.vz = (enemy.z - prevZ) / delta;
    }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createRNG,
        createInitialState,
        spawnEnemy,
        spawnClump,
        spawnScout,
        updateGame,
        applyInputs,
        HAZARDS,
        GOAL_Z,
        START_Z,
        ENEMY_DETECTION_RANGE,
        LURE_DISTANCE,
        SCOUT_DETECTION_RANGE,
        AMBUSH_POINTS,
        DEFAULT_CONFIG
    };
}

// For browser ES modules
if (typeof window !== 'undefined') {
    window.GameCore = {
        createRNG,
        createInitialState,
        spawnEnemy,
        spawnClump,
        spawnScout,
        updateGame,
        applyInputs,
        HAZARDS,
        GOAL_Z,
        START_Z,
        ENEMY_DETECTION_RANGE,
        LURE_DISTANCE,
        SCOUT_DETECTION_RANGE,
        AMBUSH_POINTS,
        DEFAULT_CONFIG
    };
}
