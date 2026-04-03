/**
 * Spawns and manages enemies - background scenery only (no chasing)
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

        this.speed = GameConfig.ENEMY_BASE_SPEED * (0.5 + Math.random() * 0.5);

        this.mesh = createEnemyModel(type);
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);

        // Random wander target
        this.wanderTarget = this.pickWanderTarget();
        this.wanderTimer = 3 + Math.random() * 5;
    }

    pickWanderTarget() {
        return new THREE.Vector3(
            this.position.x + (Math.random() - 0.5) * 30,
            0,
            this.position.z + (Math.random() - 0.5) * 30
        );
    }

    update(delta, world) {
        if (this.isDead) return;

        // Wander aimlessly
        this.wanderTimer -= delta;
        if (this.wanderTimer <= 0) {
            this.wanderTarget = this.pickWanderTarget();
            this.wanderTimer = 3 + Math.random() * 5;
        }

        const dir = this.wanderTarget.clone().sub(this.position);
        dir.y = 0;
        const dist = dir.length();

        if (dist > 2) {
            dir.normalize();
            this.velocity.copy(dir.multiplyScalar(this.speed));
            this.position.add(this.velocity.clone().multiplyScalar(delta));
        } else {
            this.wanderTarget = this.pickWanderTarget();
        }

        // Get terrain height
        if (world) {
            this.position.y = world.getHeightAt(this.position.x, this.position.z);
        }

        // Face movement direction
        if (this.velocity.length() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }

        this.mesh.position.copy(this.position);
    }

    die() {
        this.isDead = true;
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
        // Enemies spawn as scenery
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

        // Update each enemy - just wander, no interactions
        for (const enemy of this.enemies) {
            if (enemy.isDead) continue;
            enemy.update(delta, world);

            // Run over by vehicle (still works - satisfying!)
            const distToVehicle = enemy.position.distanceTo(vehicle.position);
            if (distToVehicle < 3 && Math.abs(vehicle.speed) > 5) {
                enemy.die();
                if (this.audioManager) {
                    this.audioManager.playHit();
                }
            }
        }

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
}
