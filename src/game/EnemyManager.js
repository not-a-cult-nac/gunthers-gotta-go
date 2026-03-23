/**
 * Spawns and manages enemies
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';

class Enemy {
    constructor(scene, type, position) {
        this.scene = scene;
        this.type = type; // 'stealer' or 'killer'
        this.position = position.clone();
        this.velocity = new THREE.Vector3();
        this.health = GameConfig.ENEMY_HEALTH;
        this.hasGunther = false;
        this.isDead = false;
        
        // Speed varies by type
        const baseSpeed = GameConfig.ENEMY_BASE_SPEED;
        this.speed = type === 'killer' 
            ? baseSpeed * 1.45 
            : baseSpeed * 1.2;
        this.speed *= 0.9 + Math.random() * 0.2; // Slight variation
        
        this.createMesh();
    }
    
    createMesh() {
        // Enemy mesh - different colors by type
        const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 8, 16);
        const color = this.type === 'killer' ? 0xff0000 : 0x990099;
        const bodyMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.castShadow = true;
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }
    
    update(delta, target, gunther) {
        if (this.isDead) return;
        
        // Move toward target
        const dir = target.clone().sub(this.position);
        dir.y = 0;
        const dist = dir.length();
        
        if (dist > 1) {
            dir.normalize();
            this.velocity.copy(dir.multiplyScalar(this.speed));
            this.position.add(this.velocity.clone().multiplyScalar(delta));
        }
        
        // Face movement direction
        if (this.velocity.length() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }
        
        // Update mesh
        this.mesh.position.copy(this.position);
        this.mesh.position.y = 0.8; // Offset for capsule center
    }
    
    takeDamage(amount) {
        this.health -= amount;
        
        // Flash red
        this.mesh.material.emissive = new THREE.Color(0xffffff);
        this.mesh.material.emissiveIntensity = 0.5;
        setTimeout(() => {
            if (this.mesh.material) {
                this.mesh.material.emissiveIntensity = 0;
            }
        }, 100);
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    die() {
        this.isDead = true;
        this.hasGunther = false;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

export class EnemyManager {
    constructor(scene, physicsWorld, RAPIER) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        
        this.enemies = [];
        this.spawnTimer = 0;
    }
    
    init() {
        // Spawn initial enemies
        // (They'll spawn when vehicle starts moving)
    }
    
    update(delta, vehicle, gunther, player) {
        // Spawn new enemies
        this.spawnTimer += delta;
        if (this.spawnTimer >= GameConfig.ENEMY_SPAWN_INTERVAL) {
            this.spawnTimer = 0;
            if (this.enemies.length < GameConfig.ENEMY_MAX_COUNT) {
                this.spawnEnemy(vehicle);
            }
        }
        
        // Spawn initial enemies if we have none
        if (this.enemies.length === 0 && vehicle.position.z > GameConfig.START_Z + 10) {
            for (let i = 0; i < GameConfig.ENEMY_INITIAL_COUNT; i++) {
                this.spawnEnemy(vehicle);
            }
        }
        
        // Update each enemy
        for (const enemy of this.enemies) {
            if (enemy.isDead) continue;
            
            // Determine target
            let target;
            if (enemy.type === 'killer') {
                // Killers target the vehicle
                target = vehicle.position.clone();
            } else {
                // Stealers target Gunther (or vehicle if Gunther is inside)
                if (gunther.state === 'in_vehicle') {
                    target = vehicle.position.clone();
                } else {
                    target = gunther.position.clone();
                }
            }
            
            enemy.update(delta, target, gunther);
            
            // Check interactions
            this.checkEnemyInteractions(enemy, vehicle, gunther, player);
        }
        
        // Check bullet collisions
        this.checkBulletCollisions(player);
        
        // Remove dead enemies
        this.enemies = this.enemies.filter(e => !e.isDead);
    }
    
    spawnEnemy(vehicle) {
        // Spawn ahead of vehicle
        const minZ = Math.max(GameConfig.START_Z + 30, vehicle.position.z + GameConfig.ENEMY_SPAWN_AHEAD_MIN);
        const maxZ = Math.min(GameConfig.GOAL_Z - 30, vehicle.position.z + GameConfig.ENEMY_SPAWN_AHEAD_MAX);
        
        if (minZ >= maxZ) return; // Can't spawn
        
        const side = Math.random() > 0.5 ? 1 : -1;
        const position = new THREE.Vector3(
            side * (GameConfig.ENEMY_SPAWN_SIDE_MIN + Math.random() * (GameConfig.ENEMY_SPAWN_SIDE_MAX - GameConfig.ENEMY_SPAWN_SIDE_MIN)),
            0,
            minZ + Math.random() * (maxZ - minZ)
        );
        
        const type = Math.random() < GameConfig.ENEMY_STEALER_RATIO ? 'stealer' : 'killer';
        const enemy = new Enemy(this.scene, type, position);
        this.enemies.push(enemy);
    }
    
    checkEnemyInteractions(enemy, vehicle, gunther, player) {
        // Killer damages vehicle
        if (enemy.type === 'killer') {
            const dist = enemy.position.distanceTo(vehicle.position);
            if (dist < 4) {
                vehicle.takeDamage(1);
                // Push enemy back
                const pushDir = enemy.position.clone().sub(vehicle.position).normalize();
                enemy.position.add(pushDir.multiplyScalar(0.5));
            }
        }
        
        // Stealer grabs Gunther
        if (enemy.type === 'stealer' && !enemy.hasGunther) {
            if (gunther.state === 'wandering') {
                const dist = enemy.position.distanceTo(gunther.position);
                if (dist < 2) {
                    gunther.getKidnapped(enemy);
                }
            }
        }
        
        // Enemy with Gunther runs away
        if (enemy.hasGunther) {
            // Run away from vehicle
            const awayDir = enemy.position.clone().sub(vehicle.position);
            awayDir.y = 0;
            awayDir.normalize();
            enemy.position.add(awayDir.multiplyScalar(enemy.speed * 0.016)); // Fixed delta for simplicity
        }
        
        // Enemy damages player on foot
        if (!player.inVehicle) {
            const dist = enemy.position.distanceTo(player.position);
            if (dist < 2) {
                player.takeDamage(0.5);
            }
        }
    }
    
    checkBulletCollisions(player) {
        for (const bullet of player.bullets) {
            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;
                
                const dist = bullet.position.distanceTo(enemy.mesh.position);
                if (dist < 1) {
                    enemy.takeDamage(bullet.userData.damage);
                    
                    // If enemy had Gunther, release him
                    if (enemy.hasGunther && enemy.isDead) {
                        // Gunther will need to be released - handled by Gunther
                    }
                    
                    // Remove bullet
                    bullet.userData.lifetime = 0;
                    break;
                }
            }
        }
    }
}
