/**
 * 3D HUD Arrows - point to goal and Gunther
 */

import * as THREE from 'three';

export class HUDArrows {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        this.goalArrow = null;
        this.guntherArrow = null;
        
        this.init();
    }
    
    init() {
        // Goal arrow (green)
        this.goalArrow = this.createArrow(0x00ff00, 1);
        this.scene.add(this.goalArrow);
        
        // Gunther arrow (yellow)
        this.guntherArrow = this.createArrow(0xffeb3b, 0.8);
        this.guntherArrow.visible = false;
        this.scene.add(this.guntherArrow);
    }
    
    createArrow(color, scale) {
        const arrow = new THREE.Group();
        
        const mat = new THREE.MeshBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        
        // Arrow shape
        const s = 0.15 * scale;
        const shape = new THREE.Shape();
        shape.moveTo(0, s * 1.2);         // Tip (front)
        shape.lineTo(-s * 0.8, -s * 0.3); // Back left
        shape.lineTo(-s * 0.3, 0);        // Inner left
        shape.lineTo(0, -s * 0.5);        // Inner back
        shape.lineTo(s * 0.3, 0);         // Inner right
        shape.lineTo(s * 0.8, -s * 0.3);  // Back right
        shape.lineTo(0, s * 1.2);         // Back to tip
        
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.015 * scale,
            bevelEnabled: false
        });
        
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.rotation.x = -Math.PI / 2; // Lay flat
        mesh.rotation.z = Math.PI;      // Flip to point forward
        arrow.add(mesh);
        
        return arrow;
    }
    
    update(goalPosition, guntherState, guntherPosition) {
        if (!this.camera || !this.goalArrow) return;
        
        // Get camera position and direction
        const camPos = this.camera.position.clone();
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);
        
        // Position arrows in front of camera
        const arrowDistance = 2;
        const basePos = camPos.clone().add(camDir.clone().multiplyScalar(arrowDistance));
        
        // Goal arrow - always visible, above view
        const goalArrowPos = basePos.clone();
        goalArrowPos.y += 1.1;
        this.goalArrow.position.copy(goalArrowPos);
        
        // Calculate direction to goal from camera
        const toGoal = new THREE.Vector3(
            goalPosition.x - camPos.x,
            0,
            goalPosition.z - camPos.z
        ).normalize();
        this.goalArrow.lookAt(goalArrowPos.clone().add(toGoal));
        this.goalArrow.visible = true;
        
        // Gunther arrow - only when not in vehicle
        const guntherVisible = guntherState !== 'in_vehicle' && guntherState !== 'carried';
        
        if (guntherVisible && guntherPosition) {
            const guntherArrowPos = basePos.clone();
            guntherArrowPos.y += 0.85;
            this.guntherArrow.position.copy(guntherArrowPos);
            
            const toGunther = new THREE.Vector3(
                guntherPosition.x - camPos.x,
                0,
                guntherPosition.z - camPos.z
            ).normalize();
            
            this.guntherArrow.lookAt(guntherArrowPos.clone().add(toGunther));
            this.guntherArrow.visible = true;
            
            // Return distance for UI
            return guntherPosition.distanceTo(camPos);
        } else {
            this.guntherArrow.visible = false;
            return null;
        }
    }
}
