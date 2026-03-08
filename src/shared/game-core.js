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
        gameState: 'playing',
        enemyIdCounter: 0,
        time: 0,
        loseReason: '',
        config: { ...config }
    };
}

// Pure function: (state, random) -> enemy
function spawnEnemy(state, random) {
    const minZ = Math.max(START_Z, state.car.z);
    const maxZ = Math.min(GOAL_Z - 30, state.car.z + 80);
    
    const side = random() > 0.5 ? 1 : -1;
    const baseSpeed = state.config.enemySpeed;
    return {
        id: state.enemyIdCounter++,
        x: side * (20 + random() * 25),
        z: minZ + random() * (maxZ - minZ),
        health: 2,
        hasGunther: false,
        speed: baseSpeed + random() * (baseSpeed * 0.5),
        vx: 0,
        vz: 0
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
    
    // Update enemies
    updateEnemies(newState, delta);
    
    // Spawn more enemies
    if (random() < 0.008 && newState.enemies.length < 8) {
        newState.enemies.push(spawnEnemy(newState, random));
    }
    
    // Remove enemies too far behind
    newState.enemies = newState.enemies.filter(e => e.z > newState.car.z - 80 || e.hasGunther);
    
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

function updateEnemies(state, delta) {
    for (const enemy of state.enemies) {
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
        updateGame,
        applyInputs,
        HAZARDS,
        GOAL_Z,
        START_Z,
        ENEMY_DETECTION_RANGE,
        DEFAULT_CONFIG
    };
}

// For browser ES modules
if (typeof window !== 'undefined') {
    window.GameCore = {
        createRNG,
        createInitialState,
        spawnEnemy,
        updateGame,
        applyInputs,
        HAZARDS,
        GOAL_Z,
        START_Z,
        ENEMY_DETECTION_RANGE,
        DEFAULT_CONFIG
    };
}
