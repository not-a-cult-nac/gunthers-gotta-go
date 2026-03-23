/**
 * Main Game class - orchestrates all systems
 */

import * as THREE from 'three';
import { World } from './World.js';
import { Player } from './Player.js';
import { Vehicle } from './Vehicle.js';
import { Gunther } from './Gunther.js';
import { EnemyManager } from './EnemyManager.js';
import { InputManager } from './InputManager.js';
import { UIManager } from './UIManager.js';
import { GameConfig } from './GameConfig.js';

export class Game {
    constructor(RAPIER) {
        this.RAPIER = RAPIER;
        this.isRunning = false;
        this.gameState = 'waiting'; // waiting, playing, won, lost
        
        // Three.js core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Physics
        this.physicsWorld = null;
        
        // Game systems
        this.world = null;
        this.player = null;
        this.vehicle = null;
        this.gunther = null;
        this.enemyManager = null;
        this.inputManager = null;
        this.uiManager = null;
        
        // Timing
        this.clock = new THREE.Clock();
        this.lastTime = 0;
    }
    
    async init() {
        // Create Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
        
        // Camera - will be attached to player/vehicle
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
        
        // Physics world
        const gravity = { x: 0.0, y: -9.81, z: 0.0 };
        this.physicsWorld = new this.RAPIER.World(gravity);
        
        // Lighting
        this.setupLighting();
        
        // Initialize game systems
        this.inputManager = new InputManager();
        this.uiManager = new UIManager();
        
        this.world = new World(this.scene, this.physicsWorld, this.RAPIER);
        await this.world.init();
        
        this.vehicle = new Vehicle(this.scene, this.physicsWorld, this.RAPIER);
        this.vehicle.init();
        
        this.player = new Player(this.scene, this.physicsWorld, this.RAPIER, this.camera);
        this.player.init();
        this.player.enterVehicle(this.vehicle); // Start in vehicle
        
        this.gunther = new Gunther(this.scene, this.physicsWorld, this.RAPIER);
        this.gunther.init(this.vehicle);
        
        this.enemyManager = new EnemyManager(this.scene, this.physicsWorld, this.RAPIER);
        this.enemyManager.init();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }
    
    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        
        // Directional sun light
        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 500;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        this.scene.add(sun);
        
        // Hemisphere light for natural outdoor feel
        const hemi = new THREE.HemisphereLight(0x87CEEB, 0x556633, 0.3);
        this.scene.add(hemi);
    }
    
    start() {
        this.isRunning = true;
        this.gameState = 'playing';
        this.clock.start();
        this.animate();
    }
    
    animate() {
        if (!this.isRunning) return;
        
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1); // Cap delta
        
        // Step physics
        this.physicsWorld.step();
        
        // Update game systems
        const input = this.inputManager.getState();
        
        if (this.gameState === 'playing') {
            this.player.update(delta, input, this.vehicle);
            this.vehicle.update(delta, input, this.player);
            this.gunther.update(delta, this.vehicle, this.player, this.enemyManager.enemies);
            this.enemyManager.update(delta, this.vehicle, this.gunther, this.player);
            
            // Check win/lose conditions
            this.checkGameState();
        }
        
        // Update UI
        this.uiManager.update(this.vehicle, this.gunther, this.player, this.enemyManager);
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }
    
    checkGameState() {
        // Win: Gunther reaches goal
        if (this.vehicle.position.z >= GameConfig.GOAL_Z && this.gunther.state === 'in_vehicle') {
            this.win('Gunther delivered safely!');
            return;
        }
        
        // Lose: Gunther dies
        if (this.gunther.isDead) {
            this.lose(this.gunther.deathReason || 'Gunther died!');
            return;
        }
        
        // Lose: Vehicle destroyed
        if (this.vehicle.health <= 0) {
            this.lose('The jeep was destroyed!');
            return;
        }
        
        // Lose: Player dies
        if (this.player.health <= 0) {
            this.lose('You died!');
            return;
        }
    }
    
    win(reason) {
        this.gameState = 'won';
        this.isRunning = false;
        document.exitPointerLock();
        this.uiManager.showEndScreen(true, reason);
    }
    
    lose(reason) {
        this.gameState = 'lost';
        this.isRunning = false;
        document.exitPointerLock();
        this.uiManager.showEndScreen(false, reason);
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
