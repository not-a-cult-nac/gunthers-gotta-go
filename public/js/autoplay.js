// AutoplayController - AI that plays the game
// Writes to GameInput, reads game state from socket updates

const AutoplayController = {
    enabled: false,
    reactionDelay: 0.3,
    guntherEscapedAt: null,
    lastState: null,
    
    // Tuning
    SHOOT_RANGE: 30,
    AIM_SPEED: 4,
    
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
    
    // Called when new game state arrives from server
    updateState(state) {
        this.lastState = state;
    },
    
    // Call each frame
    update(dt, localState) {
        if (!this.enabled || !this.lastState) return;
        
        const state = this.lastState;
        const { car, gunther, enemies, myPlayerId, players } = state;
        const { carRotation, inCar, isDriver, player } = localState;
        
        // Reset movement
        GameInput.moveForward = 0;
        GameInput.moveSide = 0;
        
        // Decision priority
        if (this.handleGuntherEmergency(dt, state, localState)) return;
        if (this.handleThreats(dt, state, localState)) return;
        if (this.handleGuntherManagement(dt, state, localState)) return;
        this.handleProgress(dt, state, localState);
    },
    
    handleGuntherEmergency(dt, state, local) {
        const { gunther, enemies } = state;
        const { inCar, isDriver } = local;
        
        if (!gunther || gunther.state === 'in_car') {
            this.guntherEscapedAt = null;
            return false;
        }
        
        // Track escape time for reaction delay
        if (!this.guntherEscapedAt) {
            this.guntherEscapedAt = performance.now();
        }
        
        if (performance.now() - this.guntherEscapedAt < this.reactionDelay * 1000) {
            return false;
        }
        
        // Check if Gunther is near danger
        let nearDanger = false;
        
        // Check enemies
        if (enemies) {
            for (const e of enemies) {
                if (e.hasGunther) {
                    nearDanger = true;
                    break;
                }
                const dist = Math.hypot(gunther.x - e.x, gunther.z - e.z);
                if (dist < 12) {
                    nearDanger = true;
                    break;
                }
            }
        }
        
        // Check if captured or trapped
        if (gunther.state === 'captured' || gunther.state === 'trapped') {
            nearDanger = true;
        }
        
        if (!nearDanger && gunther.state !== 'wandering') return false;
        
        // If we're in car and Gunther is loose, maybe exit
        if (inCar && isDriver && gunther.state === 'wandering') {
            // Only exit if Gunther is close enough to grab
            const car = state.car;
            if (car) {
                const distToCar = Math.hypot(gunther.x - car.x, gunther.z - car.z);
                if (distToCar < 15) {
                    GameInput.triggerAction('enterExit');
                    return true;
                }
            }
        }
        
        // If on foot, try to grab Gunther
        if (!inCar && gunther.state === 'wandering') {
            const player = local.player;
            if (player) {
                const dist = Math.hypot(gunther.x - player.position.x, gunther.z - player.position.z);
                if (dist < 4) {
                    GameInput.triggerAction('holdHand');
                }
                // Move toward Gunther
                this.moveToward({ x: gunther.x, z: gunther.z }, player.position);
            }
            return true;
        }
        
        return false;
    },
    
    handleThreats(dt, state, local) {
        const { enemies, car } = state;
        const { inCar, isDriver, carRotation } = local;
        
        if (!inCar || !isDriver || !enemies || !car) return false;
        
        // Find closest enemy
        let closest = null;
        let closestDist = Infinity;
        
        for (const e of enemies) {
            const dist = Math.hypot(e.x - car.x, e.z - car.z);
            if (dist < closestDist && dist < this.SHOOT_RANGE) {
                closestDist = dist;
                closest = e;
            }
        }
        
        if (!closest) return false;
        
        // Aim at enemy
        const targetAngle = Math.atan2(closest.x - car.x, closest.z - car.z);
        const angleDiff = this.normalizeAngle(targetAngle - carRotation);
        
        // Turn toward target
        GameInput.aimX = -Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.AIM_SPEED * dt);
        
        // Shoot if aimed
        if (Math.abs(angleDiff) < 0.25) {
            GameInput.triggerAction('shoot');
        }
        
        // Keep moving forward while shooting
        GameInput.moveForward = 0.5;
        
        return true;
    },
    
    handleGuntherManagement(dt, state, local) {
        const { gunther, car } = state;
        const { inCar, player } = local;
        
        if (!gunther || gunther.state !== 'holding_hands') return false;
        
        // If we're holding Gunther and on foot, get back to car
        if (!inCar && car && player) {
            const distToCar = Math.hypot(car.x - player.position.x, car.z - player.position.z);
            
            if (distToCar < 5) {
                // Enter car (which puts Gunther back)
                GameInput.triggerAction('enterExit');
                return true;
            }
            
            // Move toward car
            this.moveToward({ x: car.x, z: car.z }, player.position);
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
                this.moveToward({ x: car.x, z: car.z }, player.position);
            }
            return;
        }
        
        // Drive toward goal (positive Z)
        if (inCar && isDriver) {
            // Aim forward
            const targetAngle = 0;
            const angleDiff = this.normalizeAngle(targetAngle - carRotation);
            GameInput.aimX = -Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.AIM_SPEED * dt);
            
            // Drive forward
            GameInput.moveForward = 1;
        }
    },
    
    moveToward(target, from) {
        const dx = target.x - from.x;
        const dz = target.z - from.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist > 0.5) {
            // Simple: just move toward target in world space
            // This works because player movement uses forward vector based on camera
            GameInput.moveForward = dz > 0 ? 1 : -1;
            GameInput.moveSide = dx > 0 ? 1 : -1;
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
