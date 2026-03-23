/**
 * Gunther - the suicidal child you must escort
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';

export class Gunther {
    constructor(scene, physicsWorld, RAPIER) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        
        this.mesh = null;
        this.position = new THREE.Vector3();
        
        // States: 'in_vehicle', 'wandering', 'trapped', 'carried', 'kidnapped'
        this.state = 'in_vehicle';
        this.isDead = false;
        this.deathReason = null;
        
        // AI
        this.targetPosition = null;
        this.wanderTimer = 0;
        this.escapeTimer = 0;
        
        // References
        this.vehicle = null;
        this.captor = null; // Enemy carrying Gunther
        this.trapHazard = null; // Trap he's stuck in
        
        // UI callback
        this.onSpeak = null;
    }
    
    init(vehicle) {
        this.vehicle = vehicle;
        
        // Gunther mesh - small child-like figure
        const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.6, 8, 16);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xffcc00, // Bright yellow (he's easy to spot!)
            roughness: 0.6,
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.castShadow = true;
        
        // Add a little hat
        const hatGeo = new THREE.ConeGeometry(0.25, 0.3, 8);
        const hatMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.y = 0.6;
        this.mesh.add(hat);
        
        this.mesh.visible = false; // Hidden when in vehicle
        this.scene.add(this.mesh);
        
        // Set initial position in vehicle
        this.position.copy(vehicle.getGuntherSeatPosition());
    }
    
    update(delta, vehicle, player, enemies) {
        this.vehicle = vehicle;
        
        if (this.isDead) return;
        
        switch (this.state) {
            case 'in_vehicle':
                this.updateInVehicle(delta, vehicle, enemies);
                break;
            case 'wandering':
                this.updateWandering(delta, vehicle, player, enemies);
                break;
            case 'trapped':
                this.updateTrapped(delta, player);
                break;
            case 'carried':
                this.updateCarried(delta, player);
                break;
            case 'kidnapped':
                this.updateKidnapped(delta);
                break;
        }
        
        // Check for hazards
        if (this.state === 'wandering') {
            this.checkHazards();
        }
        
        // Update mesh position
        this.mesh.position.copy(this.position);
    }
    
    updateInVehicle(delta, vehicle, enemies) {
        // Follow vehicle
        this.position.copy(vehicle.getGuntherSeatPosition());
        this.mesh.visible = false;
        
        // Random escape chance
        this.escapeTimer += delta;
        if (this.escapeTimer > 1) { // Check once per second
            this.escapeTimer = 0;
            if (Math.random() < GameConfig.GUNTHER_ESCAPE_RATE) {
                this.escape();
            }
        }
    }
    
    updateWandering(delta, vehicle, player, enemies) {
        this.mesh.visible = true;
        
        // Pick new target if needed
        this.wanderTimer -= delta;
        if (!this.targetPosition || this.wanderTimer <= 0) {
            this.pickNewTarget(enemies);
            this.wanderTimer = 2 + Math.random() * 3;
        }
        
        // Move toward target
        if (this.targetPosition) {
            const dir = this.targetPosition.clone().sub(this.position);
            dir.y = 0;
            const dist = dir.length();
            
            if (dist > 1) {
                dir.normalize();
                const speed = GameConfig.GUNTHER_WANDER_SPEED;
                this.position.add(dir.multiplyScalar(speed * delta));
            } else {
                this.targetPosition = null;
            }
        }
        
        // Face movement direction
        if (this.targetPosition) {
            const angle = Math.atan2(
                this.targetPosition.x - this.position.x,
                this.targetPosition.z - this.position.z
            );
            this.mesh.rotation.y = angle;
        }
        
        // Check if player grabs
        if (player.carryingGunther) {
            // Handled by player
        }
    }
    
    pickNewTarget(enemies) {
        // Gunther is attracted to danger!
        const dangerTargets = [];
        
        // Add hazards as targets
        for (const hazard of GameConfig.HAZARDS) {
            const dist = this.position.distanceTo(new THREE.Vector3(hazard.x, 0, hazard.z));
            if (dist < 50) {
                dangerTargets.push({
                    position: new THREE.Vector3(hazard.x, 0, hazard.z),
                    attraction: GameConfig.GUNTHER_DANGER_ATTRACTION * (1 - dist / 50),
                });
            }
        }
        
        // Add enemies with candy (stealers) as targets
        for (const enemy of enemies) {
            if (enemy.type === 'stealer') {
                const dist = this.position.distanceTo(enemy.position);
                if (dist < 30) {
                    dangerTargets.push({
                        position: enemy.position.clone(),
                        attraction: 0.9, // Really wants that candy
                    });
                }
            }
        }
        
        // Pick random target weighted by attraction
        if (dangerTargets.length > 0 && Math.random() < 0.7) {
            // Sort by attraction and pick from top
            dangerTargets.sort((a, b) => b.attraction - a.attraction);
            this.targetPosition = dangerTargets[0].position.clone();
            this.targetPosition.y = 0;
        } else {
            // Random wander
            this.targetPosition = new THREE.Vector3(
                this.position.x + (Math.random() - 0.5) * 20,
                0,
                this.position.z + (Math.random() - 0.5) * 20
            );
        }
    }
    
    updateTrapped(delta, player) {
        this.mesh.visible = true;
        
        // Stay at trap position
        if (this.trapHazard) {
            this.position.set(this.trapHazard.x, 0.5, this.trapHazard.z);
        }
        
        // Player can rescue by being close and pressing grab
        const dist = this.position.distanceTo(player.position);
        if (dist < 3) {
            // Player will handle rescue via input
        }
    }
    
    updateCarried(delta, player) {
        this.mesh.visible = true;
        this.position.copy(player.getCarryPosition());
    }
    
    updateKidnapped(delta) {
        this.mesh.visible = true;
        
        // Follow captor
        if (this.captor) {
            this.position.copy(this.captor.position);
            this.position.y += 1.5;
            
            // Check if captor escapes with Gunther
            if (this.captor.position.distanceTo(this.vehicle.position) > 60) {
                this.die('enemy', 'The enemy escaped with Gunther!');
            }
        }
    }
    
    checkHazards() {
        for (const hazard of GameConfig.HAZARDS) {
            const dist = Math.sqrt(
                (this.position.x - hazard.x) ** 2 +
                (this.position.z - hazard.z) ** 2
            );
            
            if (dist < hazard.radius) {
                if (hazard.type === 'lava') {
                    this.die('lava', GameConfig.QUOTES.death.lava);
                } else if (hazard.type === 'cliff') {
                    this.die('cliff', GameConfig.QUOTES.death.cliff);
                } else if (hazard.type === 'trap' && this.state !== 'trapped') {
                    this.getTrapped(hazard);
                }
                return;
            }
        }
    }
    
    escape() {
        this.state = 'wandering';
        this.mesh.visible = true;
        
        // Exit vehicle position
        this.position.copy(this.vehicle.position);
        this.position.x += (Math.random() - 0.5) * 4;
        this.position.z += (Math.random() - 0.5) * 4;
        this.position.y = 0.5;
        
        // Say something
        const quote = GameConfig.QUOTES.escape[Math.floor(Math.random() * GameConfig.QUOTES.escape.length)];
        this.speak(quote);
    }
    
    getTrapped(hazard) {
        this.state = 'trapped';
        this.trapHazard = hazard;
        
        const quote = GameConfig.QUOTES.trapped[Math.floor(Math.random() * GameConfig.QUOTES.trapped.length)];
        this.speak(quote);
    }
    
    getKidnapped(enemy) {
        this.state = 'kidnapped';
        this.captor = enemy;
        enemy.hasGunther = true;
        
        this.speak("Nein! Ze adventure vas just beginning!");
    }
    
    rescue(player) {
        if (this.state === 'trapped' || this.state === 'kidnapped') {
            this.state = 'carried';
            this.captor = null;
            this.trapHazard = null;
            player.carryingGunther = true;
        }
    }
    
    putInVehicle() {
        this.state = 'in_vehicle';
        this.mesh.visible = false;
        this.escapeTimer = 0;
    }
    
    dropFromCarry() {
        this.state = 'wandering';
    }
    
    die(type, message) {
        this.isDead = true;
        this.deathReason = message;
        this.mesh.visible = false;
    }
    
    speak(text) {
        const speechEl = document.getElementById('gunther-speech');
        if (speechEl) {
            speechEl.textContent = text;
            speechEl.style.opacity = '1';
            setTimeout(() => {
                speechEl.style.opacity = '0';
            }, 3000);
        }
    }
}
