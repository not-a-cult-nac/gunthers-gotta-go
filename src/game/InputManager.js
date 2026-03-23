/**
 * Handles keyboard and mouse input
 */

export class InputManager {
    constructor() {
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            shoot: false,
            interact: false, // E key - enter/exit vehicle
            grab: false,     // Space - grab Gunther
            boost: false,    // Shift
        };
        
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
        };
        
        this.setupListeners();
    }
    
    setupListeners() {
        // Keyboard
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Mouse
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }
    
    onKeyDown(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'KeyE':
                this.keys.interact = true;
                break;
            case 'Space':
                this.keys.grab = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.boost = true;
                break;
        }
    }
    
    onKeyUp(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'KeyE':
                this.keys.interact = false;
                break;
            case 'Space':
                this.keys.grab = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.boost = false;
                break;
        }
    }
    
    onMouseMove(e) {
        if (document.pointerLockElement) {
            this.mouse.deltaX = e.movementX;
            this.mouse.deltaY = e.movementY;
        }
    }
    
    onMouseDown(e) {
        if (e.button === 0) {
            this.keys.shoot = true;
        }
    }
    
    onMouseUp(e) {
        if (e.button === 0) {
            this.keys.shoot = false;
        }
    }
    
    getState() {
        const state = {
            ...this.keys,
            mouseX: this.mouse.deltaX,
            mouseY: this.mouse.deltaY,
        };
        
        // Reset mouse delta after reading
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        
        return state;
    }
}
