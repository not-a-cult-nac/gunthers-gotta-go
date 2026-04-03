/**
 * Main Game class - orchestrates all systems - THE GAUNTLET
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

        // Lighting refs (for tunnel)
        this.ambientLight = null;
        this.sunLight = null;
        this.hemiLight = null;
        this.headlight = null;

        // Gauntlet state
        this.tunnelActive = false;
        this.fallingRocks = [];
        this.fallingRockTimer = 0;
        this._zoneSpoken = {};
        this._lavaScreamCooldown = 0;
        this._pendulumHitCooldown = 0;
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

        // Headlight for tunnel (starts off)
        this.headlight = new THREE.SpotLight(0xffffaa, 0, 40, Math.PI / 5, 0.5, 1);
        this.headlight.position.set(0, 2, 3);
        this.headlight.target.position.set(0, 1, 15);
        this.vehicle.mesh.add(this.headlight);
        this.vehicle.mesh.add(this.headlight.target);

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
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.scene.add(this.sunLight);

        this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x556633, 0.3);
        this.scene.add(this.hemiLight);
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

            // THE GAUNTLET zone effects
            this.updateGauntletEffects(delta);

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
            this.iPadCharge -= GameConfig.IPAD_DRAIN_RATE * delta;
        } else {
            this.iPadCharge += GameConfig.IPAD_CHARGE_RATE * delta;
        }

        this.iPadCharge = Math.max(0, Math.min(GameConfig.IPAD_MAX_CHARGE, this.iPadCharge));

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

        if (speed <= GameConfig.IPAD_CHARGE_SPEED_THRESHOLD && pct < 0.9) {
            if (!this._chargingSpoke && pct > 0.3) {
                this._chargingSpoke = true;
                const quotes = GameConfig.QUOTES.iPadCharging;
                this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
            }
        } else {
            this._chargingSpoke = false;
        }

        if (this.iPadCharge <= 0 && this.gunther.state === 'in_vehicle') {
            this.gunther.speak(GameConfig.QUOTES.iPadDead[0]);
            this.gunther.exitVehicle();
        }

        if (this.gunther.state === 'wandering') {
            const chargePct = (this.iPadCharge / GameConfig.IPAD_MAX_CHARGE) * 100;
            const dist = this.gunther.distanceToVehicle();
            const stopped = Math.abs(this.vehicle.speed) <= GameConfig.IPAD_CHARGE_SPEED_THRESHOLD;

            if (chargePct >= GameConfig.GUNTHER_REBOARD_CHARGE && dist <= GameConfig.GUNTHER_REBOARD_DISTANCE && stopped) {
                this.gunther.putInVehicle();
                const reboardQuotes = GameConfig.QUOTES.iPadReboard;
                this.gunther.speak(reboardQuotes[Math.floor(Math.random() * reboardQuotes.length)]);
            }

            if (dist > GameConfig.GUNTHER_WANDER_MAX_DISTANCE) {
                this.gunther.die('wandered', 'Gunther wandered off!');
                this.lose('Gunther wandered off!');
            }
        }
    }

    // === THE GAUNTLET - Zone Effects ===

    updateGauntletEffects(delta) {
        const z = this.vehicle.position.z;
        const x = this.vehicle.position.x;
        const zones = GameConfig.ZONES;

        // Reset vehicle zone multipliers each frame
        this.vehicle.speedMultiplier = 1;
        this.vehicle.tractionMultiplier = 1;
        this.vehicle.lateralForce = 0;

        // Cooldown timers
        this._lavaScreamCooldown = Math.max(0, (this._lavaScreamCooldown || 0) - delta);
        this._pendulumHitCooldown = Math.max(0, (this._pendulumHitCooldown || 0) - delta);

        // Section 1: Water zone
        if (z >= zones.water.startZ && z <= zones.water.endZ) {
            this.vehicle.speedMultiplier = 0.6;
            // Current force - weaker near path center (shallow ford)
            const pathX = this.world.getPathX(z);
            const distFromCenter = Math.abs(x - pathX);
            const currentStrength = Math.min(1, distFromCenter / 10);
            this.vehicle.lateralForce = zones.water.currentForce * currentStrength;

            if (!this._zoneSpoken.water) {
                this._zoneSpoken.water = true;
                const quotes = GameConfig.QUOTES.water;
                this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
            }
        }

        // Section 3: Mud zone
        if (z >= zones.mud.startZ && z <= zones.mud.endZ) {
            this.vehicle.speedMultiplier = 0.5;
        }

        // Section 4: Tunnel zone
        if (z >= zones.tunnel.startZ && z <= zones.tunnel.endZ) {
            if (!this.tunnelActive) {
                this.enterTunnel();
            }
        } else {
            if (this.tunnelActive) {
                this.exitTunnel();
            }
        }

        // Section 5: Pendulums
        this.updatePendulums(delta);

        // Section 6: Crumbling bridge
        if (z >= zones.bridge.startZ && z <= zones.bridge.endZ) {
            const pathX = this.world.getPathX(z);
            const distFromCenter = Math.abs(x - pathX);

            // Off the bridge edge - heavy damage
            if (distFromCenter > zones.bridge.halfWidth) {
                this.vehicle.takeDamage(80 * delta);
            }

            // Bridge holes
            for (const hole of GameConfig.BRIDGE_HOLES) {
                if (Math.abs(z - hole.z) < hole.halfWidth) {
                    const holePath = this.world.getPathX(hole.z);
                    if (Math.abs(x - holePath) < zones.bridge.halfWidth) {
                        this.vehicle.takeDamage(35 * delta);
                    }
                }
            }
        }

        // Section 7: Lava proximity
        for (const lava of GameConfig.GAUNTLET_LAVA) {
            const pathX = this.world.getPathX(lava.z);
            const lx = pathX + lava.x;
            const dx = x - lx;
            const dz = z - lava.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < lava.radius) {
                this.vehicle.takeDamage(50 * delta);
                if (this._lavaScreamCooldown <= 0) {
                    const quotes = GameConfig.QUOTES.lava;
                    this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
                    this._lavaScreamCooldown = 2;
                }
            }
        }

        // Section 8: Ice zone
        if (z >= zones.ice.startZ && z <= zones.ice.endZ) {
            this.vehicle.tractionMultiplier = 0.3;

            if (!this._zoneSpoken.ice) {
                this._zoneSpoken.ice = true;
                const quotes = GameConfig.QUOTES.ice;
                this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
            }
        }

        // Section 9: Falling rocks
        this.updateFallingRocks(delta);
    }

    updatePendulums(delta) {
        const time = this.clock.getElapsedTime();

        for (const p of this.world.pendulumObjects) {
            // Animate swing
            const angle = Math.sin(time * 2 * Math.PI / p.period + p.phase) * p.maxAngle;
            p.group.rotation.z = angle;

            // Calculate sphere world position for collision
            p.currentX = p.centerX + Math.sin(angle) * p.chainLen;

            // Update knockback cooldown
            if (p.knockbackCooldown > 0) {
                p.knockbackCooldown -= delta;
            }

            // Check collision with vehicle
            const dx = this.vehicle.position.x - p.currentX;
            const dz = this.vehicle.position.z - p.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < p.radius + 2 && p.knockbackCooldown <= 0) {
                // Knockback
                const knockDir = dx > 0 ? 1 : -1;
                this.vehicle.position.x += knockDir * 5;
                this.vehicle.speed *= 0.3;
                this.vehicle.takeDamage(20);
                p.knockbackCooldown = 1.5;
            }
        }
    }

    updateFallingRocks(delta) {
        const z = this.vehicle.position.z;
        const zone = GameConfig.ZONES.fallingRocks;

        // Spawn rocks when jeep is in zone
        if (z >= zone.startZ && z <= zone.endZ) {
            if (!this._zoneSpoken.fallingRocks) {
                this._zoneSpoken.fallingRocks = true;
                const quotes = GameConfig.QUOTES.fallingRocks;
                this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
            }

            this.fallingRockTimer -= delta;
            if (this.fallingRockTimer <= 0) {
                this.spawnFallingRock();
                this.fallingRockTimer = zone.spawnInterval * (0.7 + Math.random() * 0.6);
            }
        }

        // Update existing rocks
        for (let i = this.fallingRocks.length - 1; i >= 0; i--) {
            const rock = this.fallingRocks[i];
            const pos = rock.rigidBody.translation();
            rock.mesh.position.set(pos.x, pos.y, pos.z);

            const rot = rock.rigidBody.rotation();
            rock.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

            // Collision check with vehicle
            const dx = this.vehicle.position.x - pos.x;
            const dz = this.vehicle.position.z - pos.z;
            const dy = this.vehicle.position.y + 1 - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < rock.radius + 2.5 && !rock.hasHit) {
                rock.hasHit = true;
                this.vehicle.takeDamage(15);
                this.vehicle.speed *= 0.5;
            }

            // Remove old rocks
            rock.age += delta;
            if (rock.age > 10) {
                this.scene.remove(rock.mesh);
                this.physicsWorld.removeRigidBody(rock.rigidBody);
                this.fallingRocks.splice(i, 1);
            }
        }
    }

    spawnFallingRock() {
        const zone = GameConfig.ZONES.fallingRocks;
        const z = zone.startZ + Math.random() * (zone.endZ - zone.startZ);
        const pathX = this.world.getPathX(z);
        const x = pathX + (Math.random() - 0.5) * 14;
        const y = 25 + Math.random() * 10;
        const radius = 1 + Math.random() * 1.5;

        // Visual
        const geo = new THREE.SphereGeometry(radius, 6, 5);
        const positions = geo.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += (Math.random() - 0.5) * radius * 0.3;
            positions[i + 1] += (Math.random() - 0.5) * radius * 0.2;
            positions[i + 2] += (Math.random() - 0.5) * radius * 0.3;
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x777766,
            roughness: 0.9,
            flatShading: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);

        // Physics - dynamic rigid body
        const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y, z);
        const body = this.physicsWorld.createRigidBody(bodyDesc);
        const colliderDesc = this.RAPIER.ColliderDesc.ball(radius)
            .setRestitution(0.3);
        this.physicsWorld.createCollider(colliderDesc, body);

        this.fallingRocks.push({
            mesh,
            rigidBody: body,
            radius,
            age: 0,
            hasHit: false,
        });
    }

    enterTunnel() {
        this.tunnelActive = true;

        // Dim all lights
        this.ambientLight.intensity = 0.05;
        this.sunLight.intensity = 0.1;
        this.hemiLight.intensity = 0.05;

        // Dark fog
        this.scene.fog = new THREE.Fog(0x000000, 5, 30);
        this.scene.background = new THREE.Color(0x000000);

        // Enable headlight
        this.headlight.intensity = 2;

        // Gunther quote
        if (!this._zoneSpoken.tunnel) {
            this._zoneSpoken.tunnel = true;
            const quotes = GameConfig.QUOTES.tunnel;
            this.gunther.speak(quotes[Math.floor(Math.random() * quotes.length)]);
        }
    }

    exitTunnel() {
        this.tunnelActive = false;

        // Restore lights
        this.ambientLight.intensity = 0.4;
        this.sunLight.intensity = 1.0;
        this.hemiLight.intensity = 0.3;

        // Restore sky
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 250);
        this.scene.background = new THREE.Color(0x87CEEB);

        // Disable headlight
        this.headlight.intensity = 0;
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
        if (this.tunnelActive) this.exitTunnel();
        document.exitPointerLock();
        this.uiManager.showEndScreen(true, reason);
        this.audioManager.playWin();
    }

    lose(reason) {
        this.gameState = 'lost';
        this.isRunning = false;
        if (this.tunnelActive) this.exitTunnel();
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
