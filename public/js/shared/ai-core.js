// SHARED AI CORE
// This is the single source of truth for AI decision making
// Used by: headless tests, browser autoplay

const AI_CONFIG = {
    // Combat
    SHOOT_RANGE: 50,
    SHOOT_COOLDOWN_TICKS: 9,     // ticks between shots (~0.15s at 60fps)
    
    // Interaction ranges
    GRAB_RANGE: 3.5,             // Must be < 4 (holdHand range in game-core)
    CAR_ENTER_RANGE: 5,
    
    // Human-like constraints (in ticks, 1 tick = 1 simulation frame)
    REACTION_TICKS: 54,          // ticks to notice state changes (~0.9s at 60fps)
    AIM_TICKS: 6,                // ticks to acquire target before first shot (~0.1s at 60fps)
};

class AIController {
    constructor() {
        this.tickCount = 0;
        this.lastShootTick = 0;
        
        // Reaction tracking
        this.lastGuntherState = null;
        this.stateChangeTick = 0;      // Tick when we noticed the change
        this.currentTarget = null;
        this.targetAcquiredTick = 0;   // Tick when we started aiming at current target
    }
    
    // Main decision function: state → inputs
    // Returns the same format for both headless and browser
    decide(state) {
        const { player, gunther, enemies, car, gameState } = state;
        
        if (gameState !== 'playing') {
            return {};
        }
        
        // Increment tick counter
        this.tickCount++;
        
        // Track Gunther state changes for reaction time
        if (gunther.state !== this.lastGuntherState) {
            this.stateChangeTick = this.tickCount;
            this.lastGuntherState = gunther.state;
        }
        
        // Check if we're still "reacting" to the state change
        const reactionComplete = (this.tickCount - this.stateChangeTick) >= AI_CONFIG.REACTION_TICKS;
        
        const inputs = {};
        
        if (player.inCar) {
            this.decideInCar(state, inputs, reactionComplete);
        } else {
            this.decideOnFoot(state, inputs, reactionComplete);
        }
        
        return inputs;
    }
    
    decideInCar(state, inputs, reactionComplete) {
        const { gunther, car, goalZ } = state;
        const GOAL_Z = goalZ || 440;
        
        // Check if we should exit (only after reaction time)
        if (reactionComplete && this.shouldExitCar(state)) {
            inputs.exitCar = true;
            return;
        }
        
        // Drive toward goal
        const goalDist = GOAL_Z - car.z;
        const steerAmount = Math.max(-1, Math.min(1, -car.x * 0.02));
        
        inputs.drive = goalDist > 0 ? 1 : 0;
        inputs.steer = steerAmount;
    }
    
    shouldExitCar(state) {
        const { gunther } = state;
        
        // Exit if Gunther escaped
        if (gunther.state === 'wandering' || gunther.state === 'trapped') {
            return true;
        }
        
        // Exit if Gunther captured
        if (gunther.state === 'captured') {
            return true;
        }
        
        return false;
    }
    
    decideOnFoot(state, inputs, reactionComplete) {
        const { player, gunther, car } = state;
        
        // Priority 1: Gunther captured - kill captor (react immediately to this!)
        if (gunther.state === 'captured') {
            this.handleCapturedGunther(state, inputs);
            return;
        }
        
        // Priority 2: Gunther loose - grab him (after reaction time)
        if ((gunther.state === 'wandering' || gunther.state === 'trapped') && reactionComplete) {
            this.handleLooseGunther(state, inputs);
            return;
        }
        
        // Priority 3: Gunther holding hands - get to car
        if (gunther.state === 'holding_hands') {
            this.handleHoldingGunther(state, inputs);
            return;
        }
        
        // Priority 4: Gunther in car - get back in
        if (gunther.state === 'in_car') {
            this.moveToward(state, inputs, car.x, car.z);
            const carDist = Math.hypot(player.x - car.x, player.z - car.z);
            if (carDist < AI_CONFIG.CAR_ENTER_RANGE) {
                inputs.enterCar = true;
            }
            this.shootNearestEnemy(state, inputs);
        }
    }
    
    handleCapturedGunther(state, inputs) {
        const { player, gunther, enemies } = state;
        
        const captor = enemies.find(e => e.id === gunther.captorId);
        if (!captor) return;
        
        const dx = captor.x - player.x;
        const dz = captor.z - player.z;
        const dist = Math.hypot(dx, dz);
        
        // Track target acquisition for aim time
        if (this.currentTarget !== captor.id) {
            this.currentTarget = captor.id;
            this.targetAcquiredTick = this.tickCount;
        }
        const aimReady = (this.tickCount - this.targetAcquiredTick) >= AI_CONFIG.AIM_TICKS;
        
        // Shoot directly at captor (even at close range, min 0.3 to avoid point-blank issues)
        if (dist < AI_CONFIG.SHOOT_RANGE && 
            dist > 0.3 &&
            aimReady &&
            (this.tickCount - this.lastShootTick) >= AI_CONFIG.SHOOT_COOLDOWN_TICKS) {
            
            const dirX = dx / dist;
            const dirZ = dz / dist;
            inputs.shoot = { dirX, dirZ };
            this.lastShootTick = this.tickCount;
        }
        
        // Move toward captor
        this.moveToward(state, inputs, captor.x, captor.z);
    }
    
    handleLooseGunther(state, inputs) {
        const { player, gunther, car } = state;
        
        const guntherDist = Math.hypot(gunther.x - player.x, gunther.z - player.z);
        const carDist = Math.hypot(car.x - player.x, car.z - player.z);
        
        // Close to Gunther?
        if (guntherDist < AI_CONFIG.GRAB_RANGE) {
            // Close to car too? Grab him into car
            if (carDist < 8) {
                inputs.grabGunther = true;
                return;
            }
            // Far from car? Hold hand and lead him back
            inputs.holdHand = true;
            return;
        }
        
        // Not close to Gunther - run to him
        this.moveToward(state, inputs, gunther.x, gunther.z);
    }
    
    handleHoldingGunther(state, inputs) {
        const { player, car } = state;
        
        const carDist = Math.hypot(car.x - player.x, car.z - player.z);
        
        // If at car, get in
        if (carDist < AI_CONFIG.CAR_ENTER_RANGE) {
            inputs.enterCar = true;
            return;
        }
        
        // Move toward car
        this.moveToward(state, inputs, car.x, car.z);
    }
    
    shootNearestEnemy(state, inputs) {
        const { player, enemies } = state;
        
        if ((this.tickCount - this.lastShootTick) < AI_CONFIG.SHOOT_COOLDOWN_TICKS) return;
        
        let nearest = null;
        let nearestDist = Infinity;
        
        for (const enemy of enemies) {
            const dist = Math.hypot(enemy.x - player.x, enemy.z - player.z);
            if (dist < AI_CONFIG.SHOOT_RANGE && dist > 0.3 && dist < nearestDist) {
                nearestDist = dist;
                nearest = enemy;
            }
        }
        
        if (!nearest) return;
        
        // Track target acquisition for aim time
        if (this.currentTarget !== nearest.id) {
            this.currentTarget = nearest.id;
            this.targetAcquiredTick = this.tickCount;
        }
        const aimReady = (this.tickCount - this.targetAcquiredTick) >= AI_CONFIG.AIM_TICKS;
        if (!aimReady) return;
        
        const dx = nearest.x - player.x;
        const dz = nearest.z - player.z;
        const dirX = dx / nearestDist;
        const dirZ = dz / nearestDist;
        inputs.shoot = { dirX, dirZ };
        this.lastShootTick = this.tickCount;
    }
    
    // Movement: returns moveX, moveZ in WORLD space (not player-relative)
    moveToward(state, inputs, targetX, targetZ) {
        const { player } = state;
        
        const dx = targetX - player.x;
        const dz = targetZ - player.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist < 0.5) return;
        
        // Return normalized world-space movement direction
        inputs.moveX = dx / dist;
        inputs.moveZ = dz / dist;
    }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIController, AI_CONFIG };
}

if (typeof window !== 'undefined') {
    window.AICore = { AIController, AI_CONFIG };
}
