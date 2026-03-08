// Pure AI - takes state, returns inputs
// No side effects, no timers, just decision making

const AI_CONFIG = {
    THREAT_RANGE: 25,      // Exit car when enemy this close
    GRAB_RANGE: 5,         // Try to grab Gunther when this close
    CAR_ENTER_RANGE: 5,    // Get in car when this close
    SHOOT_RANGE: 50,       // Max shooting distance
    SHOOT_COOLDOWN: 0.15   // Seconds between shots (fast!)
};

class AIController {
    constructor() {
        this.lastShootTime = 0;
    }
    
    // Main decision function: state → inputs
    decide(state) {
        const { player, gunther, enemies, car, gameState, time } = state;
        
        if (gameState !== 'playing') {
            return {};
        }
        
        const inputs = {};
        
        if (player.inCar) {
            this.decideInCar(state, inputs);
        } else {
            this.decideOnFoot(state, inputs);
        }
        
        return inputs;
    }
    
    decideInCar(state, inputs) {
        const { player, gunther, enemies, car, goalZ, time } = state;
        
        // Check if we should exit
        const shouldExit = this.shouldExitCar(state);
        
        if (shouldExit) {
            inputs.exitCar = true;
            return;
        }
        
        // Drive toward goal
        const goalDist = goalZ - car.z;
        const goalAngle = -car.rotation; // Simplification: goal is at x=0
        
        // Steer toward goal
        const steerAmount = Math.max(-1, Math.min(1, -car.x * 0.02));
        
        inputs.drive = goalDist > 0 ? 1 : 0;
        inputs.steer = steerAmount;
    }
    
    shouldExitCar(state) {
        const { gunther } = state;
        
        // ONLY exit if Gunther is not safe in car
        // If he's in the car, DRIVE - don't exit to fight
        
        // Exit if Gunther escaped
        if (gunther.state === 'wandering' || gunther.state === 'trapped') {
            return true;
        }
        
        // Exit if Gunther captured
        if (gunther.state === 'captured') {
            return true;
        }
        
        // Gunther in car or holding hands? Stay in / don't exit
        return false;
    }
    
    decideOnFoot(state, inputs) {
        const { player, gunther, enemies, car, time } = state;
        
        // Priority 1: Gunther captured - kill captor
        if (gunther.state === 'captured') {
            this.handleCapturedGunther(state, inputs);
            return;
        }
        
        // Priority 2: Gunther loose - grab him
        if (gunther.state === 'wandering' || gunther.state === 'trapped') {
            this.handleLooseGunther(state, inputs);
            return;
        }
        
        // Priority 3: Gunther holding hands - get to car
        if (gunther.state === 'holding_hands') {
            this.handleHoldingGunther(state, inputs);
            return;
        }
        
        // Priority 4: Gunther in car - GET BACK IN IMMEDIATELY
        if (gunther.state === 'in_car') {
            this.moveToward(state, inputs, car.x, car.z);
            const carDist = Math.hypot(player.x - car.x, player.z - car.z);
            if (carDist < AI_CONFIG.CAR_ENTER_RANGE) {
                inputs.enterCar = true;
            }
            // Shoot threats while returning
            this.shootNearestEnemy(state, inputs);
        }
    }
    
    handleCapturedGunther(state, inputs) {
        const { player, gunther, enemies, time } = state;
        
        const captor = enemies.find(e => e.id === gunther.captorId);
        if (!captor) return;
        
        const dx = captor.x - player.x;
        const dz = captor.z - player.z;
        const dist = Math.hypot(dx, dz);
        
        // Shoot directly at captor (don't depend on player.rotation)
        if (dist < AI_CONFIG.SHOOT_RANGE && 
            dist > 1 &&  // Not too close
            time - this.lastShootTime > AI_CONFIG.SHOOT_COOLDOWN) {
            
            // Shoot directly toward captor
            const dirX = dx / dist;
            const dirZ = dz / dist;
            inputs.shoot = { dirX, dirZ };
            this.lastShootTime = time;
        }
        
        // Sprint toward captor
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
        const { player, car, gunther, time } = state;
        
        const carDist = Math.hypot(car.x - player.x, car.z - player.z);
        
        // If at car, get in (which brings Gunther)
        if (carDist < AI_CONFIG.CAR_ENTER_RANGE) {
            inputs.enterCar = true;
            return;
        }
        
        // Move toward car
        this.moveToward(state, inputs, car.x, car.z);
        
        // Shoot threats along the way
        this.shootNearestEnemy(state, inputs);
    }
    
    shootNearestEnemy(state, inputs) {
        const { player, enemies, time } = state;
        
        if (time - this.lastShootTime < AI_CONFIG.SHOOT_COOLDOWN) return;
        
        // Find nearest enemy in range
        let nearest = null;
        let nearestDist = Infinity;
        
        for (const enemy of enemies) {
            const dist = Math.hypot(enemy.x - player.x, enemy.z - player.z);
            if (dist < AI_CONFIG.SHOOT_RANGE && dist > 1 && dist < nearestDist) {
                nearestDist = dist;
                nearest = enemy;
            }
        }
        
        if (!nearest) return;
        
        // Shoot directly at target
        const dx = nearest.x - player.x;
        const dz = nearest.z - player.z;
        const dirX = dx / nearestDist;
        const dirZ = dz / nearestDist;
        inputs.shoot = { dirX, dirZ };
        this.lastShootTime = time;
    }
    
    moveToward(state, inputs, targetX, targetZ) {
        const { player } = state;
        
        const dx = targetX - player.x;
        const dz = targetZ - player.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist < 0.5) return;
        
        // Normalized movement direction
        inputs.moveX = dx / dist;
        inputs.moveZ = dz / dist;
        
        // Update player rotation to face movement
        // This helps with aiming
    }
    
    nearestEnemyDistance(state) {
        const { car, enemies } = state;
        let minDist = Infinity;
        
        for (const enemy of enemies) {
            const dist = Math.hypot(enemy.x - car.x, enemy.z - car.z);
            if (dist < minDist) minDist = dist;
        }
        
        return minDist;
    }
    
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
}

module.exports = { AIController, AI_CONFIG };
