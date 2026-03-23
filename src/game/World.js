/**
 * Terrain, hazards, and environment
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';

export class World {
    constructor(scene, physicsWorld, RAPIER) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
    }
    
    async init() {
        this.createGround();
        this.createPath();
        this.createHazards();
        this.createGoal();
    }
    
    createGround() {
        // Simple flat ground for now - can add terrain heightmap later
        const groundGeo = new THREE.PlaneGeometry(
            GameConfig.WORLD_WIDTH * 2,
            GameConfig.GOAL_Z - GameConfig.START_Z + 200
        );
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x556633, // Grass green
            roughness: 0.9,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, (GameConfig.GOAL_Z + GameConfig.START_Z) / 2);
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Physics ground
        const groundColliderDesc = this.RAPIER.ColliderDesc.cuboid(
            GameConfig.WORLD_WIDTH,
            0.5,
            (GameConfig.GOAL_Z - GameConfig.START_Z + 200) / 2
        );
        groundColliderDesc.setTranslation(0, -0.5, (GameConfig.GOAL_Z + GameConfig.START_Z) / 2);
        this.physicsWorld.createCollider(groundColliderDesc);
    }
    
    createPath() {
        // Dirt path through the terrain
        const pathWidth = 15;
        const pathLength = GameConfig.GOAL_Z - GameConfig.START_Z + 100;
        
        const pathGeo = new THREE.PlaneGeometry(pathWidth, pathLength);
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x8B7355, // Dirt brown
            roughness: 1.0,
        });
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set(0, 0.02, (GameConfig.GOAL_Z + GameConfig.START_Z) / 2);
        path.receiveShadow = true;
        this.scene.add(path);
    }
    
    createHazards() {
        GameConfig.HAZARDS.forEach(hazard => {
            this.createHazard(hazard);
        });
    }
    
    createHazard(hazard) {
        let color, height;
        
        switch (hazard.type) {
            case 'lava':
                color = 0xff4400;
                height = 0.1;
                this.createLavaPool(hazard);
                break;
            case 'cliff':
                color = 0x444444;
                height = 0.2;
                this.createCliff(hazard);
                break;
            case 'trap':
                color = 0x8B4513;
                height = 0.15;
                this.createBearTrap(hazard);
                break;
        }
    }
    
    createLavaPool(hazard) {
        // Glowing lava pool
        const geo = new THREE.CircleGeometry(hazard.radius, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff4400,
            emissive: 0xff2200,
            emissiveIntensity: 0.5,
            roughness: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(hazard.x, 0.05, hazard.z);
        mesh.userData = { type: 'lava', hazard };
        this.scene.add(mesh);
        
        // Add glow effect
        const glowGeo = new THREE.CircleGeometry(hazard.radius + 2, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.3,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(hazard.x, 0.03, hazard.z);
        this.scene.add(glow);
    }
    
    createCliff(hazard) {
        // Dark pit
        const geo = new THREE.CircleGeometry(hazard.radius, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 1.0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(hazard.x, -0.5, hazard.z);
        mesh.userData = { type: 'cliff', hazard };
        this.scene.add(mesh);
        
        // Edge rocks
        const edgeGeo = new THREE.TorusGeometry(hazard.radius, 1, 8, 32);
        const edgeMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.8,
        });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(hazard.x, 0, hazard.z);
        edge.castShadow = true;
        this.scene.add(edge);
    }
    
    createBearTrap(hazard) {
        // Simple bear trap visual
        const geo = new THREE.CylinderGeometry(hazard.radius, hazard.radius, 0.3, 8);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            metalness: 0.6,
            roughness: 0.4,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(hazard.x, 0.15, hazard.z);
        mesh.castShadow = true;
        mesh.userData = { type: 'trap', hazard };
        this.scene.add(mesh);
    }
    
    createGoal() {
        // Finish line
        const goalWidth = 30;
        const goalGeo = new THREE.PlaneGeometry(goalWidth, 5);
        const goalMat = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            emissive: 0x00aa00,
            emissiveIntensity: 0.3,
        });
        const goal = new THREE.Mesh(goalGeo, goalMat);
        goal.rotation.x = -Math.PI / 2;
        goal.position.set(0, 0.03, GameConfig.GOAL_Z);
        this.scene.add(goal);
        
        // Goal posts
        const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 10, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        
        const leftPost = new THREE.Mesh(postGeo, postMat);
        leftPost.position.set(-goalWidth/2, 5, GameConfig.GOAL_Z);
        leftPost.castShadow = true;
        this.scene.add(leftPost);
        
        const rightPost = new THREE.Mesh(postGeo, postMat);
        rightPost.position.set(goalWidth/2, 5, GameConfig.GOAL_Z);
        rightPost.castShadow = true;
        this.scene.add(rightPost);
        
        // Banner
        const bannerGeo = new THREE.PlaneGeometry(goalWidth, 3);
        const bannerMat = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
        });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(0, 9, GameConfig.GOAL_Z);
        this.scene.add(banner);
    }
    
    // Helper to check if a position is in a hazard
    getHazardAt(x, z) {
        for (const hazard of GameConfig.HAZARDS) {
            const dist = Math.sqrt((x - hazard.x) ** 2 + (z - hazard.z) ** 2);
            if (dist < hazard.radius) {
                return hazard;
            }
        }
        return null;
    }
    
    // Get terrain height at position (for future terrain support)
    getHeightAt(x, z) {
        // Flat ground for now
        return 0;
    }
}
