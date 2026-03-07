// AutoplayController - AI that plays the game
// Writes to GameInput, reads game state from socket updates

const AutoplayController = {
    enabled: false,
    lastState: null,
    lastShootTime: 0,
    debugLog: true,  // Enable debug logging
    lastDebugTime: 0,
    
    // Shooting stats (updated via shootResult event)
    stats: {
        shots: 0,
        hits: 0,
        kills: 0
    },
    
    // Run tracking
    run: {
        startTime: null,
        guntherEscapes: 0,
        guntherCaptures: 0,
        guntherRescues: 0,
        carExits: 0,
        events: []  // Timeline of key events
    },
    
    // Tuning - MAXIMUM AGGRESSION
    SHOOT_RANGE: 50,           // Shoot enemies from further away
    SHOOT_COOLDOWN: 50,        // ms between shots (VERY fast!)
    AIM_SPEED: 15,             // Maximum aiming speed
    PRIORITY_RANGE: 40,        // Prioritize enemies this close
    SAFE_EXIT_RANGE: 60,       // Only exit car if ALL enemies are this far
    AIM_TOLERANCE: 0.6,        // Wide aim tolerance - spray bullets!
    
    init() {
        console.log('[Autoplay] Controller initialized');
    },
    
    // Call this to register shoot result listener
    registerSocketListeners(socket) {
        socket.on('shootResult', (result) => {
            this.stats.shots++;
            if (result.hit) this.stats.hits++;
            if (result.killed) this.stats.kills++;
            if (this.debugLog && result.hit) {
                console.log(`[AI] HIT! Enemy ${result.enemyId}${result.killed ? ' KILLED!' : ''} (${this.stats.hits}/${this.stats.shots} = ${(this.stats.hits/this.stats.shots*100).toFixed(0)}%)`);
            }
        });
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
        // Start run tracking
        if (!this.run.startTime && state.gameState === 'playing') {
            this.run.startTime = Date.now();
            this.run.events = [];
            this.run.guntherEscapes = 0;
            this.run.guntherCaptures = 0;
            this.run.guntherRescues = 0;
            this.run.carExits = 0;
            this.stats = { shots: 0, hits: 0, kills: 0 };
        }
        
        const elapsed = this.run.startTime ? ((Date.now() - this.run.startTime) / 1000).toFixed(1) : 0;
        
        // Log Gunther state changes with spatial context
        if (this.lastState && state.gunther && this.lastState.gunther) {
            if (this.lastState.gunther.state !== state.gunther.state) {
                const car = state.car;
                const g = state.gunther;
                const from = this.lastState.gunther.state;
                const to = state.gunther.state;
                
                // Track events
                if (to === 'wandering' && from === 'in_car') this.run.guntherEscapes++;
                if (to === 'captured') this.run.guntherCaptures++;
                if (to === 'in_car' && from !== 'in_car') this.run.guntherRescues++;
                
                const event = {
                    t: elapsed,
                    from, to,
                    guntherDist: car.distToGunther?.toFixed(1),
                    turnToGunther: (car.turnToGunther * 180 / Math.PI)?.toFixed(0),
                    nearestEnemy: state.nearestEnemyDist?.toFixed(1),
                    goalDist: car.distToGoal?.toFixed(0)
                };
                this.run.events.push(event);
                
                console.log(`[AI] @${elapsed}s Gunther: ${from} -> ${to}`, {
                    dist: event.guntherDist,
                    turn: event.turnToGunther + '°',
                    enemy: event.nearestEnemy,
                    goal: event.goalDist + 'm'
                });
            }
        }
        
        // End-of-run report
        if (this.lastState?.gameState === 'playing' && state.gameState !== 'playing') {
            this.generateReport(state);
        }
        
        this.lastState = state;
    },
    
    generateReport(state) {
        const duration = ((Date.now() - this.run.startTime) / 1000).toFixed(1);
        const report = {
            result: state.gameState,
            duration: duration + 's',
            finalGoalDist: state.car.distToGoal?.toFixed(0) + 'm',
            gunther: {
                escapes: this.run.guntherEscapes,
                captures: this.run.guntherCaptures,
                rescues: this.run.guntherRescues
            },
            combat: {
                shots: this.stats.shots,
                hits: this.stats.hits,
                kills: this.stats.kills,
                accuracy: this.stats.shots > 0 ? ((this.stats.hits / this.stats.shots) * 100).toFixed(0) + '%' : 'N/A'
            },
            carExits: this.run.carExits,
            events: this.run.events
        };
        
        console.log('═══════════════════════════════════════');
        console.log('[AI] RUN REPORT:', state.gameState === 'won' ? '🏆 WIN' : '❌ LOSS');
        console.log(JSON.stringify(report, null, 2));
        console.log('═══════════════════════════════════════');
        
        // Reset for next run
        this.run.startTime = null;
    },
    
    update(dt, localState) {
        if (!this.enabled || !this.lastState) return;
        
        const state = this.lastState;
        const { car, gunther, enemies } = state;
        const { carRotation, inCar, isDriver, player } = localState;
        
        // Debug state every 3 seconds
        if (this.debugLog && performance.now() - this.lastDebugTime > 3000) {
            console.log(`[AI] State: gunther=${gunther?.state}, enemies=${enemies?.length || 0}, inCar=${inCar}, isDriver=${isDriver}`);
            this.lastDebugTime = performance.now();
        }
        
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
        
        if (!inCar || !isDriver || !enemies || !car) {
            if (this.debugLog && performance.now() - this.lastDebugTime > 2000) {
                console.log(`[AI] Combat skipped: inCar=${inCar}, isDriver=${isDriver}, enemies=${enemies?.length || 0}, car=${!!car}`);
                this.lastDebugTime = performance.now();
            }
            return false;
        }
        
        // Find best target with aggressive prioritization:
        // 1. Enemy that has Gunther (MUST kill immediately)
        // 2. Enemy close to Gunther who's wandering (prevent capture)
        // 3. Enemy heading toward Gunther (use velocity prediction)
        // 4. Closest enemy in range
        let target = null;
        let targetPriority = Infinity;
        
        // Use server-provided danger flag
        const guntherNeedsRescue = gunther && (gunther.state === 'wandering' || gunther.state === 'trapped');
        const guntherInDanger = state.guntherInDanger;
        
        for (const e of enemies) {
            // Use server-provided distance calculations
            const distToCar = e.distToCar || Math.hypot(e.x - car.x, e.z - car.z);
            const distToGunther = e.distToGunther || Math.hypot(e.x - gunther.x, e.z - gunther.z);
            
            if (distToCar > this.SHOOT_RANGE) continue;
            
            let priority = distToCar;
            
            // Enemy has Gunther = ABSOLUTE priority
            if (e.hasGunther) {
                priority = -10000;
            }
            // Enemy very close to vulnerable Gunther = critical
            else if (guntherNeedsRescue && distToGunther < 8) {
                priority = -5000 + distToGunther;
                if (this.debugLog) console.log(`[AI] CRITICAL: Enemy ${e.id} dist=${distToGunther.toFixed(1)}`);
            }
            // Enemy heading toward Gunther (use velocity prediction)
            else if (guntherNeedsRescue && e.vx !== undefined && distToGunther < 20) {
                // Calculate if enemy is moving toward Gunther
                const toGuntherX = gunther.x - e.x;
                const toGuntherZ = gunther.z - e.z;
                const dot = e.vx * toGuntherX + e.vz * toGuntherZ;
                if (dot > 0) {
                    // Moving toward Gunther - high priority
                    priority = -1000 + distToGunther;
                } else {
                    priority = -100 + distToGunther;
                }
            }
            else if (guntherNeedsRescue && distToGunther < 25) {
                priority = -100 + distToGunther;
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
        const isPriorityTarget = targetPriority < 0;  // Negative priority = high priority target
        
        // Very aggressive turning toward target
        GameInput.moveSide = -Math.sign(angleDiff) * Math.min(Math.abs(angleDiff) * 5, 1.0);
        
        // Shoot with wider tolerance - spray and pray against priority targets
        const now = performance.now();
        const aimTolerance = isPriorityTarget ? this.AIM_TOLERANCE * 1.5 : this.AIM_TOLERANCE;
        if (Math.abs(angleDiff) < aimTolerance && now - this.lastShootTime > this.SHOOT_COOLDOWN) {
            GameInput.triggerAction('shoot');
            this.lastShootTime = now;
            if (this.debugLog) {
                console.log(`[AI] SHOOTING at enemy ${target.id} (dist=${distToTarget.toFixed(1)}, angle=${angleDiff.toFixed(2)}, priority=${targetPriority.toFixed(0)})`);
            }
        } else if (this.debugLog && now - this.lastDebugTime > 1000) {
            console.log(`[AI] Aiming at enemy ${target.id} (dist=${distToTarget.toFixed(1)}, angle=${angleDiff.toFixed(2)}, priority=${targetPriority.toFixed(0)})`);
            this.lastDebugTime = now;
        }
        
        // Movement strategy based on threat level
        if (targetPriority < -4000) {
            // CRITICAL threat (enemy about to grab Gunther) - REVERSE toward them!
            // If target is behind us (large angle), reversing brings us closer
            if (Math.abs(angleDiff) > 1.5) {
                GameInput.moveForward = -0.5;  // Reverse!
                GameInput.moveSide = Math.sign(angleDiff);  // Turn while reversing
            } else {
                GameInput.moveForward = 0;  // Stop and turn
                GameInput.moveSide = -Math.sign(angleDiff);  // Maximum turn rate
            }
        } else if (isPriorityTarget) {
            // High priority - slow down significantly
            GameInput.moveForward = Math.abs(angleDiff) > 1.0 ? -0.3 : 0.2;  // Reverse if target behind
        } else {
            // Normal enemies - move carefully
            // Slow down if there are many enemies to clear them first
            const enemyCount = enemies ? enemies.filter(e => 
                Math.hypot(e.x - car.x, e.z - car.z) < this.SHOOT_RANGE
            ).length : 0;
            
            if (enemyCount >= 3) {
                GameInput.moveForward = 0.3;  // Slow down with many enemies
            } else {
                GameInput.moveForward = Math.abs(angleDiff) < 0.5 ? 0.6 : 0.4;
            }
        }
        
        return true;
    },
    
    handleGuntherRescue(dt, state, local) {
        const { gunther, car, enemies } = state;
        const { inCar, isDriver, player } = local;
        
        if (!gunther) return false;
        
        // Handle rescue for wandering OR trapped Gunther
        // (captured = shoot the enemy holding him, not rescue)
        if (gunther.state !== 'wandering' && gunther.state !== 'trapped') return false;
        
        if (this.debugLog && performance.now() - this.lastDebugTime > 2000) {
            const distToCar = car ? Math.hypot(gunther.x - car.x, gunther.z - car.z) : -1;
            console.log(`[AI] Rescue: Gunther=${gunther.state}, dist=${distToCar.toFixed(1)}, inCar=${inCar}, enemies=${enemies?.length || 0}`);
            this.lastDebugTime = performance.now();
        }
        
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
            const distToGunther = Math.hypot(gunther.x - car.x, gunther.z - car.z);
            
            // Exit only if Gunther is close enough for quick grab
            if (distToGunther < 10) {
                GameInput.triggerAction('enterExit');
                return true;
            }
            
            // Drive toward Gunther
            const angleToGunther = Math.atan2(gunther.x - car.x, gunther.z - car.z);
            const angleDiff = this.normalizeAngle(angleToGunther - local.carRotation);
            
            if (this.debugLog && performance.now() - this.lastDebugTime > 2000) {
                console.log(`[AI] Rescue: driving to Gunther, dist=${distToGunther.toFixed(0)}, angle=${angleDiff.toFixed(2)}`);
                this.lastDebugTime = performance.now();
            }
            
            // If Gunther is behind us (large angle), REVERSE toward him
            if (Math.abs(angleDiff) > 2.0) {
                GameInput.moveForward = -0.8;  // Reverse!
                GameInput.moveSide = Math.sign(angleDiff) * 0.5;  // Turn while reversing
            } else if (Math.abs(angleDiff) > 1.0) {
                // Mostly behind - reverse slowly while turning hard
                GameInput.moveForward = -0.4;
                GameInput.moveSide = -Math.sign(angleDiff);
            } else {
                // Gunther is ahead - drive forward
                GameInput.moveForward = 0.8;
                if (Math.abs(angleDiff) > 0.2) {
                    GameInput.moveSide = -Math.sign(angleDiff) * 0.7;
                }
            }
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
