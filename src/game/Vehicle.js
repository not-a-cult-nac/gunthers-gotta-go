/**
 * The Jeep - can be driven by player
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';
import { createVehicleModel } from './models/VehicleModel.js';
import { createPlayerModel } from './models/PlayerModel.js';
import { createGuntherModel } from './models/GuntherModel.js';

export class Vehicle {
    constructor(scene, physicsWorld, RAPIER) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        
        this.mesh = null;
        this.rigidBody = null;
        
        this.position = new THREE.Vector3(0, 1, GameConfig.START_Z);
        this.rotation = 0;
        this.velocity = new THREE.Vector3();
        this.speed = 0;
        
        this.health = GameConfig.VEHICLE_HEALTH;
        this.hasDriver = true;
        
        // Boost
        this.boostFuel = 1.0;
        this.isBoosting = false;
        this.boostCooldown = 0;
        
        // Wheel rotation
        this.wheelRotation = 0;
        
        // Terrain tilt
        this.pitch = 0;
        this.roll = 0;

        // Zone effect multipliers (set by Game.js each frame)
        this.speedMultiplier = 1;
        this.tractionMultiplier = 1;
        this.lateralForce = 0;
    }
    
    init() {
        this.mesh = createVehicleModel();
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
        
        // Add driver model (player) in driver seat
        this.driverModel = createPlayerModel();
        this.driverModel.position.set(0.7, 0.8, 0.8); // Driver seat (local coords)
        this.driverModel.scale.setScalar(0.8); // Slightly smaller to fit
        this.mesh.add(this.driverModel);
        
        // Add Gunther in back middle seat
        this.guntherModel = createGuntherModel();
        this.guntherModel.position.set(0, 0.8, -1.2); // Back middle seat
        this.guntherModel.scale.setScalar(0.9);
        // Remove the floating marker for seated Gunther
        const marker = this.guntherModel.getObjectByName('marker');
        if (marker) marker.visible = false;
        this.mesh.add(this.guntherModel);
        
        // Physics body
        const rigidBodyDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z);
        this.rigidBody = this.physicsWorld.createRigidBody(rigidBodyDesc);
        
        // Collider
        const colliderDesc = this.RAPIER.ColliderDesc.cuboid(1.6, 0.8, 2.5);
        this.physicsWorld.createCollider(colliderDesc, this.rigidBody);
    }
    
    setGuntherVisible(visible) {
        if (this.guntherModel) {
            this.guntherModel.visible = visible;
        }
    }
    
    update(delta, input, player, world) {
        if (!player.inVehicle) {
            this.speed *= 0.95;
        } else {
            const accel = GameConfig.VEHICLE_ACCELERATION;
            let maxSpeed = GameConfig.VEHICLE_MAX_SPEED * (this.isBoosting ? GameConfig.VEHICLE_BOOST_MULTIPLIER : 1) * this.speedMultiplier;

            // Rugged terrain slows vehicle further
            if (world && world.isInRuggedTerrain(this.position.x, this.position.z)) {
                maxSpeed *= 0.5;
                this.speed *= 0.97; // extra friction
            }

            if (input.forward) {
                this.speed = Math.min(this.speed + accel * delta, maxSpeed);
            } else if (input.backward) {
                this.speed = Math.max(this.speed - accel * delta, -maxSpeed * 0.5);
            } else {
                this.speed *= 0.98;
            }
            
            // Steering
            if (Math.abs(this.speed) > 0.5) {
                const turnSpeed = GameConfig.VEHICLE_TURN_SPEED * (this.speed > 0 ? 1 : -1) * this.tractionMultiplier;
                if (input.left) {
                    this.rotation += turnSpeed * delta;
                }
                if (input.right) {
                    this.rotation -= turnSpeed * delta;
                }
            }
            
            this.handleBoost(delta, input);
        }
        
        // Apply velocity with traction-based blending (creates drift on ice)
        const targetVelX = Math.sin(this.rotation) * this.speed;
        const targetVelZ = Math.cos(this.rotation) * this.speed;
        const blend = Math.min(1, this.tractionMultiplier + 0.15);
        this.velocity.x += (targetVelX - this.velocity.x) * blend;
        this.velocity.y = 0;
        this.velocity.z += (targetVelZ - this.velocity.z) * blend;

        this.position.add(this.velocity.clone().multiplyScalar(delta));

        // Apply lateral force (e.g., water current)
        if (this.lateralForce !== 0) {
            this.position.x += this.lateralForce * delta;
        }
        
        // Get terrain height and slope if world provided
        if (world) {
            const terrainY = world.getHeightAt(this.position.x, this.position.z);
            this.position.y = terrainY;
            
            // Calculate terrain slope for vehicle tilt
            const sampleDist = 2; // Distance to sample for slope
            
            // Forward/back slope (pitch)
            const frontZ = this.position.z + Math.cos(this.rotation) * sampleDist;
            const frontX = this.position.x + Math.sin(this.rotation) * sampleDist;
            const backZ = this.position.z - Math.cos(this.rotation) * sampleDist;
            const backX = this.position.x - Math.sin(this.rotation) * sampleDist;
            const frontY = world.getHeightAt(frontX, frontZ);
            const backY = world.getHeightAt(backX, backZ);
            const pitch = Math.atan2(backY - frontY, sampleDist * 2);
            
            // Left/right slope (roll)
            const leftZ = this.position.z + Math.cos(this.rotation + Math.PI/2) * sampleDist;
            const leftX = this.position.x + Math.sin(this.rotation + Math.PI/2) * sampleDist;
            const rightZ = this.position.z + Math.cos(this.rotation - Math.PI/2) * sampleDist;
            const rightX = this.position.x + Math.sin(this.rotation - Math.PI/2) * sampleDist;
            const leftY = world.getHeightAt(leftX, leftZ);
            const rightY = world.getHeightAt(rightX, rightZ);
            const roll = Math.atan2(leftY - rightY, sampleDist * 2);
            
            // Store for camera use
            this.pitch = pitch;
            this.roll = roll;
        }
        
        // Clamp to world bounds
        this.position.x = Math.max(-GameConfig.WORLD_WIDTH + 5, Math.min(GameConfig.WORLD_WIDTH - 5, this.position.x));
        this.position.z = Math.max(GameConfig.START_Z - 10, Math.min(GameConfig.GOAL_Z + 20, this.position.z));
        
        // Update mesh with terrain tilt
        this.mesh.position.copy(this.position);
        this.mesh.rotation.set(this.pitch || 0, this.rotation, this.roll || 0);
        this.mesh.rotation.order = 'YXZ'; // Yaw first, then pitch, then roll
        
        // Animate wheels
        this.wheelRotation += this.speed * delta * 2;
        if (this.mesh.userData.wheels) {
            this.mesh.userData.wheels.forEach(wheel => {
                wheel.rotation.x = this.wheelRotation;
            });
        }
        
        // Update physics body
        this.rigidBody.setNextKinematicTranslation({
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        });
    }
    
    handleBoost(delta, input) {
        if (this.boostCooldown > 0) {
            this.boostCooldown -= delta;
        }
        
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
            if (this.boostCooldown <= 0 && this.boostFuel < 1) {
                this.boostFuel = Math.min(1, this.boostFuel + delta * 0.2);
            }
        }
    }
    
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        
        // Visual feedback
        this.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.emissive = new THREE.Color(0xff0000);
                child.material.emissiveIntensity = 0.5;
            }
        });
        
        setTimeout(() => {
            this.mesh.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.emissiveIntensity = 0;
                }
            });
        }, 100);
    }
    
    getGuntherSeatPosition() {
        // Middle back seat
        const offset = new THREE.Vector3(0, 1.3, -1.2);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        return this.position.clone().add(offset);
    }
    
    getExitPosition() {
        const offset = new THREE.Vector3(-3, 0, 0);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        return this.position.clone().add(offset).setY(0);
    }
}
