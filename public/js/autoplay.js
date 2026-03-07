// AutoplayController - AI that plays the game
// Writes to GameInput, reads game state from socket updates

const AutoplayController = {
    enabled: false,
    lastState: null,
    lastShootTime: 0,
    
    // Tuning - aggressive settings
    SHOOT_RANGE: 45,           // Shoot enemies from further away
    SHOOT_COOLDOWN: 150,       // ms between shots
    AIM_SPEED: 6,              // Faster aiming
    PRIORITY_RANGE: 25,        // Prioritize enemies this close
    
    init() {
        console.log('[Autoplay] Controller initialized');
    },
    
    enable() {
        this.enabled = true;
        GameInput.isAutoplay = true;
        GameInput.clear();
        console.log('[Autoplay] Enabled');
    },
    
    disable() {
        this.enabled = false;
        GameInput.isAutoplay = false;
        GameInput.clear();
        console.log('[Autoplay] Disabled');
    },
    
    updateState(state) {
        this.lastState = state;
    },
    
    update(dt, localState) {
        if (!this.enabled || !this.lastState) return;
        
        const state = this.lastState;
        const { car, gunther, enemies } = state;
        const { carRotation, inCar, isDriver, player } = localState;
        
        // Reset movement
        GameInput.moveForward = 0;
        GameInput.moveSide = 0;
        
        // STRATEGY: Stay in car and shoot. Only exit if Gunther needs hand-holding rescue.
        
        // Priority 1: If we have Gunther by hand, get back to car ASAP
        if (this.handleGuntherReturn(dt, state, localState)) return;
        
        // Priority 2: ALWAYS try to shoot enemies if we're in the car
        const shotFired = this.handleCombat(dt, state, localState);
        
        // Priority 3: If Gunther is loose and close, consider grabbing (but only if no immediate threats)
        if (!shotFired && this.handleGuntherRescue(dt, state, localState)) return;
        
        // Priority 4: Drive toward goal while shooting
        this.handleProgress(dt, state, localState);
    },
    
    handleCombat(dt, state, local) {
        const { enemies, car, gunther } = state;
        const { inCar, isDriver, carRotation } = local;
        
        if (!inCar || !isDriver || !enemies || !car) return false;
        
        // Find best target:
        // 1. Enemy that has Gunther (highest priority)
        // 2. Closest enemy in range
        let target = null;
        let targetPriority = Infinity;
        
        for (const e of enemies) {
            const dist = Math.hypot(e.x - car.x, e.z - car.z);
            
            if (dist > this.SHOOT_RANGE) continue;
            
            let priority = dist;
            
            // Enemy has Gunther = top priority
            if (e.hasGunther) {
                priority = -1000;
            }
            // Enemy close to Gunther = high priority
            else if (gunther && gunther.state === 'wandering') {
                const distToGunther = Math.hypot(e.x - gunther.x, e.z - gunther.z);
                if (distToGunther < 15) {
                    priority = distToGunther - 100;  // Prioritize enemies near Gunther
                }
            }
            // Close enemies = higher priority
            else if (dist < this.PRIORITY_RANGE) {
                priority = dist - 50;
            }
            
            if (priority < targetPriority) {
                targetPriority = priority;
                target = e;
            }
        }
        
        if (!target) return false;
        
        // Aim at target
        const targetAngle = Math.atan2(target.x - car.x, target.z - car.z);
        const angleDiff = this.normalizeAngle(targetAngle - carRotation);
        
        // Turn toward target
        const turnAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.AIM_SPEED * dt);
        GameInput.moveSide = -turnAmount * 2;  // Use moveSide for turning
        
        // Shoot if aimed well enough
        const now = performance.now();
        if (Math.abs(angleDiff) < 0.35 && now - this.lastShootTime > this.SHOOT_COOLDOWN) {
            GameInput.triggerAction('shoot');
            this.lastShootTime = now;
        }
        
        // Keep moving forward while shooting (slower when aiming)
        GameInput.moveForward = Math.abs(angleDiff) < 0.5 ? 0.7 : 0.4;
        
        return true;
    },
    
    handleGuntherRescue(dt, state, local) {
        const { gunther, car, enemies } = state;
        const { inCar, isDriver, player } = local;
        
        if (!gunther) return false;
        
        // Only rescue if Gunther is wandering (not captured - we shoot for that)
        if (gunther.state !== 'wandering') return false;
        
        // Check if any enemies are close - if so, stay in car and shoot
        if (enemies && car) {
            for (const e of enemies) {
                const dist = Math.hypot(e.x - car.x, e.z - car.z);
                if (dist < 20) {
                    return false;  // Stay in car and let combat handle it
                }
            }
        }
        
        // Gunther is loose and no immediate threats - consider rescue
        if (inCar && car) {
            const distToCar = Math.hypot(gunther.x - car.x, gunther.z - car.z);
            
            // Only exit if Gunther is very close
            if (distToCar < 8) {
                GameInput.triggerAction('enterExit');
                return true;
            }
            
            // Otherwise just drive closer to him
            return false;
        }
        
        // On foot - grab Gunther
        if (!inCar && player) {
            const dist = Math.hypot(gunther.x - player.position.x, gunther.z - player.position.z);
            
            if (dist < 4) {
                GameInput.triggerAction('holdHand');
            }
            
            // Move toward Gunther
            this.moveToward({ x: gunther.x, z: gunther.z }, player.position, local);
            return true;
        }
        
        return false;
    },
    
    handleGuntherReturn(dt, state, local) {
        const { gunther, car } = state;
        const { inCar, player } = local;
        
        if (!gunther || gunther.state !== 'holding_hands') return false;
        
        // We have Gunther by the hand - get back to car!
        if (!inCar && car && player) {
            const distToCar = Math.hypot(car.x - player.position.x, car.z - player.position.z);
            
            if (distToCar < 5) {
                GameInput.triggerAction('enterExit');
                return true;
            }
            
            // Sprint to car
            this.moveToward({ x: car.x, z: car.z }, player.position, local);
            return true;
        }
        
        return false;
    },
    
    handleProgress(dt, state, local) {
        const { car, gunther } = state;
        const { inCar, isDriver, carRotation, player } = local;
        
        // If on foot and Gunther is safe, get back in car
        if (!inCar && gunther && gunther.state === 'in_car' && car && player) {
            const distToCar = Math.hypot(car.x - player.position.x, car.z - player.position.z);
            
            if (distToCar < 5) {
                GameInput.triggerAction('enterExit');
            } else {
                this.moveToward({ x: car.x, z: car.z }, player.position, local);
            }
            return;
        }
        
        // Drive toward goal (positive Z)
        if (inCar && isDriver) {
            // Aim roughly forward
            const targetAngle = 0;
            const angleDiff = this.normalizeAngle(targetAngle - carRotation);
            
            // Gentle steering toward goal
            if (Math.abs(angleDiff) > 0.1) {
                GameInput.moveSide = -Math.sign(angleDiff) * 0.5;
            }
            
            // Full speed ahead
            GameInput.moveForward = 1;
        }
    },
    
    moveToward(target, from, local) {
        const dx = target.x - from.x;
        const dz = target.z - from.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist > 0.5) {
            // Move in direction of target
            const angle = Math.atan2(dx, dz);
            const playerAngle = local.carRotation || 0;
            const relAngle = this.normalizeAngle(angle - playerAngle);
            
            // Forward/back based on whether target is in front
            GameInput.moveForward = Math.cos(relAngle) > 0 ? 1 : -0.5;
            // Strafe based on left/right
            GameInput.moveSide = Math.sin(relAngle) > 0 ? 0.5 : -0.5;
        }
    },
    
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    },
    
    onGameEnd(result, details) {
        if (this.enabled) {
            console.log(`[Autoplay] Game ended: ${result}`, details);
        }
    }
};

window.AutoplayController = AutoplayController;
