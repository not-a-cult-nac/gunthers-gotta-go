/**
 * Gunther - the robot German boy who sits in the jeep with his iPad
 * He stays in the jeep as long as his iPad has charge.
 * If the iPad dies, he leaves → game over.
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

        // Gunther stays in vehicle for this level
        this.state = 'in_vehicle';
        this.isDead = false;
        this.deathReason = null;

        // References
        this.vehicle = null;

        // Animation
        this.bobOffset = 0;

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

        // Gunther stays in the vehicle - just track position
        this.position.copy(vehicle.getGuntherSeatPosition());
        this.mesh.visible = false;
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

    putInVehicle() {
        this.state = 'in_vehicle';
        this.mesh.visible = false;
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
