/**
 * Gunther - the suicidal robot German boy you must escort
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';
import { createGuntherModel } from './models/GuntherModel.js';

export class Gunther {
    constructor(scene, physicsWorld, RAPIER, audioManager) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        this.audioManager = audioManager;
        
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
        this.captor = null;
        this.trapHazard = null;
        
        // Animation
        this.bobOffset = 0;
        
        // Throw physics
        this.isFlying = false;
        this.flyVelocity = new THREE.Vector3();
        this.flyStartPos = new THREE.Vector3();
        this.flyTargetPos = new THREE.Vector3();
        this.flyTime = 0;
        this.flyDuration = 0;
    }
    
    init(vehicle) {
        this.vehicle = vehicle;
        
        this.mesh = createGuntherModel();
        this.mesh.visible = false;
        this.scene.add(this.mesh);
        
        this.position.copy(vehicle.getGuntherSeatPosition());
    }
    
    update(delta, vehicle, player, enemies, world) {
        this.vehicle = vehicle;
        
        if (this.isDead) return;
        
        // Animate marker bobbing
        this.bobOffset += delta * 3;
        const marker = this.mesh.getObjectByName('marker');
        if (marker) {
            marker.position.y = 2.5 + Math.sin(this.bobOffset) * 0.2;
        }
        
        switch (this.state) {
            case 'in_vehicle':
                this.updateInVehicle(delta, vehicle, enemies);
                break;
            case 'wandering':
                this.updateWandering(delta, vehicle, player, enemies, world);
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
        if (this.state === 'wandering' && world) {
            this.checkHazards(world);
        }
        
        // Update mesh position
        this.mesh.position.copy(this.position);
    }
    
    updateInVehicle(delta, vehicle, enemies) {
        this.position.copy(vehicle.getGuntherSeatPosition());
        this.mesh.visible = false;
        
        // Random escape chance
        this.escapeTimer += delta;
        if (this.escapeTimer > 1) {
            this.escapeTimer = 0;
            if (Math.random() < GameConfig.GUNTHER_ESCAPE_RATE) {
                this.escape();
            }
        }
    }
    
    updateWandering(delta, vehicle, player, enemies, world) {
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
        
        // Get terrain height
        if (world) {
            this.position.y = world.getHeightAt(this.position.x, this.position.z);
        }
        
        // Face movement direction
        if (this.targetPosition) {
            const angle = Math.atan2(
                this.targetPosition.x - this.position.x,
                this.targetPosition.z - this.position.z
            );
            this.mesh.rotation.y = angle;
        }
    }
    
    pickNewTarget(enemies) {
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
                        attraction: 0.9,
                    });
                }
            }
        }
        
        // Pick random target weighted by attraction
        if (dangerTargets.length > 0 && Math.random() < 0.7) {
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
        
        if (this.trapHazard) {
            this.position.set(this.trapHazard.x, 0.5, this.trapHazard.z);
        }
    }
    
    updateCarried(delta, player) {
        this.mesh.visible = true;
        this.position.copy(player.getCarryPosition());
    }
    
    updateKidnapped(delta) {
        this.mesh.visible = true;
        
        if (this.captor) {
            this.position.copy(this.captor.position);
            this.position.y += 1.5;
            
            if (this.captor.position.distanceTo(this.vehicle.position) > 60) {
                this.die('enemy', 'The enemy escaped with Gunther!');
            }
        }
    }
    
    checkHazards(world) {
        const hazard = world.getHazardAt(this.position.x, this.position.z);
        if (hazard) {
            if (hazard.type === 'lava') {
                this.die('lava', GameConfig.QUOTES.death.lava);
            } else if (hazard.type === 'cliff') {
                this.die('cliff', GameConfig.QUOTES.death.cliff);
            } else if (hazard.type === 'trap' && this.state !== 'trapped') {
                this.getTrapped(hazard);
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
        
        // Play alert sound
        if (this.audioManager) {
            this.audioManager.playAlert();
        }
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
        
        if (this.audioManager) {
            this.audioManager.playAlert();
        }
    }
    
    rescue(player) {
        if (this.state === 'trapped' || this.state === 'kidnapped' || this.state === 'wandering') {
            this.state = 'carried';
            this.captor = null;
            this.trapHazard = null;
            player.carryingGunther = true;
            
            const quote = GameConfig.QUOTES.carried[Math.floor(Math.random() * GameConfig.QUOTES.carried.length)];
            this.speak(quote);
        }
    }
    
    throwTo(startPos, direction, distance) {
        // Start flying through the air!
        this.state = 'flying';
        this.isFlying = true;
        this.mesh.visible = true;
        
        this.flyStartPos.copy(startPos);
        this.flyStartPos.y += 1.5; // Start at carrying height
        this.position.copy(this.flyStartPos);
        
        // Calculate target position
        this.flyTargetPos.copy(startPos);
        this.flyTargetPos.x += direction.x * distance;
        this.flyTargetPos.z += direction.z * distance;
        
        this.flyTime = 0;
        this.flyDuration = 0.8; // seconds in air
        
        // Initial velocity for arc
        this.flyVelocity.set(
            direction.x * distance / this.flyDuration,
            8, // upward velocity for arc
            direction.z * distance / this.flyDuration
        );
    }
    
    updateFlying(delta, world, vehicle) {
        if (!this.isFlying) return false;
        
        this.flyTime += delta;
        
        // Apply gravity
        this.flyVelocity.y -= 20 * delta;
        
        // Update position
        this.position.x += this.flyVelocity.x * delta;
        this.position.y += this.flyVelocity.y * delta;
        this.position.z += this.flyVelocity.z * delta;
        
        // Spin while flying!
        if (this.mesh) {
            this.mesh.rotation.x += delta * 8;
            this.mesh.rotation.z += delta * 5;
        }
        
        // Check ground collision
        const groundY = world.getHeightAt(this.position.x, this.position.z);
        if (this.position.y <= groundY + 0.5) {
            // Landed!
            this.position.y = groundY;
            this.isFlying = false;
            
            // Reset rotation
            if (this.mesh) {
                this.mesh.rotation.x = 0;
                this.mesh.rotation.z = 0;
            }
            
            // Check if landed in/on jeep
            const distToJeep = this.position.distanceTo(vehicle.position);
            if (distToJeep < 4) {
                this.putInVehicle();
                this.speak("Back in ze car! Danke!");
                return 'in_vehicle';
            }
            
            this.state = 'wandering';
            return 'landed';
        }
        
        return 'flying';
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
