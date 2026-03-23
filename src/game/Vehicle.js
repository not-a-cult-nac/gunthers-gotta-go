/**
 * The Jeep - can be driven by player
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';

export class Vehicle {
    constructor(scene, physicsWorld, RAPIER) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        
        this.mesh = null;
        this.rigidBody = null;
        
        this.position = new THREE.Vector3(0, 1, GameConfig.START_Z);
        this.rotation = 0; // Y rotation in radians
        this.velocity = new THREE.Vector3();
        this.speed = 0;
        
        this.health = GameConfig.VEHICLE_HEALTH;
        this.hasDriver = true; // Start with player in vehicle
        
        // Boost
        this.boostFuel = 1.0;
        this.isBoosting = false;
        this.boostCooldown = 0;
    }
    
    init() {
        // Create jeep mesh (simple box for now)
        const bodyGeo = new THREE.BoxGeometry(3, 1.5, 5);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x4a7c2a, // Army green
            roughness: 0.7,
            metalness: 0.3,
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Add roof/roll cage
        const roofGeo = new THREE.BoxGeometry(2.8, 0.2, 4);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 1.2;
        roof.castShadow = true;
        this.mesh.add(roof);
        
        // Add wheels (visual only - Rapier handles physics)
        const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        
        const wheelPositions = [
            { x: -1.3, y: -0.3, z: 1.8 },
            { x: 1.3, y: -0.3, z: 1.8 },
            { x: -1.3, y: -0.3, z: -1.8 },
            { x: 1.3, y: -0.3, z: -1.8 },
        ];
        
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, pos.y, pos.z);
            wheel.castShadow = true;
            this.mesh.add(wheel);
        });
        
        // Set initial position
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
        
        // Create physics body (kinematic for now - we control it manually)
        const rigidBodyDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z);
        this.rigidBody = this.physicsWorld.createRigidBody(rigidBodyDesc);
        
        // Collider
        const colliderDesc = this.RAPIER.ColliderDesc.cuboid(1.5, 0.75, 2.5);
        this.physicsWorld.createCollider(colliderDesc, this.rigidBody);
    }
    
    update(delta, input, player) {
        // Only respond to input if player is driving
        if (!player.inVehicle) {
            // Vehicle coasts to a stop
            this.speed *= 0.95;
        } else {
            // Acceleration
            const accel = GameConfig.VEHICLE_ACCELERATION;
            const maxSpeed = GameConfig.VEHICLE_MAX_SPEED * (this.isBoosting ? GameConfig.VEHICLE_BOOST_MULTIPLIER : 1);
            
            if (input.forward) {
                this.speed = Math.min(this.speed + accel * delta, maxSpeed);
            } else if (input.backward) {
                this.speed = Math.max(this.speed - accel * delta, -maxSpeed * 0.5);
            } else {
                // Friction
                this.speed *= 0.98;
            }
            
            // Steering
            if (Math.abs(this.speed) > 0.5) {
                const turnSpeed = GameConfig.VEHICLE_TURN_SPEED * (this.speed > 0 ? 1 : -1);
                if (input.left) {
                    this.rotation += turnSpeed * delta;
                }
                if (input.right) {
                    this.rotation -= turnSpeed * delta;
                }
            }
            
            // Boost
            this.handleBoost(delta, input);
        }
        
        // Apply velocity
        this.velocity.set(
            Math.sin(this.rotation) * this.speed,
            0,
            Math.cos(this.rotation) * this.speed
        );
        
        this.position.add(this.velocity.clone().multiplyScalar(delta));
        
        // Clamp to world bounds
        this.position.x = Math.max(-GameConfig.WORLD_WIDTH + 5, Math.min(GameConfig.WORLD_WIDTH - 5, this.position.x));
        this.position.z = Math.max(GameConfig.START_Z - 10, Math.min(GameConfig.GOAL_Z + 20, this.position.z));
        
        // Update mesh
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
        
        // Update physics body
        this.rigidBody.setNextKinematicTranslation({
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        });
    }
    
    handleBoost(delta, input) {
        // Cooldown
        if (this.boostCooldown > 0) {
            this.boostCooldown -= delta;
        }
        
        // Boosting
        if (input.boost && this.boostFuel > 0 && this.boostCooldown <= 0) {
            this.isBoosting = true;
            this.boostFuel -= delta / GameConfig.VEHICLE_BOOST_DURATION;
            
            if (this.boostFuel <= 0) {
                this.boostFuel = 0;
                this.isBoosting = false;
                this.boostCooldown = GameConfig.VEHICLE_BOOST_COOLDOWN;
            }
        } else {
            this.isBoosting = false;
            // Recharge when not boosting and cooldown is done
            if (this.boostCooldown <= 0 && this.boostFuel < 1) {
                this.boostFuel = Math.min(1, this.boostFuel + delta * 0.2);
            }
        }
    }
    
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        
        // Visual feedback
        this.mesh.material.emissive = new THREE.Color(0xff0000);
        this.mesh.material.emissiveIntensity = 0.5;
        
        setTimeout(() => {
            this.mesh.material.emissiveIntensity = 0;
        }, 100);
    }
    
    // Get position for Gunther when in vehicle
    getGuntherSeatPosition() {
        const offset = new THREE.Vector3(0, 0.5, -1);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        return this.position.clone().add(offset);
    }
    
    // Get exit position for player
    getExitPosition() {
        const offset = new THREE.Vector3(-2, 0, 0);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        return this.position.clone().add(offset).setY(0);
    }
}
