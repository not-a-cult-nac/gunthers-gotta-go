/**
 * Mobile touch controls - dual stick + buttons
 */

export class MobileControls {
    constructor(inputManager) {
        this.input = inputManager;
        this.enabled = false;
        
        // Left stick (movement)
        this.leftStick = {
            active: false,
            touchId: null,
            centerX: 0,
            centerY: 0,
            currentX: 0,
            currentY: 0
        };
        
        // Right stick (camera/aim)
        this.rightStick = {
            active: false,
            touchId: null,
            centerX: 0,
            centerY: 0,
            currentX: 0,
            currentY: 0
        };
        
        this.container = null;
        this.stickRadius = 50;
        
        this.checkMobile();
    }
    
    checkMobile() {
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth <= 1024;
        
        if (isTouchDevice || isSmallScreen || window.location.search.includes('mobile')) {
            this.enable();
        }
    }
    
    enable() {
        if (this.enabled) return;
        this.enabled = true;
        
        this.createUI();
        this.setupTouchListeners();
    }
    
    createUI() {
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
                    -webkit-touch-callout: none;
                }
                
                .stick-zone {
                    position: absolute;
                    bottom: 0;
                    width: 45%;
                    height: 45%;
                    pointer-events: auto;
                }
                
                #left-stick-zone {
                    left: 0;
                }
                
                #right-stick-zone {
                    right: 0;
                }
                
                .stick-base {
                    position: absolute;
                    width: 120px;
                    height: 120px;
                    background: rgba(255,255,255,0.15);
                    border: 3px solid rgba(255,255,255,0.3);
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    display: none;
                }
                
                .stick-thumb {
                    position: absolute;
                    width: 50px;
                    height: 50px;
                    background: rgba(255,255,255,0.5);
                    border: 2px solid rgba(255,255,255,0.8);
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    display: none;
                }
                
                /* Buttons */
                .mobile-btn {
                    position: absolute;
                    background: rgba(255,255,255,0.2);
                    border: 3px solid rgba(255,255,255,0.4);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    font-weight: bold;
                    color: white;
                    text-shadow: 1px 1px 2px black;
                    pointer-events: auto;
                }
                
                .mobile-btn.pressed {
                    background: rgba(255,255,255,0.5);
                    transform: scale(0.95);
                }
                
                /* SHOOT - big red button, right side above stick */
                #btn-shoot {
                    right: 20px;
                    bottom: 50%;
                    width: 75px;
                    height: 75px;
                    background: rgba(255,60,60,0.5);
                    border-color: rgba(255,100,100,0.7);
                    font-size: 16px;
                    font-weight: bold;
                }
                
                /* Vehicle enter/exit - left of shoot */
                #btn-vehicle {
                    right: 105px;
                    bottom: 53%;
                    width: 55px;
                    height: 55px;
                    background: rgba(60,150,255,0.5);
                    border-color: rgba(100,180,255,0.7);
                    font-size: 22px;
                }
                
                /* Grab/Throw - below vehicle button */
                #btn-grab {
                    right: 105px;
                    bottom: 38%;
                    width: 55px;
                    height: 55px;
                    background: rgba(255,200,60,0.5);
                    border-color: rgba(255,220,100,0.7);
                    font-size: 11px;
                }
                
                /* Boost - below shoot */
                #btn-boost {
                    right: 20px;
                    bottom: 36%;
                    width: 55px;
                    height: 55px;
                    background: rgba(60,255,120,0.5);
                    border-color: rgba(100,255,150,0.7);
                    font-size: 20px;
                }
                
                /* Instructions */
                #mobile-instructions {
                    position: absolute;
                    bottom: 5px;
                    left: 50%;
                    transform: translateX(-50%);
                    color: rgba(255,255,255,0.6);
                    font-size: 11px;
                    text-align: center;
                    pointer-events: none;
                }
            </style>
            
            <!-- Left stick zone (movement) -->
            <div id="left-stick-zone" class="stick-zone">
                <div id="left-stick-base" class="stick-base"></div>
                <div id="left-stick-thumb" class="stick-thumb"></div>
            </div>
            
            <!-- Right stick zone (camera) -->
            <div id="right-stick-zone" class="stick-zone">
                <div id="right-stick-base" class="stick-base"></div>
                <div id="right-stick-thumb" class="stick-thumb"></div>
            </div>
            
            <!-- Action buttons -->
            <div id="btn-shoot" class="mobile-btn">FIRE</div>
            <div id="btn-vehicle" class="mobile-btn">E</div>
            <div id="btn-grab" class="mobile-btn">GRAB</div>
            <div id="btn-boost" class="mobile-btn">⚡</div>
            
            <div id="mobile-instructions">
                Left stick: Move | Right stick: Aim
            </div>
        `;
        
        document.body.appendChild(this.container);
        
        // Cache elements
        this.leftZone = document.getElementById('left-stick-zone');
        this.leftBase = document.getElementById('left-stick-base');
        this.leftThumb = document.getElementById('left-stick-thumb');
        
        this.rightZone = document.getElementById('right-stick-zone');
        this.rightBase = document.getElementById('right-stick-base');
        this.rightThumb = document.getElementById('right-stick-thumb');
        
        // Hide desktop instructions
        const instructions = document.getElementById('instructions');
        if (instructions) instructions.style.display = 'none';
    }
    
    setupTouchListeners() {
        // Left stick
        this.leftZone.addEventListener('touchstart', (e) => this.onStickStart(e, 'left'), { passive: false });
        this.leftZone.addEventListener('touchmove', (e) => this.onStickMove(e, 'left'), { passive: false });
        this.leftZone.addEventListener('touchend', (e) => this.onStickEnd(e, 'left'), { passive: false });
        this.leftZone.addEventListener('touchcancel', (e) => this.onStickEnd(e, 'left'), { passive: false });
        
        // Right stick
        this.rightZone.addEventListener('touchstart', (e) => this.onStickStart(e, 'right'), { passive: false });
        this.rightZone.addEventListener('touchmove', (e) => this.onStickMove(e, 'right'), { passive: false });
        this.rightZone.addEventListener('touchend', (e) => this.onStickEnd(e, 'right'), { passive: false });
        this.rightZone.addEventListener('touchcancel', (e) => this.onStickEnd(e, 'right'), { passive: false });
        
        // Buttons
        this.setupButton('btn-shoot', 'shoot');
        this.setupButton('btn-vehicle', 'interact');
        this.setupButton('btn-grab', 'grab');
        this.setupButton('btn-boost', 'boost');
    }
    
    setupButton(id, inputKey) {
        const btn = document.getElementById(id);
        
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.add('pressed');
            this.input.keys[inputKey] = true;
        }, { passive: false });
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.remove('pressed');
            this.input.keys[inputKey] = false;
        }, { passive: false });
        
        btn.addEventListener('touchcancel', (e) => {
            btn.classList.remove('pressed');
            this.input.keys[inputKey] = false;
        }, { passive: false });
    }
    
    onStickStart(e, side) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const stick = side === 'left' ? this.leftStick : this.rightStick;
        const base = side === 'left' ? this.leftBase : this.rightBase;
        const thumb = side === 'left' ? this.leftThumb : this.rightThumb;
        
        if (stick.active) return; // Already tracking a touch
        
        stick.active = true;
        stick.touchId = touch.identifier;
        stick.centerX = touch.clientX;
        stick.centerY = touch.clientY;
        stick.currentX = touch.clientX;
        stick.currentY = touch.clientY;
        
        // Show stick at touch position
        base.style.display = 'block';
        base.style.left = touch.clientX + 'px';
        base.style.top = touch.clientY + 'px';
        
        thumb.style.display = 'block';
        thumb.style.left = touch.clientX + 'px';
        thumb.style.top = touch.clientY + 'px';
    }
    
    onStickMove(e, side) {
        e.preventDefault();
        const stick = side === 'left' ? this.leftStick : this.rightStick;
        const thumb = side === 'left' ? this.leftThumb : this.rightThumb;
        
        if (!stick.active) return;
        
        for (const touch of e.changedTouches) {
            if (touch.identifier === stick.touchId) {
                let dx = touch.clientX - stick.centerX;
                let dy = touch.clientY - stick.centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Clamp to radius
                if (dist > this.stickRadius) {
                    dx = (dx / dist) * this.stickRadius;
                    dy = (dy / dist) * this.stickRadius;
                }
                
                stick.currentX = stick.centerX + dx;
                stick.currentY = stick.centerY + dy;
                
                // Update thumb position
                thumb.style.left = stick.currentX + 'px';
                thumb.style.top = stick.currentY + 'px';
                
                // Normalize to -1 to 1
                const normX = dx / this.stickRadius;
                const normY = dy / this.stickRadius;
                
                if (side === 'left') {
                    // Movement
                    this.input.keys.forward = normY < -0.2;
                    this.input.keys.backward = normY > 0.2;
                    this.input.keys.left = normX < -0.2;
                    this.input.keys.right = normX > 0.2;
                } else {
                    // Camera - feed as mouse delta
                    this.input.mouse.deltaX += dx * 0.15;
                    this.input.mouse.deltaY += dy * 0.15;
                }
            }
        }
    }
    
    onStickEnd(e, side) {
        e.preventDefault();
        const stick = side === 'left' ? this.leftStick : this.rightStick;
        const base = side === 'left' ? this.leftBase : this.rightBase;
        const thumb = side === 'left' ? this.leftThumb : this.rightThumb;
        
        for (const touch of e.changedTouches) {
            if (touch.identifier === stick.touchId) {
                stick.active = false;
                stick.touchId = null;
                
                // Hide stick
                base.style.display = 'none';
                thumb.style.display = 'none';
                
                if (side === 'left') {
                    // Reset movement
                    this.input.keys.forward = false;
                    this.input.keys.backward = false;
                    this.input.keys.left = false;
                    this.input.keys.right = false;
                }
            }
        }
    }
}
