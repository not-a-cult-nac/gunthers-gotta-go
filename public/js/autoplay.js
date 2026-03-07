// AutoplayController - AI that plays the game
// CRITICAL: Can only shoot ON FOOT, not in car!

const AutoplayController = {
    enabled: false,
    lastState: null,
    lastShootTime: 0,
    debugLog: true,
    lastDebugTime: 0,
    lastReturnDebug: 0,
    lastMoveDebug: 0,
    
    // Shooting stats
    stats: { shots: 0, hits: 0, kills: 0 },
    
    // Run tracking
    run: {
        startTime: null,
        guntherEscapes: 0,
        guntherCaptures: 0,
        guntherRescues: 0,
        carExits: 0,
        events: []
    },
    
    // Tuning
    SHOOT_RANGE: 40,           // Max shooting distance
    SHOOT_COOLDOWN: 80,        // ms between shots
    AIM_TOLERANCE: 0.2,        // Radians - acceptable aim error
    THREAT_RANGE: 25,          // Exit car when enemy this close
    SAFE_RANGE: 35,            // Get back in car when all enemies this far
    GUNTHER_RESCUE_RANGE: 15,  // Distance to rescue wandering Gunther
    
    init() {
        console.log('[Autoplay] Controller initialized');
    },
    
    registerSocketListeners(socket) {
        socket.on('shootResult', (result) => {
            this.stats.shots++;
            if (result.hit) this.stats.hits++;
            if (result.killed) this.stats.kills++;
            if (this.debugLog && result.hit) {
                console.log(`[AI] HIT! ${result.killed ? 'KILLED!' : ''} (${this.stats.hits}/${this.stats.shots})`);
            }
        });
    },
    
    toggle() {
        this.enabled = !this.enabled;
        console.log(`[Autoplay] ${this.enabled ? 'Enabled' : 'Disabled'}`);
        if (this.enabled) this.resetRun();
        return this.enabled;
    },
    
    enable() {
        if (!this.enabled) {
            this.enabled = true;
            console.log('[Autoplay] Enabled');
            this.resetRun();
        }
    },
    
    resetRun() {
        this.run = {
            startTime: performance.now(),
            guntherEscapes: 0,
            guntherCaptures: 0,
            guntherRescues: 0,
            carExits: 0,
            events: []
        };
        this.stats = { shots: 0, hits: 0, kills: 0 };
        this.lastGuntherState = null;
    },
    
    updateState(state) {
        this.lastState = state;
        
        // Track Gunther state changes
        if (state.gunther && state.gunther.state !== this.lastGuntherState) {
            const prev = this.lastGuntherState;
            const curr = state.gunther.state;
            this.lastGuntherState = curr;
            
            if (prev) {
                const elapsed = ((performance.now() - this.run.startTime) / 1000).toFixed(1);
                
                // Count events
                if (curr === 'wandering' && prev === 'in_car') this.run.guntherEscapes++;
                if (curr === 'captured') this.run.guntherCaptures++;
                if (curr === 'in_car' && (prev === 'holding_hands' || prev === 'wandering')) this.run.guntherRescues++;
                
                // Log
                const car = state.car;
                const g = state.gunther;
                const enemies = state.enemies || [];
                const distToCar = car ? Math.hypot(g.x - car.x, g.z - car.z).toFixed(1) : '?';
                const nearestEnemy = enemies.length ? Math.min(...enemies.map(e => Math.hypot(e.x - g.x, e.z - g.z))).toFixed(1) : 'none';
                
                console.log(`[AI] @${elapsed}s Gunther: ${prev} -> ${curr} (dist=${distToCar}, enemy=${nearestEnemy})`);
                
                this.run.events.push({
                    t: elapsed,
                    from: prev,
                    to: curr,
                    guntherDist: distToCar,
                    nearestEnemy: nearestEnemy
                });
            }
        }
    },
    
    endRun(result) {
        const duration = ((performance.now() - this.run.startTime) / 1000).toFixed(1);
        const report = {
            result: result,
            duration: `${duration}s`,
            gunther: {
                escapes: this.run.guntherEscapes,
                captures: this.run.guntherCaptures,
                rescues: this.run.guntherRescues
            },
            combat: {
                shots: this.stats.shots,
                hits: this.stats.hits,
                kills: this.stats.kills,
                accuracy: this.stats.shots > 0 ? `${(this.stats.hits/this.stats.shots*100).toFixed(0)}%` : 'N/A'
            },
            carExits: this.run.carExits,
            events: this.run.events
        };
        
        console.log('═══════════════════════════════════════');
        console.log(`[AI] RUN REPORT: ${result === 'won' ? '✅ WIN' : '❌ LOSS'}`);
        console.log(JSON.stringify(report, null, 2));
        console.log('═══════════════════════════════════════');
        
        this.resetRun();
    },
    
    update(dt, localState) {
        if (!this.enabled || !this.lastState) return;
        
        const state = this.lastState;
        const { car, gunther, enemies } = state;
        const { inCar, isDriver, player, carRotation, playerRotation } = localState;
        
        // Reset inputs
        GameInput.moveForward = 0;
        GameInput.moveSide = 0;
        GameInput.aimX = 0;
        GameInput.sprint = false;
        
        // Debug logging
        if (this.debugLog && performance.now() - this.lastDebugTime > 2000) {
            console.log(`[AI] State: inCar=${inCar}, gunther=${gunther?.state}`);
            this.lastDebugTime = performance.now();
        }
        
        // Simple state machine based on Gunther's state:
        
        // STATE 1: Gunther is in car with us → DRIVE TO GOAL
        if (gunther?.state === 'in_car' && inCar) {
            this.driveTowardGoal(carRotation);
            return;
        }
        
        // STATE 2: Gunther left the car (wandering/trapped) → GET OUT AND GRAB HIM
        if (gunther?.state === 'wandering' || gunther?.state === 'trapped') {
            if (inCar) {
                console.log('[AI] Gunther escaped! Exiting car to grab him');
                GameInput.triggerAction('enterExit');
                return;
            }
            // On foot - sprint to Gunther and grab
            const distToGunther = Math.hypot(gunther.x - player.position.x, gunther.z - player.position.z);
            if (distToGunther < 4) {
                GameInput.triggerAction('holdHand');
                console.log('[AI] Grabbing Gunther!');
            } else {
                GameInput.sprint = true;
                this.moveToward(gunther, player.position, playerRotation);
            }
            return;
        }
        
        // STATE 3: Enemy has Gunther (captured) → KILL THAT ENEMY
        if (gunther?.state === 'captured') {
            if (inCar) {
                console.log('[AI] Gunther captured! Exiting car to fight');
                GameInput.triggerAction('enterExit');
                return;
            }
            // Find and kill the enemy holding Gunther
            this.shootEnemyWithGunther(enemies, gunther, player, playerRotation);
            return;
        }
        
        // STATE 4: Holding Gunther's hand → GET BACK TO CAR
        if (gunther?.state === 'holding_hands') {
            if (inCar) {
                // We're in car with Gunther, drive!
                this.driveTowardGoal(carRotation);
            } else {
                this.returnToCar(car, player, playerRotation);
            }
            return;
        }
        
        // Default: if in car, drive; if on foot, get back to car
        if (inCar) {
            this.driveTowardGoal(carRotation);
        } else if (car && player) {
            this.returnToCar(car, player, playerRotation);
        }
    },
    
    getNearestEnemyDist(enemies, ref) {
        if (!enemies || !enemies.length || !ref) return null;
        const pos = ref.position || ref;  // Handle both THREE.Object3D and {x,z}
        const x = pos.x !== undefined ? pos.x : ref.x;
        const z = pos.z !== undefined ? pos.z : ref.z;
        return Math.min(...enemies.map(e => Math.hypot(e.x - x, e.z - z)));
    },
    
    shootEnemies(enemies, player, playerRotation, gunther) {
        if (!enemies || !enemies.length || !player) return false;
        
        const now = performance.now();
        if (now - this.lastShootTime < this.SHOOT_COOLDOWN) return false;
        
        // Find best target - prioritize enemies near Gunther!
        let bestEnemy = null;
        let bestScore = -Infinity;
        
        for (const e of enemies) {
            const dx = e.x - player.position.x;
            const dz = e.z - player.position.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist > this.SHOOT_RANGE) continue;
            
            const angleToEnemy = Math.atan2(dx, dz);
            const angleDiff = Math.abs(this.normalizeAngle(angleToEnemy - playerRotation));
            
            // Score: prefer enemies near Gunther, then close to player, then already aimed at
            let score = -dist - angleDiff * 10;
            
            // HUGE bonus for enemies near Gunther (the one who matters!)
            if (gunther && (gunther.state === 'wandering' || gunther.state === 'trapped')) {
                const distToGunther = Math.hypot(e.x - gunther.x, e.z - gunther.z);
                if (distToGunther < 15) score += 500;  // Massive priority
                else if (distToGunther < 25) score += 200;
            }
            
            // Bonus if this enemy has Gunther captured
            if (e.hasGunther) score += 1000;
            
            if (score > bestScore) {
                bestScore = score;
                bestEnemy = { enemy: e, dist, angleToEnemy, angleDiff };
            }
        }
        
        if (!bestEnemy) return false;
        
        const { enemy, dist, angleToEnemy, angleDiff } = bestEnemy;
        
        // Aim toward enemy - SMOOTH aiming, not flip-flopping!
        const aimDir = this.normalizeAngle(angleToEnemy - playerRotation);
        
        // Special case: if near ±π boundary (enemy behind us), always turn one direction
        // to avoid oscillation at the boundary
        let aimInput;
        if (Math.abs(angleDiff) > 2.8) {
            // Enemy is mostly behind us - commit to turning one direction
            aimInput = 0.08 * (aimDir >= 0 ? 1 : -1);
        } else {
            // Normal proportional control
            aimInput = Math.max(-0.08, Math.min(0.08, aimDir * 0.3));
        }
        GameInput.aimX = aimInput;
        
        // Shoot if aimed well enough
        if (angleDiff < this.AIM_TOLERANCE) {
            GameInput.triggerAction('shoot');
            this.lastShootTime = now;
            console.log(`[AI] SHOOTING enemy at dist=${dist.toFixed(0)}, angle=${angleDiff.toFixed(2)}`);
            return true;
        } else {
            if (this.debugLog && now - this.lastDebugTime > 500) {
                console.log(`[AI] Aiming at enemy dist=${dist.toFixed(0)}, angleDiff=${angleDiff.toFixed(2)}`);
            }
        }
        
        return false;
    },
    
    // Specifically target the enemy that has captured Gunther
    shootEnemyWithGunther(enemies, gunther, player, playerRotation) {
        if (!enemies || !enemies.length || !player || !gunther) return;
        
        // Find the enemy holding Gunther (either by hasGunther flag or closest to Gunther's position)
        let targetEnemy = enemies.find(e => e.hasGunther);
        if (!targetEnemy) {
            // Find closest enemy to Gunther's last known position
            let minDist = Infinity;
            for (const e of enemies) {
                const dist = Math.hypot(e.x - gunther.x, e.z - gunther.z);
                if (dist < minDist) {
                    minDist = dist;
                    targetEnemy = e;
                }
            }
        }
        
        if (!targetEnemy) return;
        
        const dx = targetEnemy.x - player.position.x;
        const dz = targetEnemy.z - player.position.z;
        const dist = Math.hypot(dx, dz);
        const angleToEnemy = Math.atan2(dx, dz);
        const angleDiff = Math.abs(this.normalizeAngle(angleToEnemy - playerRotation));
        
        // Always sprint toward the captor!
        GameInput.sprint = true;
        this.moveToward(targetEnemy, player.position, playerRotation);
        
        // Also aim at enemy while moving
        const aimDir = this.normalizeAngle(angleToEnemy - playerRotation);
        GameInput.aimX = Math.max(-0.1, Math.min(0.1, aimDir * 0.4));
        
        // Shoot if in range and aimed
        const now = performance.now();
        if (dist < this.SHOOT_RANGE && angleDiff < this.AIM_TOLERANCE && now - this.lastShootTime > this.SHOOT_COOLDOWN) {
            GameInput.triggerAction('shoot');
            this.lastShootTime = now;
            console.log(`[AI] SHOOTING captor at dist=${dist.toFixed(0)}`);
        } else if (this.debugLog && now - this.lastDebugTime > 500) {
            console.log(`[AI] Chasing captor dist=${dist.toFixed(0)}, angleDiff=${angleDiff.toFixed(2)}`);
            this.lastDebugTime = now;
        }
    },
    
    driveTowardGoal(carRotation) {
        // Simple: drive forward (positive Z direction)
        const targetAngle = 0;
        const angleDiff = this.normalizeAngle(targetAngle - carRotation);
        
        // Steer toward goal
        if (Math.abs(angleDiff) > 0.1) {
            GameInput.moveSide = -Math.sign(angleDiff) * 0.6;
        }
        
        // Full speed
        GameInput.moveForward = 1;
    },
    
    returnToCar(car, player, rotation) {
        if (!car || !player) return;
        
        const dx = car.x - player.position.x;
        const dz = car.z - player.position.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist < 8) {
            GameInput.triggerAction('enterExit');
            console.log('[AI] Getting back in car!');
        } else {
            GameInput.sprint = true;
            this.moveToward({ x: car.x, z: car.z }, player.position, rotation);
        }
    },
    
    moveToward(target, from, rotation) {
        const dx = target.x - from.x;
        const dz = target.z - from.z;
        const dist = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        const relAngle = this.normalizeAngle(angle - rotation);
        
        // Debug: log movement
        const now = performance.now();
        if (this.debugLog && now - this.lastMoveDebug > 2000) {
            console.log(`[AI] moveToward: dist=${dist.toFixed(1)}, relAngle=${relAngle.toFixed(2)}`);
            this.lastMoveDebug = now;
        }
        
        // If target is mostly in front, run forward
        // If target is to the side or behind, strafe/turn aggressively
        const cosAngle = Math.cos(relAngle);
        const sinAngle = Math.sin(relAngle);
        
        // Always move forward if target is remotely in front
        GameInput.moveForward = cosAngle > -0.3 ? 1 : 0;
        
        // Strafe toward target
        if (Math.abs(sinAngle) > 0.1) {
            GameInput.moveSide = sinAngle > 0 ? 1 : -1;  // Full strafe, not half
        }
        
        // Also turn toward target (helps camera/aim follow)
        GameInput.aimX = Math.max(-0.1, Math.min(0.1, sinAngle * 0.5));
    },
    
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }
};

// Auto-init
AutoplayController.init();
