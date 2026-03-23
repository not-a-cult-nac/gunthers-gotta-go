/**
 * Gunther's Gotta Go - Single Player Prototype
 * Three.js + Rapier physics
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Rapier WASM
    await RAPIER.init();
    console.log('Rapier initialized');
    
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');
    
    let game = null;
    
    startBtn.addEventListener('click', async () => {
        startScreen.style.display = 'none';
        
        // Lock pointer for FPS controls
        document.body.requestPointerLock();
        
        // Create and start game
        game = new Game(RAPIER);
        await game.init();
        game.start();
    });
    
    // Handle pointer lock
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
});
