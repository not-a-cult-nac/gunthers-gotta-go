// GOAP (Goal-Oriented Action Planning) AI
// Replaces priority-based decision tree with A* planning over action space

const AI_CONFIG = {
    THREAT_RANGE: 25,
    GRAB_RANGE: 5,
    CAR_ENTER_RANGE: 5,
    SHOOT_RANGE: 50,
    SHOOT_COOLDOWN: 0.15,
    PLAN_REFRESH_INTERVAL: 0.5  // Re-plan every 0.5s or when state changes significantly
};

// ============================================================================
// WORLD STATE
// ============================================================================

// World state is a flat object of boolean/numeric properties
// GOAP treats this as a vector that actions can modify

function createWorldState(gameState) {
    const { player, gunther, enemies, car, gameState: state } = gameState;
    
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
        reachedGoal: car.z >= gameState.goalZ,
        
        // Targets (for movement actions)
        _gunther: gunther,
        _car: car,
        _captor: captor,
        _nearestEnemy: nearestEnemy?.enemy,
        _player: player,
        _enemies: enemies
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

// Each action has:
//   - preconditions: what must be true to perform this action
//   - effects: what becomes true after performing this action
//   - cost: how expensive is this action (lower = preferred)
//   - execute: returns the actual inputs to send

const ACTIONS = {
    enterCar: {
        preconditions: { playerNearCar: true, playerInCar: false },
        effects: { playerInCar: true },
        cost: 1,
        execute: () => ({ enterCar: true })
    },
    
    exitCar: {
        preconditions: { playerInCar: true },
        effects: { playerInCar: false },
        cost: 2,  // Slightly expensive - prefer staying in car
        execute: () => ({ exitCar: true })
    },
    
    drive: {
        preconditions: { playerInCar: true, guntherSafe: true },
        effects: { reachedGoal: true },  // Simplification: driving leads to goal
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
    
    grabGunther: {
        preconditions: { playerNearGunther: true, guntherLoose: true, playerNearCar: true },
        effects: { guntherSafe: true, guntherLoose: false },
        cost: 1,
        execute: () => ({ grabGunther: true })
    },
    
    holdHand: {
        preconditions: { playerNearGunther: true, guntherLoose: true, playerNearCar: false },
        effects: { guntherHolding: true, guntherLoose: false },
        cost: 1,
        execute: () => ({ holdHand: true })
    },
    
    leadToCarHolding: {
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
        preconditions: { playerInCar: false, playerNearCar: false },
        effects: { playerNearCar: true },
        cost: 3,
        execute: (state) => moveToward(state._player, state._car)
    },
    
    moveToCaptor: {
        preconditions: { guntherCaptured: true, captorAlive: true, playerNearCaptor: false },
        effects: { playerNearCaptor: true },
        cost: 2,
        execute: (state) => moveToward(state._player, state._captor)
    },
    
    shootCaptor: {
        preconditions: { guntherCaptured: true, captorAlive: true, playerNearCaptor: true },
        effects: { captorAlive: false, guntherCaptured: false, guntherLoose: true },
        cost: 1,
        execute: (state) => shootAt(state._player, state._captor)
    },
    
    shootThreat: {
        preconditions: { hasThreats: true },
        effects: {},  // Doesn't directly achieve goals, but has utility
        cost: 5,  // Lower priority than goal-directed actions
        execute: (state) => shootAt(state._player, state._nearestEnemy)
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
    if (dist < 1 || dist > AI_CONFIG.SHOOT_RANGE) return {};
    return { shoot: { dirX: dx / dist, dirZ: dz / dist } };
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

// A* search to find cheapest action sequence to goal
function plan(startState, goalConditions, maxDepth = 10) {
    // If goal already satisfied, no actions needed
    if (satisfies(startState, goalConditions)) {
        return [];
    }
    
    // Priority queue: [cost, state, actionSequence]
    const queue = [[0, startState, []]];
    const visited = new Set();
    
    while (queue.length > 0) {
        // Sort by cost (poor man's priority queue)
        queue.sort((a, b) => a[0] - b[0]);
        const [cost, state, actions] = queue.shift();
        
        // Create state key for visited check (ignore underscore properties)
        const stateKey = JSON.stringify(
            Object.fromEntries(
                Object.entries(state).filter(([k]) => !k.startsWith('_'))
            )
        );
        
        if (visited.has(stateKey)) continue;
        visited.add(stateKey);
        
        if (actions.length >= maxDepth) continue;
        
        // Try each applicable action
        for (const action of getApplicableActions(state)) {
            const newState = applyEffects(state, action.effects);
            // Preserve runtime references
            newState._gunther = state._gunther;
            newState._car = state._car;
            newState._captor = state._captor;
            newState._nearestEnemy = state._nearestEnemy;
            newState._player = state._player;
            newState._enemies = state._enemies;
            
            const newActions = [...actions, action.name];
            const newCost = cost + action.cost;
            
            // Goal reached?
            if (satisfies(newState, goalConditions)) {
                return newActions;
            }
            
            queue.push([newCost, newState, newActions]);
        }
    }
    
    return null; // No plan found
}

// ============================================================================
// AI CONTROLLER
// ============================================================================

class GOAPController {
    constructor() {
        this.lastShootTime = 0;
        this.currentPlan = null;
        this.lastPlanTime = 0;
    }
    
    decide(gameState) {
        if (gameState.gameState !== 'playing') {
            return {};
        }
        
        const worldState = createWorldState(gameState);
        const time = gameState.time;
        
        // Re-plan if needed
        if (!this.currentPlan || 
            this.currentPlan.length === 0 ||
            time - this.lastPlanTime > AI_CONFIG.PLAN_REFRESH_INTERVAL ||
            this.shouldReplan(worldState)) {
            
            this.currentPlan = this.createPlan(worldState);
            this.lastPlanTime = time;
        }
        
        // Execute first action in plan
        if (this.currentPlan && this.currentPlan.length > 0) {
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
                
                // Check if action completes (effects satisfied)
                const projectedState = applyEffects(worldState, action.effects);
                if (satisfies(projectedState, action.effects)) {
                    this.currentPlan.shift(); // Remove completed action
                }
                
                return inputs;
            } else {
                // Preconditions no longer met, need to replan
                this.currentPlan = null;
            }
        }
        
        return {};
    }
    
    createPlan(worldState) {
        // Define goal based on current situation
        let goal;
        
        if (worldState.guntherCaptured) {
            // Priority: rescue Gunther
            goal = { guntherLoose: true, captorAlive: false };
        } else if (worldState.guntherLoose) {
            // Priority: secure Gunther
            goal = { guntherSafe: true };
        } else if (worldState.guntherHolding) {
            // Priority: get Gunther to car
            goal = { guntherSafe: true };
        } else if (!worldState.playerInCar && worldState.guntherSafe) {
            // Priority: get back in car
            goal = { playerInCar: true };
        } else {
            // Priority: reach goal
            goal = { reachedGoal: true };
        }
        
        const actionPlan = plan(worldState, goal);
        
        if (!actionPlan || actionPlan.length === 0) {
            // Fallback: if we have threats, shoot them
            if (worldState.hasThreats && worldState.nearestEnemyDist < AI_CONFIG.SHOOT_RANGE) {
                return ['shootThreat'];
            }
            return null;
        }
        
        return actionPlan;
    }
    
    shouldReplan(worldState) {
        // Replan on significant state changes
        if (worldState.guntherCaptured) return true;
        if (worldState.guntherLoose && !this.wasGuntherLoose) {
            this.wasGuntherLoose = true;
            return true;
        }
        if (!worldState.guntherLoose) {
            this.wasGuntherLoose = false;
        }
        return false;
    }
}

// Export same interface as original AI
class AIController extends GOAPController {}

module.exports = { AIController, AI_CONFIG, GOAPController, ACTIONS, plan, createWorldState };
