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
import { AudioManager } from './AudioManager.js';
import { HUDArrows } from './HUDArrows.js';
import { GameConfig } from './GameConfig.js';
import { MobileControls } from './MobileControls.js';

export class Game {
    constructor(RAPIER) {
        this.RAPIER = RAPIER;
        this.isRunning = false;
        this.gameState = 'waiting';

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
        this.audioManager = null;
        this.hudArrows = null;

        // iPad charge mechanic
        this.iPadCharge = GameConfig.IPAD_MAX_CHARGE;

        // Goal position for arrows
        this.goalPosition = new THREE.Vector3(0, 0, GameConfig.GOAL_Z);

        // Timing
        this.clock = new THREE.Clock();
    }

    async init() {
        // Create Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 250);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // Check if mobile
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.location.search.includes('mobile');

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: !isMobile,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Physics world
        const gravity = { x: 0.0, y: -9.81, z: 0.0 };
        this.physicsWorld = new this.RAPIER.World(gravity);

        // Lighting
        this.setupLighting();

        // Initialize game systems
        this.inputManager = new InputManager();
        this.mobileControls = new MobileControls(this.inputManager);
        this.uiManager = new UIManager();
        this.audioManager = new AudioManager();
        this.audioManager.init();

        this.world = new World(this.scene, this.physicsWorld, this.RAPIER);
        await this.world.init();

        this.vehicle = new Vehicle(this.scene, this.physicsWorld, this.RAPIER);
        this.vehicle.init();

        this.player = new Player(this.scene, this.physicsWorld, this.RAPIER, this.camera, this.audioManager);
        this.player.init();
        this.player.enterVehicle(this.vehicle);

        this.gunther = new Gunther(this.scene, this.physicsWorld, this.RAPIER, this.audioManager);
        this.gunther.init(this.vehicle);

        this.enemyManager = new EnemyManager(this.scene, this.physicsWorld, this.RAPIER, this.audioManager);
        this.enemyManager.init();

        // HUD arrows
        this.hudArrows = new HUDArrows(this.scene, this.camera);

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

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

        const delta = Math.min(this.clock.getDelta(), 0.1);

        // Step physics
        this.physicsWorld.step();

        // Update game systems
        const input = this.inputManager.getState();

        if (this.gameState === 'playing') {
            this.player.update(delta, input, this.vehicle, this.world);
            this.vehicle.update(delta, input, this.player, this.world);

            // Update iPad charge based on vehicle speed
            this.updateiPadCharge(delta);

            // Gunther stays in jeep - just update position
            this.gunther.update(delta, this.vehicle, this.player, this.enemyManager.enemies, this.world);

            // Enemies wander as background scenery
            this.enemyManager.update(delta, this.vehicle, this.gunther, this.player, this.world);

            // Sync Gunther visibility in vehicle
            this.vehicle.setGuntherVisible(this.gunther.state === 'in_vehicle');

            // Update Gunther iPad glow based on charge
            this.gunther.updateiPadGlow(this.iPadCharge / GameConfig.IPAD_MAX_CHARGE);

            // Update HUD arrows
            this.hudArrows.update(
                this.goalPosition,
                this.gunther.state,
                this.gunther.position
            );

            // Check win/lose conditions
            this.checkGameState();
        }

        // Update UI
        this.uiManager.update(this.vehicle, this.gunther, this.player, this.enemyManager, this.iPadCharge);

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    updateiPadCharge(delta) {
        const speed = Math.abs(this.vehicle.speed);

        if (speed > GameConfig.IPAD_CHARGE_SPEED_THRESHOLD) {
            // Draining while moving
            this.iPadCharge -= GameConfig.IPAD_DRAIN_RATE * delta;
        } else {
            // Charging while stopped
            this.iPadCharge += GameConfig.IPAD_CHARGE_RATE * delta;
        }

        this.iPadCharge = Math.max(0, Math.min(GameConfig.IPAD_MAX_CHARGE, this.iPadCharge));

        // Gunther quotes based on charge level
        const pct = this.iPadCharge / GameConfig.IPAD_MAX_CHARGE;
        if (pct < 0.10 && !this._iPadCriticalSpoke) {
            this._iPadCriticalSpoke = true;
            this._iPadLowSpoke = true;
            const quotes = GameConfig.QUOTES.iPadCritical;
            this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
        } else if (pct < 0.25 && !this._iPadLowSpoke) {
            this._iPadLowSpoke = true;
            const quotes = GameConfig.QUOTES.iPadLow;
            this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
        } else if (pct > 0.5) {
            this._iPadCriticalSpoke = false;
            this._iPadLowSpoke = false;
        }

        // Charging feedback
        if (speed <= GameConfig.IPAD_CHARGE_SPEED_THRESHOLD && pct < 0.9) {
            if (!this._chargingSpoke && pct > 0.3) {
                this._chargingSpoke = true;
                const quotes = GameConfig.QUOTES.iPadCharging;
                this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
            }
        } else {
            this._chargingSpoke = false;
        }

        // iPad dead = Gunther exits the jeep
        if (this.iPadCharge <= 0 && this.gunther.state === 'in_vehicle') {
            this.gunther.speak(GameConfig.QUOTES.iPadDead[0]);
            this.gunther.exitVehicle();
        }

        // If Gunther is wandering and iPad has recharged enough, and jeep is close + stopped, he gets back in
        if (this.gunther.state === 'wandering') {
            const chargePct = (this.iPadCharge / GameConfig.IPAD_MAX_CHARGE) * 100;
            const dist = this.gunther.distanceToVehicle();
            const stopped = Math.abs(this.vehicle.speed) <= GameConfig.IPAD_CHARGE_SPEED_THRESHOLD;

            if (chargePct >= GameConfig.GUNTHER_REBOARD_CHARGE && dist <= GameConfig.GUNTHER_REBOARD_DISTANCE && stopped) {
                this.gunther.putInVehicle();
                const reboardQuotes = GameConfig.QUOTES.iPadReboard;
                this.gunther.speak(reboardQuotes[Math.floor(Math.random() * reboardQuotes.length)]);
            }

            // If Gunther wanders too far, game over
            if (dist > GameConfig.GUNTHER_WANDER_MAX_DISTANCE) {
                this.gunther.die('wandered', 'Gunther wandered off!');
                this.lose('Gunther wandered off!');
            }
        }
    }

    checkGameState() {
        // Win: vehicle with Gunther reaches goal
        if (this.vehicle.position.z >= GameConfig.GOAL_Z && this.gunther.state === 'in_vehicle') {
            this.win('Gunther delivered safely!');
            return;
        }

        // Lose: Vehicle destroyed
        if (this.vehicle.health <= 0) {
            this.lose('The jeep was destroyed!');
            return;
        }
    }

    win(reason) {
        this.gameState = 'won';
        this.isRunning = false;
        document.exitPointerLock();
        this.uiManager.showEndScreen(true, reason);
        this.audioManager.playWin();
    }

    lose(reason) {
        this.gameState = 'lost';
        this.isRunning = false;
        document.exitPointerLock();
        this.uiManager.showEndScreen(false, reason);
        this.audioManager.playLose();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
