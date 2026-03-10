// GameInput - abstraction layer for all player input
// Both human controls and AI write to this interface

const GameInput = {
    // Movement (normalized -1 to 1)
    moveForward: 0,
    moveSide: 0,
    
    // Aiming (delta per frame, will be consumed)
    aimX: 0,
    aimY: 0,
    
    // Actions (consumed on read via consumeAction)
    _shoot: false,
    _enterExit: false,
    _holdHand: false,
    _releaseHand: false,
    _jump: false,
    _boost: false,
    
    // AI can set custom shoot direction (dirX, dirZ)
    shootDirection: null,
    
    // State
    isAutoplay: false,
    
    // Consume an action (returns true once, then false until set again)
    consumeAction(name) {
        const key = '_' + name;
        if (this[key]) {
            this[key] = false;
            return true;
        }
        return false;
    },
    
    // Set an action to fire
    triggerAction(name) {
        this['_' + name] = true;
    },
    
    // Reset deltas (call at end of frame)
    resetDeltas() {
        this.aimX = 0;
        this.aimY = 0;
    },
    
    // Clear everything (for game restart)
    clear() {
        this.moveForward = 0;
        this.moveSide = 0;
        this.aimX = 0;
        this.aimY = 0;
        this._shoot = false;
        this._enterExit = false;
        this._holdHand = false;
        this._releaseHand = false;
        this._jump = false;
        this._boost = false;
    }
};

window.GameInput = GameInput;
