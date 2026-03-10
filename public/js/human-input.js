// HumanInput - translates keyboard/mouse to GameInput
// Works alongside existing keys[] system

const HumanInput = {
    keys: {},  // Our own key tracking
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    pendingShot: false,
    pendingGrab: false,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
              || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2),
    
    init() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // P key toggles autoplay
            if (e.code === 'KeyP' && typeof AutoplayController !== 'undefined') {
                if (GameInput.isAutoplay) {
                    AutoplayController.disable();
                    const badge = document.getElementById('autoplay-badge');
                    if (badge) badge.style.display = 'none';
                } else {
                    AutoplayController.enable();
                    const badge = document.getElementById('autoplay-badge');
                    if (badge) badge.style.display = 'block';
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement) {
                this.mouseDeltaX += e.movementX;
                this.mouseDeltaY += e.movementY;
            }
        });
        
        document.addEventListener('click', () => {
            if (document.pointerLockElement) {
                this.pendingShot = true;
            }
        });
        
        // Right-click for grab/toss Gunther
        document.addEventListener('contextmenu', (e) => {
            if (document.pointerLockElement) {
                e.preventDefault();
                this.pendingGrab = true;
            }
        });
        
        document.addEventListener('mousedown', (e) => {
            if (document.pointerLockElement && e.button === 2) {
                this.pendingGrab = true;
            }
        });
    },
    
    // Call each frame to write to GameInput
    update() {
        if (GameInput.isAutoplay) return;
        
        // Movement - skip on mobile (joystick handles it directly)
        if (!this.isMobile) {
            GameInput.moveForward = 0;
            GameInput.moveSide = 0;
            
            if (this.keys['KeyW']) GameInput.moveForward += 1;
            if (this.keys['KeyS']) GameInput.moveForward -= 1;
            if (this.keys['KeyA']) GameInput.moveSide -= 1;
            if (this.keys['KeyD']) GameInput.moveSide += 1;
        }
        
        // Aiming
        GameInput.aimX += this.mouseDeltaX * 0.002;
        GameInput.aimY += this.mouseDeltaY * 0.002;
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        
        // Actions
        if (this.pendingShot) {
            GameInput.triggerAction('shoot');
            this.pendingShot = false;
        }
        
        if (this.keys['KeyE']) {
            GameInput.triggerAction('enterExit');
        }
        
        // Space for jump
        if (this.keys['Space']) {
            GameInput.triggerAction('jump');
        }
        
        // Right-click for grab/toss
        if (this.pendingGrab) {
            GameInput.triggerAction('holdHand');
            this.pendingGrab = false;
        }
    }
};

window.HumanInput = HumanInput;
