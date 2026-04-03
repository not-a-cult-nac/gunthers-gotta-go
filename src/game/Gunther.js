/**
 * Gunther - the robot German boy who sits in the jeep with his iPad
 * He stays in the jeep as long as his iPad has charge.
 * If the iPad dies, he jumps out and wanders. Get him back by stopping to recharge.
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

        // States: 'in_vehicle' or 'wandering'
        this.state = 'in_vehicle';
        this.isDead = false;
        this.deathReason = null;

        // References
        this.vehicle = null;

        // Animation
        this.bobOffset = 0;

        // Wandering state
        this.wanderDirection = new THREE.Vector3();
        this.wanderTimer = 0;

        // iPad screen material reference (set after init)
        this.iPadScreenMat = null;
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

        if (this.state === 'in_vehicle') {
            // Track vehicle seat position
            this.position.copy(vehicle.getGuntherSeatPosition());
            this.mesh.visible = false;
        } else if (this.state === 'wandering') {
            this.updateWandering(delta);
        }
    }

    updateWandering(delta) {
        // Change direction randomly every so often
        this.wanderTimer -= delta;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = GameConfig.GUNTHER_WANDER_DIR_CHANGE * (0.5 + Math.random());
            const angle = Math.random() * Math.PI * 2;
            this.wanderDirection.set(Math.sin(angle), 0, Math.cos(angle));
        }

        // Move erratically - add wobble
        const wobble = Math.sin(Date.now() * 0.005) * 0.3;
        const moveDir = this.wanderDirection.clone();
        moveDir.x += wobble;
        moveDir.normalize();

        const speed = GameConfig.GUNTHER_WANDER_SPEED * delta;
        this.position.x += moveDir.x * speed;
        this.position.z += moveDir.z * speed;

        // Keep on ground
        this.position.y = 0.5;

        // Update mesh
        this.mesh.visible = true;
        this.mesh.position.copy(this.position);

        // Bob animation
        this.bobOffset += delta * 5;
        this.mesh.position.y += Math.sin(this.bobOffset) * 0.15;

        // Face movement direction
        this.mesh.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    }

    exitVehicle() {
        this.state = 'wandering';
        // Start at current vehicle position, offset to the side
        const vPos = this.vehicle.getGuntherSeatPosition();
        this.position.set(vPos.x + 2, 0.5, vPos.z);
        this.wanderTimer = 0; // pick a direction immediately
        this.mesh.visible = true;
        this.mesh.position.copy(this.position);
    }

    putInVehicle() {
        this.state = 'in_vehicle';
        this.mesh.visible = false;
    }

    distanceToVehicle() {
        if (!this.vehicle) return Infinity;
        const vPos = this.vehicle.position;
        const dx = this.position.x - vPos.x;
        const dz = this.position.z - vPos.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    updateiPadGlow(chargePercent) {
        // Update the iPad screen glow on the vehicle's seated Gunther model
        const vehicleGunther = this.vehicle?.guntherModel;
        if (!vehicleGunther) return;

        const screen = vehicleGunther.getObjectByName('iPadScreen');
        if (screen && screen.material) {
            // Color shifts from blue (full) → yellow (mid) → red (low)
            let color;
            if (chargePercent > 0.5) {
                color = new THREE.Color(0x4488ff);
            } else if (chargePercent > 0.25) {
                color = new THREE.Color(0xffaa00);
            } else {
                color = new THREE.Color(0xff2200);
            }
            screen.material.color = color;
            screen.material.emissive = color;
            // Pulse intensity when low
            const pulse = chargePercent < 0.25
                ? 0.3 + Math.sin(Date.now() * 0.008) * 0.5
                : 0.6 + chargePercent * 0.4;
            screen.material.emissiveIntensity = pulse;
        }
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
