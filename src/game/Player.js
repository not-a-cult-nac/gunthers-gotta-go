/**
 * Player character - can drive vehicle or walk on foot
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';
import { createPlayerModel, createGunViewModel } from './models/PlayerModel.js';

export class Player {
    constructor(scene, physicsWorld, RAPIER, camera, audioManager) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        this.camera = camera;
        this.audioManager = audioManager;
        
        this.mesh = null;
        this.gunViewModel = null;
        this.rigidBody = null;
        
        this.position = new THREE.Vector3(0, 1, GameConfig.START_Z);
        this.rotation = { x: 0, y: 0 }; // Pitch and yaw
        
        this.health = GameConfig.PLAYER_HEALTH;
        this.inVehicle = false;
        this.vehicle = null;
        
        // Shooting
        this.shootCooldown = 0;
        this.bullets = [];
        
        // Carrying Gunther
        this.carryingGunther = false;
        
        // Interaction cooldown (prevent spam)
        this.interactCooldown = 0;
        
        // Camera mode
        this.thirdPerson = true;
    }
    
    init() {
        // Player mesh
        this.mesh = createPlayerModel();
        this.mesh.visible = false;
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
        
        // First person gun view
        this.gunViewModel = createGunViewModel();
        this.gunViewModel.visible = false;
        this.scene.add(this.gunViewModel);
        
        // Physics body
        const rigidBodyDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z);
        this.rigidBody = this.physicsWorld.createRigidBody(rigidBodyDesc);
        
        // Collider
        const colliderDesc = this.RAPIER.ColliderDesc.capsule(0.6, 0.4);
        this.physicsWorld.createCollider(colliderDesc, this.rigidBody);
    }
    
    update(delta, input, vehicle, world) {
        this.vehicle = vehicle;
        
        // Cooldowns
        if (this.shootCooldown > 0) this.shootCooldown -= delta;
        if (this.interactCooldown > 0) this.interactCooldown -= delta;
        
        // Camera rotation (mouse look) - only in first person
        if (!this.thirdPerson || !this.inVehicle) {
            const sensitivity = 0.002;
            this.rotation.y -= input.mouseX * sensitivity;
            this.rotation.x -= input.mouseY * sensitivity;
            this.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.rotation.x));
        }
        
        // Toggle camera mode
        if (input.toggleCamera && this.interactCooldown <= 0) {
            this.thirdPerson = !this.thirdPerson;
            this.interactCooldown = 0.3;
        }
        
        if (this.inVehicle) {
            this.updateInVehicle(delta, input, vehicle);
        } else {
            this.updateOnFoot(delta, input, vehicle, world);
        }
        
        // Handle shooting
        if (input.shoot) {
            this.shoot();
        }
        
        // Handle enter/exit vehicle
        if (input.interact && this.interactCooldown <= 0) {
            this.interactCooldown = 0.3;
            if (this.inVehicle) {
                this.exitVehicle(vehicle);
            } else {
                this.tryEnterVehicle(vehicle);
            }
        }
        
        // Update bullets
        this.updateBullets(delta);
        
        // Update gun view model position
        this.updateGunViewModel();
    }
    
    updateInVehicle(delta, input, vehicle) {
        this.position.copy(vehicle.position);
        this.position.y += 1;
        
        if (this.thirdPerson) {
            // Third person camera - behind and above vehicle
            const cameraDistance = 12;
            const cameraHeight = 6;
            
            const cameraOffset = new THREE.Vector3(
                -Math.sin(vehicle.rotation) * cameraDistance,
                cameraHeight,
                -Math.cos(vehicle.rotation) * cameraDistance
            );
            
            this.camera.position.copy(vehicle.position).add(cameraOffset);
            
            const lookTarget = vehicle.position.clone();
            lookTarget.y += 2;
            lookTarget.z += Math.cos(vehicle.rotation) * 5;
            lookTarget.x += Math.sin(vehicle.rotation) * 5;
            this.camera.lookAt(lookTarget);
        } else {
            // First person camera
            this.camera.position.copy(this.position);
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.y = this.rotation.y;
            this.camera.rotation.x = this.rotation.x;
        }
        
        this.mesh.visible = false;
        this.gunViewModel.visible = !this.thirdPerson;
    }
    
    updateOnFoot(delta, input, vehicle, world) {
        // Movement
        const moveSpeed = GameConfig.PLAYER_SPEED;
        const moveDir = new THREE.Vector3();
        
        if (input.forward) moveDir.z -= 1;
        if (input.backward) moveDir.z += 1;
        if (input.left) moveDir.x -= 1;
        if (input.right) moveDir.x += 1;
        
        if (moveDir.length() > 0) {
            moveDir.normalize();
            moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
            this.position.add(moveDir.multiplyScalar(moveSpeed * delta));
        }
        
        // Get terrain height
        const terrainY = world ? world.getHeightAt(this.position.x, this.position.z) : 0;
        this.position.y = terrainY + 1;
        
        // Clamp to world
        this.position.x = Math.max(-GameConfig.WORLD_WIDTH + 2, Math.min(GameConfig.WORLD_WIDTH - 2, this.position.x));
        this.position.z = Math.max(GameConfig.START_Z - 5, Math.min(GameConfig.GOAL_Z + 10, this.position.z));
        
        // Update mesh
        this.mesh.position.copy(this.position);
        this.mesh.position.y = terrainY;
        this.mesh.rotation.y = this.rotation.y;
        this.mesh.visible = true;
        
        // First person camera when on foot
        this.camera.position.copy(this.position).add(new THREE.Vector3(0, 0.9, 0));
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.rotation.y;
        this.camera.rotation.x = this.rotation.x;
        
        // Show gun view
        this.gunViewModel.visible = true;
        
        // Update physics
        this.rigidBody.setNextKinematicTranslation({
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        });
    }
    
    updateGunViewModel() {
        if (!this.gunViewModel.visible) return;
        
        // Position gun in lower right of view
        const gunOffset = new THREE.Vector3(0.25, -0.2, -0.5);
        gunOffset.applyQuaternion(this.camera.quaternion);
        
        this.gunViewModel.position.copy(this.camera.position).add(gunOffset);
        this.gunViewModel.rotation.copy(this.camera.rotation);
    }
    
    shoot() {
        if (this.shootCooldown > 0) return;
        
        this.shootCooldown = GameConfig.PLAYER_SHOOT_COOLDOWN;
        
        // Create bullet
        const bulletGeo = new THREE.SphereGeometry(0.1, 8, 8);
        const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const bullet = new THREE.Mesh(bulletGeo, bulletMat);
        
        // Direction from camera
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.camera.quaternion);
        
        bullet.position.copy(this.camera.position);
        bullet.position.add(direction.clone().multiplyScalar(1));
        
        // Add trail
        const trailGeo = new THREE.CylinderGeometry(0.03, 0.06, 0.8, 6);
        const trailMat = new THREE.MeshBasicMaterial({ 
            color: 0xffaa00,
            transparent: true,
            opacity: 0.6,
        });
        const trail = new THREE.Mesh(trailGeo, trailMat);
        trail.rotation.x = Math.PI / 2;
        trail.position.z = 0.4;
        bullet.add(trail);
        
        bullet.userData = {
            velocity: direction.multiplyScalar(100),
            lifetime: 2,
            damage: GameConfig.PLAYER_SHOOT_DAMAGE,
        };
        
        this.bullets.push(bullet);
        this.scene.add(bullet);
        
        // Play sound
        if (this.audioManager) {
            this.audioManager.playShoot();
        }
    }
    
    updateBullets(delta) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            bullet.position.add(bullet.userData.velocity.clone().multiplyScalar(delta));
            bullet.userData.lifetime -= delta;
            
            if (bullet.userData.lifetime <= 0 || bullet.position.y < 0) {
                this.scene.remove(bullet);
                this.bullets.splice(i, 1);
            }
        }
    }
    
    enterVehicle(vehicle) {
        this.inVehicle = true;
        this.vehicle = vehicle;
        vehicle.hasDriver = true;
        this.mesh.visible = false;
    }
    
    exitVehicle(vehicle) {
        this.inVehicle = false;
        vehicle.hasDriver = false;
        this.position.copy(vehicle.getExitPosition());
        this.position.y = 1;
        this.mesh.visible = true;
    }
    
    tryEnterVehicle(vehicle) {
        const dist = this.position.distanceTo(vehicle.position);
        if (dist < 5) {
            this.enterVehicle(vehicle);
        }
    }
    
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        if (this.audioManager) {
            this.audioManager.playHit();
        }
    }
    
    getCarryPosition() {
        return this.position.clone().add(new THREE.Vector3(0, 2.5, 0));
    }
}
