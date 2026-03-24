/**
 * Gunther's Gotta Go - Single Player Prototype
 * Three.js + Rapier physics
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Check if mobile early
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.location.search.includes('mobile');
    console.log('Mobile detected:', isMobile);
    console.log('Screen size:', window.innerWidth, 'x', window.innerHeight);
    console.log('Device pixel ratio:', window.devicePixelRatio);
    
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');
    const loadingMsg = document.getElementById('loading-msg');
    const errorMsg = document.getElementById('error-msg');
    
    // Check WebGL support first
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            throw new Error('WebGL not supported');
        }
        console.log('WebGL supported');
    } catch (err) {
        console.error('WebGL check failed:', err);
        errorMsg.textContent = 'WebGL not supported on this device. Try a different browser.';
        errorMsg.style.display = 'block';
        startBtn.disabled = true;
        startBtn.style.opacity = 0.5;
        return;
    }
    
    // Initialize Rapier WASM
    loadingMsg.style.display = 'block';
    try {
        await RAPIER.init();
        console.log('Rapier initialized');
        loadingMsg.style.display = 'none';
    } catch (err) {
        console.error('Failed to init Rapier:', err);
        loadingMsg.style.display = 'none';
        errorMsg.textContent = 'Failed to initialize physics. Your browser may not support WebAssembly.';
        errorMsg.style.display = 'block';
        startBtn.disabled = true;
        startBtn.style.opacity = 0.5;
        return;
    }
    
    let game = null;
    
    startBtn.addEventListener('click', async () => {
        try {
            startScreen.style.display = 'none';
            
            // Lock pointer for FPS controls (desktop only)
            if (!isMobile) {
                document.body.requestPointerLock();
            }
            
            // Create and start game
            game = new Game(RAPIER);
            await game.init();
            game.start();
            console.log('Game started successfully');
        } catch (err) {
            console.error('Game init failed:', err);
            startScreen.style.display = 'flex';
            errorMsg.textContent = 'Game failed to start: ' + err.message;
            errorMsg.style.display = 'block';
        }
    });
    
    // Handle pointer lock (desktop only)
    if (!isMobile) {
        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement && game?.isRunning) {
                // Paused - could show pause menu
            }
        });
        
        // Re-lock on click during game
        document.addEventListener('click', () => {
            if (game?.isRunning && !document.pointerLockElement) {
                document.body.requestPointerLock();
            }
        });
    }
});
