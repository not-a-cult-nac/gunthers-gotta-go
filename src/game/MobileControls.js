/**
 * Mobile touch controls - virtual joystick + buttons
 */

export class MobileControls {
    constructor(inputManager) {
        this.input = inputManager;
        this.enabled = false;
        
        // Joystick state
        this.joystick = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            touchId: null
        };
        
        // Camera touch state
        this.camera = {
            active: false,
            lastX: 0,
            lastY: 0,
            touchId: null
        };
        
        this.buttons = {};
        this.container = null;
        
        this.checkMobile();
    }
    
    checkMobile() {
        // Enable on touch devices or small screens
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth <= 1024;
        
        if (isTouchDevice || isSmallScreen) {
            this.enable();
        }
        
        // Also enable if URL has ?mobile
        if (window.location.search.includes('mobile')) {
            this.enable();
        }
    }
    
    enable() {
        if (this.enabled) return;
        this.enabled = true;
        
        this.createUI();
        this.setupTouchListeners();
        
        // Hide desktop instructions
        const instructions = document.getElementById('instructions');
        if (instructions) {
            instructions.textContent = 'Joystick: Move | Right side: Aim | Buttons: Actions';
        }
    }
    
    createUI() {
        // Container for all mobile controls
        this.container = document.createElement('div');
        this.container.id = 'mobile-controls';
        this.container.innerHTML = `
            <style>
                #mobile-controls {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 1000;
                    user-select: none;
                    -webkit-user-select: none;
                }
                
                #joystick-zone {
                    position: absolute;
                    left: 0;
                    bottom: 0;
                    width: 40%;
                    height: 50%;
                    pointer-events: auto;
                }
                
                #joystick-base {
                    position: absolute;
                    width: 120px;
                    height: 120px;
                    background: rgba(255,255,255,0.2);
                    border: 3px solid rgba(255,255,255,0.4);
                    border-radius: 50%;
                    display: none;
                }
                
                #joystick-stick {
                    position: absolute;
                    width: 50px;
                    height: 50px;
                    background: rgba(255,255,255,0.6);
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    display: none;
                }
                
                #camera-zone {
                    position: absolute;
                    right: 0;
                    top: 0;
                    width: 60%;
                    height: 70%;
                    pointer-events: auto;
                }
                
                .mobile-btn {
                    position: absolute;
                    width: 70px;
                    height: 70px;
                    background: rgba(255,255,255,0.25);
                    border: 3px solid rgba(255,255,255,0.5);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    font-weight: bold;
                    color: white;
                    text-shadow: 1px 1px 2px black;
                    pointer-events: auto;
                    transition: background 0.1s;
                }
                
                .mobile-btn:active, .mobile-btn.pressed {
                    background: rgba(255,255,255,0.5);
                }
                
                #btn-shoot {
                    right: 20px;
                    bottom: 120px;
                    width: 90px;
                    height: 90px;
                    background: rgba(255,50,50,0.4);
                    border-color: rgba(255,100,100,0.7);
                    font-size: 16px;
                }
                
                #btn-enter {
                    right: 120px;
                    bottom: 60px;
                    background: rgba(50,150,255,0.4);
                    border-color: rgba(100,180,255,0.7);
                }
                
                #btn-grab {
                    right: 120px;
                    bottom: 150px;
                    background: rgba(255,200,50,0.4);
                    border-color: rgba(255,220,100,0.7);
                }
                
                #btn-boost {
                    right: 20px;
                    bottom: 20px;
                    background: rgba(50,255,100,0.4);
                    border-color: rgba(100,255,150,0.7);
                    font-size: 14px;
                }
                
                #btn-camera {
                    right: 200px;
                    bottom: 100px;
                    width: 50px;
                    height: 50px;
                    font-size: 18px;
                    background: rgba(150,150,150,0.3);
                }
            </style>
            
            <div id="joystick-zone">
                <div id="joystick-base"></div>
                <div id="joystick-stick"></div>
            </div>
            
            <div id="camera-zone"></div>
            
            <div id="btn-shoot" class="mobile-btn">🔫</div>
            <div id="btn-enter" class="mobile-btn">E</div>
            <div id="btn-grab" class="mobile-btn">✋</div>
            <div id="btn-boost" class="mobile-btn">BOOST</div>
            <div id="btn-camera" class="mobile-btn">📷</div>
        `;
        
        document.body.appendChild(this.container);
        
        // Cache button references
        this.buttons = {
            shoot: document.getElementById('btn-shoot'),
            enter: document.getElementById('btn-enter'),
            grab: document.getElementById('btn-grab'),
            boost: document.getElementById('btn-boost'),
            camera: document.getElementById('btn-camera')
        };
        
        this.joystickZone = document.getElementById('joystick-zone');
        this.joystickBase = document.getElementById('joystick-base');
        this.joystickStick = document.getElementById('joystick-stick');
        this.cameraZone = document.getElementById('camera-zone');
    }
    
    setupTouchListeners() {
        // Joystick
        this.joystickZone.addEventListener('touchstart', (e) => this.onJoystickStart(e), { passive: false });
        this.joystickZone.addEventListener('touchmove', (e) => this.onJoystickMove(e), { passive: false });
        this.joystickZone.addEventListener('touchend', (e) => this.onJoystickEnd(e), { passive: false });
        
        // Camera
        this.cameraZone.addEventListener('touchstart', (e) => this.onCameraStart(e), { passive: false });
        this.cameraZone.addEventListener('touchmove', (e) => this.onCameraMove(e), { passive: false });
        this.cameraZone.addEventListener('touchend', (e) => this.onCameraEnd(e), { passive: false });
        
        // Buttons
        this.setupButton('shoot', 'shoot');
        this.setupButton('enter', 'interact');
        this.setupButton('grab', 'grab');
        this.setupButton('boost', 'boost');
        
        // Camera toggle is special - single tap
        this.buttons.camera.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.buttons.camera.classList.add('pressed');
            this.input.keys.toggleCamera = true;
        });
        this.buttons.camera.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.buttons.camera.classList.remove('pressed');
            this.input.keys.toggleCamera = false;
        });
    }
    
    setupButton(btnName, inputKey) {
        const btn = this.buttons[btnName];
        
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            btn.classList.add('pressed');
            this.input.keys[inputKey] = true;
        });
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            btn.classList.remove('pressed');
            this.input.keys[inputKey] = false;
        });
        
        btn.addEventListener('touchcancel', (e) => {
            btn.classList.remove('pressed');
            this.input.keys[inputKey] = false;
        });
    }
    
    onJoystickStart(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        
        this.joystick.active = true;
        this.joystick.touchId = touch.identifier;
        this.joystick.startX = touch.clientX;
        this.joystick.startY = touch.clientY;
        this.joystick.currentX = touch.clientX;
        this.joystick.currentY = touch.clientY;
        
        // Show joystick at touch position
        this.joystickBase.style.display = 'block';
        this.joystickStick.style.display = 'block';
        this.joystickBase.style.left = (touch.clientX - 60) + 'px';
        this.joystickBase.style.top = (touch.clientY - 60) + 'px';
        this.joystickStick.style.left = touch.clientX + 'px';
        this.joystickStick.style.top = touch.clientY + 'px';
    }
    
    onJoystickMove(e) {
        e.preventDefault();
        if (!this.joystick.active) return;
        
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.joystick.touchId) {
                this.joystick.currentX = touch.clientX;
                this.joystick.currentY = touch.clientY;
                
                // Calculate joystick offset (clamped to radius)
                const maxRadius = 50;
                let dx = touch.clientX - this.joystick.startX;
                let dy = touch.clientY - this.joystick.startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist > maxRadius) {
                    dx = (dx / dist) * maxRadius;
                    dy = (dy / dist) * maxRadius;
                }
                
                // Update stick position
                this.joystickStick.style.left = (this.joystick.startX + dx) + 'px';
                this.joystickStick.style.top = (this.joystick.startY + dy) + 'px';
                
                // Update input (normalize to -1 to 1)
                const normX = dx / maxRadius;
                const normY = dy / maxRadius;
                
                this.input.keys.forward = normY < -0.3;
                this.input.keys.backward = normY > 0.3;
                this.input.keys.left = normX < -0.3;
                this.input.keys.right = normX > 0.3;
            }
        }
    }
    
    onJoystickEnd(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.joystick.touchId) {
                this.joystick.active = false;
                this.joystick.touchId = null;
                
                // Hide joystick
                this.joystickBase.style.display = 'none';
                this.joystickStick.style.display = 'none';
                
                // Reset input
                this.input.keys.forward = false;
                this.input.keys.backward = false;
                this.input.keys.left = false;
                this.input.keys.right = false;
            }
        }
    }
    
    onCameraStart(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        
        this.camera.active = true;
        this.camera.touchId = touch.identifier;
        this.camera.lastX = touch.clientX;
        this.camera.lastY = touch.clientY;
    }
    
    onCameraMove(e) {
        e.preventDefault();
        if (!this.camera.active) return;
        
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.camera.touchId) {
                const dx = touch.clientX - this.camera.lastX;
                const dy = touch.clientY - this.camera.lastY;
                
                // Feed into input manager as mouse movement
                this.input.mouse.deltaX += dx * 0.5;
                this.input.mouse.deltaY += dy * 0.5;
                
                this.camera.lastX = touch.clientX;
                this.camera.lastY = touch.clientY;
            }
        }
    }
    
    onCameraEnd(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.camera.touchId) {
                this.camera.active = false;
                this.camera.touchId = null;
            }
        }
    }
}
