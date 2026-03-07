// AutoplayController - AI that plays the game
// Writes to GameInput, reads game state from socket updates

const AutoplayController = {
    enabled: false,
    lastState: null,
    lastShootTime: 0,
    debugLog: true,  // Enable debug logging
    lastDebugTime: 0,
    
    // Tuning - aggressive shooting, conservative rescue
    SHOOT_RANGE: 50,           // Shoot enemies from further away
    SHOOT_COOLDOWN: 100,       // ms between shots (faster!)
    AIM_SPEED: 8,              // Faster aiming
    PRIORITY_RANGE: 30,        // Prioritize enemies this close
    SAFE_EXIT_RANGE: 40,       // Only exit car if ALL enemies are this far
    
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
        // Log Gunther state changes
        if (this.lastState && state.gunther && this.lastState.gunther) {
            if (this.lastState.gunther.state !== state.gunther.state) {
                console.log(`[AI] Gunther state changed: ${this.lastState.gunther.state} -> ${state.gunther.state}`);
            }
        }
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
        
        // Find best target with aggressive prioritization:
        // 1. Enemy that has Gunther (MUST kill immediately)
        // 2. Enemy close to Gunther who's wandering (prevent capture)
        // 3. Enemy heading toward car/Gunther
        // 4. Closest enemy in range
        let target = null;
        let targetPriority = Infinity;
        
        // Reference point: where should we defend?
        const defendX = (gunther && gunther.state === 'wandering') ? gunther.x : car.x;
        const defendZ = (gunther && gunther.state === 'wandering') ? gunther.z : car.z;
        
        for (const e of enemies) {
            const distToCar = Math.hypot(e.x - car.x, e.z - car.z);
            const distToDefend = Math.hypot(e.x - defendX, e.z - defendZ);
            
            if (distToCar > this.SHOOT_RANGE) continue;
            
            let priority = distToCar;
            
            // Enemy has Gunther = ABSOLUTE priority
            if (e.hasGunther) {
                priority = -10000;
            }
            // Enemy very close to loose Gunther = critical
            else if (gunther && gunther.state === 'wandering') {
                const distToGunther = Math.hypot(e.x - gunther.x, e.z - gunther.z);
                if (distToGunther < 8) {
                    priority = -5000 + distToGunther;  // Closer to Gunther = higher priority
                    if (this.debugLog) console.log(`[AI] CRITICAL: Enemy ${e.id} is ${distToGunther.toFixed(1)} from wandering Gunther!`);
                } else if (distToGunther < 15) {
                    priority = -1000 + distToGunther;
                } else if (distToGunther < 25) {
                    priority = -100 + distToGunther;  // Still prioritize somewhat
                }
            }
            // Close to car = high priority
            else if (distToCar < this.PRIORITY_RANGE) {
                priority = distToCar - 200;
            }
            // In range but far = still valid target
            else {
                priority = distToCar;
            }
            
            if (priority < targetPriority) {
                targetPriority = priority;
                target = e;
            }
        }
        
        if (!target) {
            if (this.debugLog && performance.now() - this.lastDebugTime > 2000) {
                console.log('[AI] No targets in range');
                this.lastDebugTime = performance.now();
            }
            return false;
        }
        
        // Aim at target
        const targetAngle = Math.atan2(target.x - car.x, target.z - car.z);
        const angleDiff = this.normalizeAngle(targetAngle - carRotation);
        const distToTarget = Math.hypot(target.x - car.x, target.z - car.z);
        
        // Aggressive turning toward target
        GameInput.moveSide = -Math.sign(angleDiff) * Math.min(Math.abs(angleDiff) * 3, 1.0);
        
        // Shoot if aimed well enough (more generous angle)
        const now = performance.now();
        if (Math.abs(angleDiff) < 0.4 && now - this.lastShootTime > this.SHOOT_COOLDOWN) {
            GameInput.triggerAction('shoot');
            this.lastShootTime = now;
            if (this.debugLog) {
                console.log(`[AI] SHOOTING at enemy ${target.id} (dist=${distToTarget.toFixed(1)}, angle=${angleDiff.toFixed(2)}, priority=${targetPriority.toFixed(0)})`);
            }
        } else if (this.debugLog && now - this.lastDebugTime > 1000) {
            console.log(`[AI] Aiming at enemy ${target.id} (dist=${distToTarget.toFixed(1)}, angle=${angleDiff.toFixed(2)}, priority=${targetPriority.toFixed(0)})`);
            this.lastDebugTime = now;
        }
        
        // Keep moving forward while shooting
        // Slow down more when aiming at priority targets
        const isPriorityTarget = targetPriority < 0;
        GameInput.moveForward = isPriorityTarget ? 0.3 : (Math.abs(angleDiff) < 0.5 ? 0.7 : 0.5);
        
        return true;
    },
    
    handleGuntherRescue(dt, state, local) {
        const { gunther, car, enemies } = state;
        const { inCar, isDriver, player } = local;
        
        if (!gunther) return false;
        
        // Only rescue if Gunther is wandering (not captured - we shoot for that)
        if (gunther.state !== 'wandering') return false;
        
        // CRITICAL: Check if area is COMPLETELY safe before considering exit
        if (enemies && car) {
            for (const e of enemies) {
                const dist = Math.hypot(e.x - car.x, e.z - car.z);
                if (dist < this.SAFE_EXIT_RANGE) {
                    // NOT SAFE - stay in car, drive toward Gunther while shooting
                    if (inCar && isDriver) {
                        // Drive toward Gunther's position
                        const angleToGunther = Math.atan2(gunther.x - car.x, gunther.z - car.z);
                        const angleDiff = this.normalizeAngle(angleToGunther - local.carRotation);
                        
                        if (Math.abs(angleDiff) > 0.3) {
                            GameInput.moveSide = -Math.sign(angleDiff) * 0.8;
                        }
                        GameInput.moveForward = 0.6;  // Slower, focused on positioning
                    }
                    return true;  // Handled - don't progress, focus on rescue positioning
                }
            }
        }
        
        // Area is SAFE - all enemies far away
        if (inCar && car) {
            const distToCar = Math.hypot(gunther.x - car.x, gunther.z - car.z);
            
            // Exit only if Gunther is close enough for quick grab
            if (distToCar < 10) {
                GameInput.triggerAction('enterExit');
                return true;
            }
            
            // Drive closer to him first
            const angleToGunther = Math.atan2(gunther.x - car.x, gunther.z - car.z);
            const angleDiff = this.normalizeAngle(angleToGunther - local.carRotation);
            
            if (Math.abs(angleDiff) > 0.2) {
                GameInput.moveSide = -Math.sign(angleDiff) * 0.7;
            }
            GameInput.moveForward = 0.8;
            return true;
        }
        
        // On foot - SPRINT to Gunther and grab
        if (!inCar && player) {
            const dist = Math.hypot(gunther.x - player.position.x, gunther.z - player.position.z);
            
            if (dist < 4) {
                GameInput.triggerAction('holdHand');
            }
            
            // Sprint toward Gunther
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
