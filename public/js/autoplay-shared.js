// Browser autoplay using SHARED AI core
// This wraps the shared AIController to work with the browser's GameInput system

// Load shared modules (must be loaded before this script)
// <script src="/js/shared/ai-core.js"></script>

class BrowserAutoplay {
    constructor() {
        // Use the shared AI controller
        this.ai = new window.AICore.AIController();
        this.enabled = false;
        this.debugLog = true;
        this.lastLogTime = 0;
        
        // Server state (updated by updateState)
        this.serverState = null;
        this.gameTime = 0;
    }
    
    enable() {
        this.enabled = true;
        GameInput.isAutoplay = true;
        console.log('[AUTOPLAY] Enabled (using shared AI core)');
    }
    
    disable() {
        this.enabled = false;
        GameInput.isAutoplay = false;
        GameInput.reset();
        console.log('[AUTOPLAY] Disabled');
    }
    
    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }
    
    // Called when server sends gameState
    updateState(serverState) {
        this.serverState = serverState;
    }
    
    // For socket listeners (shoot feedback etc)
    registerSocketListeners(socket) {
        // Can add shoot feedback handling here if needed
    }
    
    // Called every frame from the game loop
    // Matches old AutoplayController.update(delta, info) interface
    update(delta, info) {
        if (!this.enabled || !this.serverState) return;
        
        this.gameTime += delta;
        
        const { carRotation, playerRotation, inCar, isDriver, player } = info;
        const ss = this.serverState;  // Server state
        
        // Build state in the format the shared AI expects
        const state = {
            player: {
                x: player.position.x,
                z: player.position.z,
                inCar: inCar,
                rotation: playerRotation
            },
            car: {
                x: ss.car.x,
                z: ss.car.z,
                rotation: carRotation
            },
            gunther: ss.gunther ? {
                x: ss.gunther.x,
                z: ss.gunther.z,
                state: ss.gunther.state,
                captorId: ss.gunther.captorId,
                holderId: ss.gunther.holderId
            } : { state: 'in_car', x: ss.car.x, z: ss.car.z },
            enemies: (ss.enemies || []).map(e => ({
                id: e.id,
                x: e.x,
                z: e.z,
                hasGunther: e.hasGunther
            })),
            gameState: ss.gameState,
            time: this.gameTime,
            goalZ: 440
        };
        
        // Get decision from shared AI
        const inputs = this.ai.decide(state);
        
        // Debug logging (throttled to 1/second)
        const now = performance.now();
        if (this.debugLog && now - this.lastLogTime > 1000) {
            console.log(`[AI] inCar=${inCar}, gunther=${state.gunther.state}, inputs=${JSON.stringify(inputs)}`);
            this.lastLogTime = now;
        }
        
        // Apply inputs to GameInput
        this.applyInputs(inputs, state);
    }
    
    applyInputs(inputs, state) {
        // Reset inputs first
        GameInput.moveForward = 0;
        GameInput.moveSide = 0;
        GameInput.steer = 0;
        GameInput.accelerate = 0;
        
        // Driving - use moveForward and moveSide (game uses these, not accelerate/steer)
        if (inputs.drive !== undefined) {
            GameInput.moveForward = inputs.drive;  // 1 = forward, -1 = reverse
            GameInput.moveSide = inputs.steer || 0;  // -1 = left, 1 = right
        }
        
        // Walking - convert world-space moveX/moveZ to player-relative
        if (inputs.moveX !== undefined || inputs.moveZ !== undefined) {
            const mx = inputs.moveX || 0;
            const mz = inputs.moveZ || 0;
            const rotation = state.player.rotation;
            
            // Convert world direction to player-relative
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            
            const localZ = mx * sin + mz * cos;   // Forward component
            const localX = mx * cos - mz * sin;   // Strafe component
            
            GameInput.moveForward = localZ;
            GameInput.moveSide = -localX;  // Negated for game convention
        }
        
        // Actions
        if (inputs.exitCar) {
            GameInput.triggerAction('enterExit');
        }
        
        if (inputs.enterCar) {
            GameInput.triggerAction('enterExit');
        }
        
        if (inputs.holdHand) {
            GameInput.triggerAction('holdHand');
        }
        
        if (inputs.grabGunther) {
            // grabGunther in shared AI = put gunther in car
            // This happens when near car with gunther nearby
            GameInput.triggerAction('holdHand');  // First hold, then get in car
        }
        
        // Shooting - use shared AI's direct direction
        if (inputs.shoot) {
            // Set the custom shoot direction
            GameInput.shootDirection = { x: inputs.shoot.dirX, z: inputs.shoot.dirZ };
            GameInput.triggerAction('shoot');
        }
        
        // Facing direction - set target rotation for 3D render
        if (inputs.facingAngle !== undefined) {
            GameInput.targetRotation = inputs.facingAngle;
        }
    }
}

// Global instance (both names for compatibility)
window.Autoplay = new BrowserAutoplay();
window.AutoplayController = window.Autoplay;
