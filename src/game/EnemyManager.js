/**
 * Spawns and manages enemies
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';
import { createEnemyModel } from './models/EnemyModel.js';

class Enemy {
    constructor(scene, type, position) {
        this.scene = scene;
        this.type = type;
        this.position = position.clone();
        this.velocity = new THREE.Vector3();
        this.health = GameConfig.ENEMY_HEALTH;
        this.hasGunther = false;
        this.isDead = false;
        
        const baseSpeed = GameConfig.ENEMY_BASE_SPEED;
        this.speed = type === 'killer' 
            ? baseSpeed * 1.45 
            : baseSpeed * 1.2;
        this.speed *= 0.9 + Math.random() * 0.2;
        
        this.mesh = createEnemyModel(type);
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }
    
    update(delta, target, world) {
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
        
        // Get terrain height
        if (world) {
            this.position.y = world.getHeightAt(this.position.x, this.position.z);
        }
        
        // Face movement direction
        if (this.velocity.length() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }
        
        // Update mesh
        this.mesh.position.copy(this.position);
    }
    
    takeDamage(amount) {
        this.health -= amount;
        
        // Flash white
        this.mesh.traverse(child => {
            if (child.isMesh) {
                child.material.emissive = new THREE.Color(0xffffff);
                child.material.emissiveIntensity = 1.0;
            }
        });
        
        setTimeout(() => {
            if (this.mesh) {
                this.mesh.traverse(child => {
                    if (child.isMesh) {
                        child.material.emissiveIntensity = 0;
                    }
                });
            }
        }, 100);
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    die() {
        this.isDead = true;
        this.hasGunther = false;
        
        // Death animation - scale down and remove
        const mesh = this.mesh;
        const scene = this.scene;
        
        let scale = 1;
        const shrink = () => {
            scale -= 0.1;
            if (scale > 0) {
                mesh.scale.setScalar(scale);
                requestAnimationFrame(shrink);
            } else {
                scene.remove(mesh);
                mesh.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
        };
        shrink();
    }
}

export class EnemyManager {
    constructor(scene, physicsWorld, RAPIER, audioManager) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        this.audioManager = audioManager;
        
        this.enemies = [];
        this.spawnTimer = 0;
    }
    
    init() {
        // Enemies spawn when vehicle starts moving
    }
    
    update(delta, vehicle, gunther, player, world) {
        // Spawn new enemies
        this.spawnTimer += delta;
        if (this.spawnTimer >= GameConfig.ENEMY_SPAWN_INTERVAL) {
            this.spawnTimer = 0;
            if (this.enemies.length < GameConfig.ENEMY_MAX_COUNT) {
                this.spawnEnemy(vehicle);
            }
        }
        
        // Spawn initial enemies
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
                target = vehicle.position.clone();
            } else {
                if (gunther.state === 'in_vehicle') {
                    target = vehicle.position.clone();
                } else {
                    target = gunther.position.clone();
                }
            }
            
            enemy.update(delta, target, world);
            
            this.checkEnemyInteractions(enemy, vehicle, gunther, player);
        }
        
        // Check bullet collisions
        this.checkBulletCollisions(player);
        
        // Remove dead enemies
        this.enemies = this.enemies.filter(e => !e.isDead);
    }
    
    spawnEnemy(vehicle) {
        const minZ = Math.max(GameConfig.START_Z + 30, vehicle.position.z + GameConfig.ENEMY_SPAWN_AHEAD_MIN);
        const maxZ = Math.min(GameConfig.GOAL_Z - 30, vehicle.position.z + GameConfig.ENEMY_SPAWN_AHEAD_MAX);
        
        if (minZ >= maxZ) return;
        
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
        // Check if vehicle runs over enemy
        const distToVehicle = enemy.position.distanceTo(vehicle.position);
        if (distToVehicle < 3 && Math.abs(vehicle.speed) > 5) {
            // Vehicle is moving fast and close - run over!
            enemy.takeDamage(100); // Instant kill
            if (this.audioManager) {
                this.audioManager.playHit();
            }
            return; // Enemy is dead, skip other checks
        }
        
        // Killer damages vehicle (only if close and vehicle is slow)
        if (enemy.type === 'killer') {
            const dist = enemy.position.distanceTo(vehicle.position);
            if (dist < 4 && Math.abs(vehicle.speed) < 5) {
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
            const awayDir = enemy.position.clone().sub(vehicle.position);
            awayDir.y = 0;
            awayDir.normalize();
            enemy.position.add(awayDir.multiplyScalar(enemy.speed * 0.016));
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
                
                // Check collision with enemy body (center mass at y+1)
                const enemyCenter = enemy.position.clone();
                enemyCenter.y += 1; // Enemy center is about 1m above ground
                
                const dist = bullet.position.distanceTo(enemyCenter);
                if (dist < 2) { // Larger hitbox for easier hits
                    enemy.takeDamage(bullet.userData.damage);
                    bullet.userData.lifetime = 0;
                    
                    if (this.audioManager) {
                        this.audioManager.playHit();
                    }
                    
                    break;
                }
            }
        }
    }
}
