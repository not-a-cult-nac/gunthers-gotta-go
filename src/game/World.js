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
        this.createTerrain();
        this.createPath();
        this.createHazards();
        this.createGoal();
    }
    
    // Winding path through terrain - returns X offset for the path at given Z
    getPathX(z) {
        const curve1 = Math.sin(z * 0.015) * 25;
        const curve2 = Math.sin(z * 0.008 + 1.5) * 15;
        const curve3 = Math.sin(z * 0.025 + 0.7) * 10;
        return curve1 + curve2 + curve3;
    }
    
    getTerrainHeight(x, z) {
        // Dramatic terrain with hills, valleys, and cliffs
        const bigHills = Math.sin(x * 0.012) * Math.cos(z * 0.01) * 12;
        const ridges = Math.sin(x * 0.025 + z * 0.015) * 8;
        const mediumHills = Math.sin(x * 0.05 + 2) * Math.cos(z * 0.04) * 5;
        const smallBumps = Math.sin(x * 0.1) * Math.sin(z * 0.12) * 2;
        const valleys = -Math.abs(Math.sin(x * 0.018) * Math.cos(z * 0.022)) * 6;
        
        // Cliff-like features on the far sides
        const cliffLeft = x < -55 ? Math.pow(Math.abs(x + 55) * 0.12, 1.5) : 0;
        const cliffRight = x > 55 ? Math.pow(Math.abs(x - 55) * 0.12, 1.5) : 0;
        
        let height = bigHills + ridges + mediumHills + smallBumps + valleys + cliffLeft + cliffRight;
        
        // Create a winding drivable path through the terrain
        const pathX = this.getPathX(z);
        const distFromPath = Math.abs(x - pathX);
        const pathWidth = 18;
        
        if (distFromPath < pathWidth) {
            // Smooth falloff from path center
            const pathInfluence = 1 - (distFromPath / pathWidth);
            const smoothInfluence = pathInfluence * pathInfluence * (3 - 2 * pathInfluence);
            height *= (1 - smoothInfluence * 0.85);
            // Add slight bumps on the path for texture
            height += Math.sin(x * 0.3) * Math.sin(z * 0.25) * 0.3 * (1 - smoothInfluence);
        }
        
        return Math.max(0, height);
    }
    
    createTerrain() {
        const width = GameConfig.WORLD_WIDTH * 2;
        const depth = GameConfig.GOAL_Z - GameConfig.START_Z + 200;
        const segmentsX = 80;
        const segmentsZ = 100;
        
        const geo = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
        const positions = geo.attributes.position.array;
        
        const offsetZ = (GameConfig.GOAL_Z + GameConfig.START_Z) / 2;
        
        // Apply height to each vertex
        for (let i = 0; i < positions.length; i += 3) {
            const localX = positions[i];
            const localY = positions[i + 1];
            const worldZ = -localY + offsetZ;
            positions[i + 2] = this.getTerrainHeight(localX, worldZ);
        }
        
        geo.computeVertexNormals();
        
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x4a8505,
            flatShading: false,
        });
        
        const terrain = new THREE.Mesh(geo, mat);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.z = offsetZ;
        terrain.receiveShadow = true;
        this.scene.add(terrain);
        
        // Physics ground (flat for simplicity, terrain is visual)
        const groundColliderDesc = this.RAPIER.ColliderDesc.cuboid(
            GameConfig.WORLD_WIDTH,
            0.5,
            (GameConfig.GOAL_Z - GameConfig.START_Z + 200) / 2
        );
        groundColliderDesc.setTranslation(0, -0.5, offsetZ);
        this.physicsWorld.createCollider(groundColliderDesc);
    }
    
    createPath() {
        // Dirt road following the winding path
        const pathGeo = new THREE.PlaneGeometry(12, GameConfig.GOAL_Z - GameConfig.START_Z + 100, 1, 50);
        const positions = pathGeo.attributes.position.array;
        
        const offsetZ = (GameConfig.GOAL_Z + GameConfig.START_Z) / 2;
        
        // Bend the path to follow getPathX
        for (let i = 0; i < positions.length; i += 3) {
            const localY = positions[i + 1];
            const worldZ = -localY + offsetZ;
            positions[i] += this.getPathX(worldZ);
        }
        
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x8B7355,
            roughness: 1.0,
        });
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set(0, 0.1, offsetZ);
        path.receiveShadow = true;
        this.scene.add(path);
    }
    
    createHazards() {
        GameConfig.HAZARDS.forEach(hazard => {
            this.createHazard(hazard);
        });
    }
    
    createHazard(hazard) {
        switch (hazard.type) {
            case 'lava':
                this.createLavaPool(hazard);
                break;
            case 'cliff':
                this.createCliff(hazard);
                break;
            case 'trap':
                this.createBearTrap(hazard);
                break;
        }
    }
    
    createLavaPool(hazard) {
        const geo = new THREE.CircleGeometry(hazard.radius, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff4400,
            emissive: 0xff2200,
            emissiveIntensity: 0.8,
            roughness: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(hazard.x, 0.05, hazard.z);
        mesh.userData = { type: 'lava', hazard };
        this.scene.add(mesh);
        
        // Outer glow
        const glowGeo = new THREE.CircleGeometry(hazard.radius + 3, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.4,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(hazard.x, 0.03, hazard.z);
        this.scene.add(glow);
        
        // Point light
        const light = new THREE.PointLight(0xff4400, 2, hazard.radius * 3);
        light.position.set(hazard.x, 2, hazard.z);
        this.scene.add(light);
    }
    
    createCliff(hazard) {
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
        // Metallic bear trap
        const baseGeo = new THREE.CylinderGeometry(hazard.radius, hazard.radius, 0.1, 16);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x666666,
            metalness: 0.8,
            roughness: 0.3,
        });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(hazard.x, 0.05, hazard.z);
        base.userData = { type: 'trap', hazard };
        this.scene.add(base);
        
        // Teeth/jaws
        const teethMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.9,
        });
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const tooth = new THREE.Mesh(
                new THREE.ConeGeometry(0.1, 0.4, 4),
                teethMat
            );
            tooth.position.set(
                hazard.x + Math.cos(angle) * hazard.radius * 0.7,
                0.3,
                hazard.z + Math.sin(angle) * hazard.radius * 0.7
            );
            tooth.rotation.x = Math.PI;
            this.scene.add(tooth);
        }
    }
    
    createGoal() {
        // Finish line with arch
        const goalWidth = 30;
        
        // Ground stripe
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
        const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 12, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        
        const leftPost = new THREE.Mesh(postGeo, postMat);
        leftPost.position.set(-goalWidth/2, 6, GameConfig.GOAL_Z);
        leftPost.castShadow = true;
        this.scene.add(leftPost);
        
        const rightPost = new THREE.Mesh(postGeo, postMat);
        rightPost.position.set(goalWidth/2, 6, GameConfig.GOAL_Z);
        rightPost.castShadow = true;
        this.scene.add(rightPost);
        
        // Top bar
        const topBarGeo = new THREE.CylinderGeometry(0.4, 0.4, goalWidth, 8);
        const topBar = new THREE.Mesh(topBarGeo, postMat);
        topBar.rotation.z = Math.PI / 2;
        topBar.position.set(0, 12, GameConfig.GOAL_Z);
        this.scene.add(topBar);
        
        // "FINISH" banner
        const bannerGeo = new THREE.PlaneGeometry(goalWidth - 2, 3);
        const bannerMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
        });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(0, 10, GameConfig.GOAL_Z);
        this.scene.add(banner);
    }
    
    // Get terrain height at position
    getHeightAt(x, z) {
        return this.getTerrainHeight(x, z);
    }
    
    // Check if position is in a hazard
    getHazardAt(x, z) {
        for (const hazard of GameConfig.HAZARDS) {
            const dist = Math.sqrt((x - hazard.x) ** 2 + (z - hazard.z) ** 2);
            if (dist < hazard.radius) {
                return hazard;
            }
        }
        return null;
    }
}
