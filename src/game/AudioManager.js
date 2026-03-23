/**
 * Simple audio manager using Web Audio API
 * Generates procedural sound effects
 */

export class AudioManager {
    constructor() {
        this.context = null;
        this.enabled = true;
    }
    
    init() {
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio not available');
            this.enabled = false;
        }
    }
    
    // Resume context on user interaction
    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }
    
    // Simple gunshot sound
    playShoot() {
        if (!this.enabled || !this.context) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const noise = this.createNoise(0.1);
        
        osc.connect(gain);
        noise.connect(gain);
        gain.connect(this.context.destination);
        
        osc.frequency.setValueAtTime(150, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.context.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.3, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.15);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.15);
    }
    
    // Hit sound
    playHit() {
        if (!this.enabled || !this.context) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.connect(gain);
        gain.connect(this.context.destination);
        
        osc.frequency.setValueAtTime(400, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.2, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.1);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.1);
    }
    
    // Engine rumble
    playEngine(speed) {
        // Would need continuous oscillator - skip for now
    }
    
    // Gunther escape alert
    playAlert() {
        if (!this.enabled || !this.context) return;
        this.resume();
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.type = 'square';
        osc.connect(gain);
        gain.connect(this.context.destination);
        
        // Two-tone alert
        osc.frequency.setValueAtTime(800, this.context.currentTime);
        osc.frequency.setValueAtTime(600, this.context.currentTime + 0.15);
        osc.frequency.setValueAtTime(800, this.context.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.15, this.context.currentTime);
        gain.gain.setValueAtTime(0.15, this.context.currentTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.5);
        
        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + 0.5);
    }
    
    // Create white noise for effects
    createNoise(duration) {
        const bufferSize = this.context.sampleRate * duration;
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.context.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        noise.connect(filter);
        noise.start(this.context.currentTime);
        
        return filter;
    }
}
