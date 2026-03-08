// SHARED AI CORE - GOAP VERSION
// Goal-Oriented Action Planning: A* search over action space
// Replaces priority-based decision tree with planning

const AI_CONFIG = {
    SHOOT_RANGE: 50,
    SHOOT_COOLDOWN: 0.15,
    GRAB_RANGE: 3.5,
    CAR_ENTER_RANGE: 5,
    PLAN_REFRESH_INTERVAL: 0.1  // Fast replanning
};

// ============================================================================
// WORLD STATE
// ============================================================================

function createWorldState(gameState) {
    const { player, gunther, enemies, car, goalZ } = gameState;
    const GOAL_Z = goalZ || 440;
    
    const guntherDist = Math.hypot(gunther.x - player.x, gunther.z - player.z);
    const carDist = Math.hypot(car.x - player.x, car.z - player.z);
    const nearestEnemy = findNearestEnemy(player, enemies);
    const captor = enemies.find(e => e.id === gunther.captorId);
    const captorDist = captor ? Math.hypot(captor.x - player.x, captor.z - player.z) : Infinity;
    
    return {
        // Player state
        playerInCar: player.inCar,
        playerNearCar: carDist < AI_CONFIG.CAR_ENTER_RANGE,
        playerNearGunther: guntherDist < AI_CONFIG.GRAB_RANGE,
        playerNearCarForGrab: carDist < 8,  // Range for grabbing into car directly
        
        // Gunther state
        guntherSafe: gunther.state === 'in_car',
        guntherHolding: gunther.state === 'holding_hands',
        guntherLoose: gunther.state === 'wandering' || gunther.state === 'trapped',
        guntherCaptured: gunther.state === 'captured',
        
        // Combat state
        hasThreats: enemies.length > 0,
        nearestEnemyDist: nearestEnemy?.dist ?? Infinity,
        captorAlive: !!captor,
        playerNearCaptor: captorDist < AI_CONFIG.SHOOT_RANGE,
        
        // Goal
        reachedGoal: car.z >= GOAL_Z,
        
        // Runtime references (prefixed with _ to exclude from state comparison)
        _gunther: gunther,
        _car: car,
        _captor: captor,
        _nearestEnemy: nearestEnemy?.enemy,
        _player: player,
        _enemies: enemies,
        _goalZ: GOAL_Z
    };
}

function findNearestEnemy(player, enemies) {
    let nearest = null;
    let nearestDist = Infinity;
    
    for (const enemy of enemies) {
        const dist = Math.hypot(enemy.x - player.x, enemy.z - player.z);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { enemy, dist };
        }
    }
    return nearest;
}

// ============================================================================
// ACTIONS
// ============================================================================

const ACTIONS = {
    enterCar: {
        preconditions: { playerNearCar: true, playerInCar: false },
        effects: { playerInCar: true },
        cost: 1,
        execute: () => ({ enterCar: true })
    },
    
    exitCar: {
        preconditions: { playerInCar: true },
        effects: { playerInCar: false, playerNearCar: true },
        cost: 2,
        execute: () => ({ exitCar: true })
    },
    
    drive: {
        preconditions: { playerInCar: true, guntherSafe: true },
        effects: { reachedGoal: true },
        cost: 1,
        execute: (state) => {
            const car = state._car;
            const steerAmount = Math.max(-1, Math.min(1, -car.x * 0.02));
            return { drive: 1, steer: steerAmount };
        }
    },
    
    moveToGunther: {
        preconditions: { playerInCar: false, playerNearGunther: false, guntherLoose: true },
        effects: { playerNearGunther: true },
        cost: 3,
        execute: (state) => moveToward(state._player, state._gunther)
    },
    
    grabGuntherIntoCar: {
        preconditions: { playerNearGunther: true, guntherLoose: true, playerNearCarForGrab: true },
        effects: { guntherSafe: true, guntherLoose: false },
        cost: 1,
        execute: () => ({ grabGunther: true })
    },
    
    holdHand: {
        preconditions: { playerNearGunther: true, guntherLoose: true, playerNearCarForGrab: false },
        effects: { guntherHolding: true, guntherLoose: false },
        cost: 1,
        execute: () => ({ holdHand: true })
    },
    
    leadToCar: {
        preconditions: { guntherHolding: true, playerNearCar: false },
        effects: { playerNearCar: true },
        cost: 3,
        execute: (state) => moveToward(state._player, state._car)
    },
    
    enterCarWithGunther: {
        preconditions: { guntherHolding: true, playerNearCar: true },
        effects: { playerInCar: true, guntherSafe: true, guntherHolding: false },
        cost: 1,
        execute: () => ({ enterCar: true })
    },
    
    moveToCar: {
        preconditions: { playerInCar: false, playerNearCar: false, guntherSafe: true },
        effects: { playerNearCar: true },
        cost: 3,
        execute: (state) => moveToward(state._player, state._car)
    },
    
    moveToCaptor: {
        preconditions: { guntherCaptured: true, captorAlive: true, playerNearCaptor: false, playerInCar: false },
        effects: { playerNearCaptor: true },
        cost: 2,
        execute: (state) => {
            // Move AND shoot while approaching
            const inputs = moveToward(state._player, state._captor);
            const shot = shootAt(state._player, state._captor);
            return { ...inputs, ...shot };
        }
    },
    
    shootCaptor: {
        preconditions: { guntherCaptured: true, captorAlive: true, playerNearCaptor: true, playerInCar: false },
        effects: { captorAlive: false, guntherCaptured: false, guntherLoose: true },
        cost: 1,
        execute: (state) => {
            const captor = state._captor;
            const player = state._player;
            if (!captor) return {};
            
            const dx = captor.x - player.x;
            const dz = captor.z - player.z;
            const dist = Math.hypot(dx, dz);
            const inputs = {};
            
            // If too close, back up to get into shooting range
            if (dist < 1.5) {
                // Move away from captor
                inputs.moveX = -dx / Math.max(dist, 0.1);
                inputs.moveZ = -dz / Math.max(dist, 0.1);
            } else if (dist > 3) {
                // Too far, get closer
                inputs.moveX = dx / dist;
                inputs.moveZ = dz / dist;
            }
            // Between 1.5-3: stay put and shoot
            
            // Shoot if in valid range
            if (dist >= 1 && dist <= AI_CONFIG.SHOOT_RANGE) {
                inputs.shoot = { dirX: dx / dist, dirZ: dz / dist };
            }
            
            return inputs;
        }
    },
    
    exitCarToRescue: {
        preconditions: { playerInCar: true, guntherCaptured: true },
        effects: { playerInCar: false, playerNearCar: true },
        cost: 1,  // Low cost - rescuing is urgent
        execute: () => ({ exitCar: true })
    },
    
    exitCarToGrab: {
        preconditions: { playerInCar: true, guntherLoose: true },
        effects: { playerInCar: false, playerNearCar: true },
        cost: 1,
        execute: () => ({ exitCar: true })
    }
};

function moveToward(player, target) {
    if (!target) return {};
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return {};
    return { moveX: dx / dist, moveZ: dz / dist };
}

function shootAt(player, target) {
    if (!target) return {};
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > AI_CONFIG.SHOOT_RANGE) return {};
    // Allow point-blank shooting - just need a direction
    const safeDist = Math.max(dist, 0.1);
    return { shoot: { dirX: dx / safeDist, dirZ: dz / safeDist } };
}

// ============================================================================
// GOAP PLANNER (A* over action space)
// ============================================================================

function satisfies(state, conditions) {
    for (const [key, value] of Object.entries(conditions)) {
        if (state[key] !== value) return false;
    }
    return true;
}

function applyEffects(state, effects) {
    return { ...state, ...effects };
}

function getApplicableActions(state) {
    const applicable = [];
    for (const [name, action] of Object.entries(ACTIONS)) {
        if (satisfies(state, action.preconditions)) {
            applicable.push({ name, ...action });
        }
    }
    return applicable;
}

function stateKey(state) {
    return JSON.stringify(
        Object.fromEntries(
            Object.entries(state).filter(([k]) => !k.startsWith('_'))
        )
    );
}

function plan(startState, goalConditions, maxDepth = 10) {
    if (satisfies(startState, goalConditions)) {
        return [];
    }
    
    const queue = [[0, startState, []]];
    const visited = new Set();
    
    while (queue.length > 0) {
        queue.sort((a, b) => a[0] - b[0]);
        const [cost, state, actions] = queue.shift();
        
        const key = stateKey(state);
        if (visited.has(key)) continue;
        visited.add(key);
        
        if (actions.length >= maxDepth) continue;
        
        for (const action of getApplicableActions(state)) {
            const newState = applyEffects(state, action.effects);
            // Preserve runtime references
            for (const k of Object.keys(state)) {
                if (k.startsWith('_')) newState[k] = state[k];
            }
            
            const newActions = [...actions, action.name];
            const newCost = cost + action.cost;
            
            if (satisfies(newState, goalConditions)) {
                return newActions;
            }
            
            queue.push([newCost, newState, newActions]);
        }
    }
    
    return null;
}

// ============================================================================
// AI CONTROLLER
// ============================================================================

class AIController {
    constructor() {
        this.lastShootTime = 0;
        this.currentPlan = null;
        this.lastPlanTime = 0;
        this.lastGuntherState = null;
        this.lastCaptorId = null;
    }
    
    decide(state) {
        const { gameState, time } = state;
        
        if (gameState !== 'playing') {
            return {};
        }
        
        const worldState = createWorldState(state);
        
        // Re-plan if needed
        const needsReplan = !this.currentPlan || 
            this.currentPlan.length === 0 ||
            time - this.lastPlanTime > AI_CONFIG.PLAN_REFRESH_INTERVAL ||
            this.stateChanged(state);
        
        if (needsReplan) {
            this.currentPlan = this.createPlan(worldState);
            this.lastPlanTime = time;
            this.lastGuntherState = state.gunther.state;
        }
        
        // Execute first action in plan
        while (this.currentPlan && this.currentPlan.length > 0) {
            const actionName = this.currentPlan[0];
            const action = ACTIONS[actionName];
            
            if (action && satisfies(worldState, action.preconditions)) {
                const inputs = action.execute(worldState);
                
                // Handle shoot cooldown
                if (inputs.shoot) {
                    if (time - this.lastShootTime < AI_CONFIG.SHOOT_COOLDOWN) {
                        delete inputs.shoot;
                    } else {
                        this.lastShootTime = time;
                    }
                }
                
                // Movement actions are continuous, don't pop them
                // Action-based effects (enterCar, exitCar, etc) pop immediately
                if (inputs.enterCar || inputs.exitCar || inputs.grabGunther || inputs.holdHand) {
                    this.currentPlan.shift();
                }
                
                return inputs;
            } else {
                // Preconditions no longer met - skip this action and try next
                this.currentPlan.shift();
                // If plan is now empty, replan immediately
                if (this.currentPlan.length === 0) {
                    this.currentPlan = this.createPlan(worldState);
                    this.lastPlanTime = time;
                }
            }
        }
        
        // No plan - try to create one
        this.currentPlan = this.createPlan(worldState);
        this.lastPlanTime = time;
        
        // Try to execute the new plan
        if (this.currentPlan && this.currentPlan.length > 0) {
            const actionName = this.currentPlan[0];
            const action = ACTIONS[actionName];
            if (action && satisfies(worldState, action.preconditions)) {
                return action.execute(worldState);
            }
        }
        
        return {};
    }
    
    stateChanged(state) {
        // Immediate replan on gunther state changes
        if (state.gunther.state !== this.lastGuntherState) {
            return true;
        }
        // Replan if captor died
        if (this.lastCaptorId && !state.enemies.find(e => e.id === this.lastCaptorId)) {
            this.lastCaptorId = null;
            return true;
        }
        // Track captor
        if (state.gunther.captorId) {
            this.lastCaptorId = state.gunther.captorId;
        }
        return false;
    }
    
    createPlan(worldState) {
        let goal;
        
        if (worldState.guntherCaptured) {
            goal = { guntherLoose: true };
        } else if (worldState.guntherLoose) {
            goal = { guntherSafe: true };
        } else if (worldState.guntherHolding) {
            goal = { guntherSafe: true };
        } else if (!worldState.playerInCar && worldState.guntherSafe) {
            goal = { playerInCar: true };
        } else {
            goal = { reachedGoal: true };
        }
        
        const actionPlan = plan(worldState, goal);
        return actionPlan;
    }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        AIController, 
        AI_CONFIG, 
        createWorldState, 
        plan, 
        ACTIONS, 
        satisfies, 
        getApplicableActions 
    };
}

if (typeof window !== 'undefined') {
    window.AICore = { AIController, AI_CONFIG };
}
