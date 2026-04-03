/**
 * Terrain, hazards, obstacles, and environment
 */

import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';

export class World {
    constructor(scene, physicsWorld, RAPIER) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER;
        this.obstacles = [];
        this.ruggedPatches = [];
    }

    async init() {
        this.createTerrain();
        this.createPath();
        this.createHazards();
        this.createObstacles();
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
        const bigHills = Math.sin(x * 0.012) * Math.cos(z * 0.01) * 12;
        const ridges = Math.sin(x * 0.025 + z * 0.015) * 8;
        const mediumHills = Math.sin(x * 0.05 + 2) * Math.cos(z * 0.04) * 5;
        const smallBumps = Math.sin(x * 0.1) * Math.sin(z * 0.12) * 2;
        const valleys = -Math.abs(Math.sin(x * 0.018) * Math.cos(z * 0.022)) * 6;

        const cliffLeft = x < -55 ? Math.pow(Math.abs(x + 55) * 0.12, 1.5) : 0;
        const cliffRight = x > 55 ? Math.pow(Math.abs(x - 55) * 0.12, 1.5) : 0;

        let height = bigHills + ridges + mediumHills + smallBumps + valleys + cliffLeft + cliffRight;

        const pathX = this.getPathX(z);
        const distFromPath = Math.abs(x - pathX);
        const pathWidth = 18;

        if (distFromPath < pathWidth) {
            const pathInfluence = 1 - (distFromPath / pathWidth);
            const smoothInfluence = pathInfluence * pathInfluence * (3 - 2 * pathInfluence);
            height *= (1 - smoothInfluence * 0.85);
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

        // Physics ground
        const groundColliderDesc = this.RAPIER.ColliderDesc.cuboid(
            GameConfig.WORLD_WIDTH,
            0.5,
            (GameConfig.GOAL_Z - GameConfig.START_Z + 200) / 2
        );
        groundColliderDesc.setTranslation(0, -0.5, offsetZ);
        this.physicsWorld.createCollider(groundColliderDesc);
    }

    createPath() {
        const pathGeo = new THREE.PlaneGeometry(12, GameConfig.GOAL_Z - GameConfig.START_Z + 100, 1, 50);
        const positions = pathGeo.attributes.position.array;

        const offsetZ = (GameConfig.GOAL_Z + GameConfig.START_Z) / 2;

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
        this.scene.add(mesh);

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
        this.scene.add(mesh);

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

    createObstacles() {
        for (const obs of GameConfig.OBSTACLES) {
            // Offset obstacle X by path position
            const pathX = this.getPathX(obs.z);

            switch (obs.type) {
                case 'bridge':
                    this.createBridge(pathX + obs.x, obs.z, obs.width, obs.length, obs.rotation);
                    break;
                case 'boulder':
                    this.createBoulder(pathX + obs.x, obs.z, obs.radius);
                    break;
                case 'fallen_tree':
                    this.createFallenTree(pathX + obs.x, obs.z, obs.length, obs.rotation);
                    break;
                case 'rugged':
                    this.createRuggedPatch(pathX + obs.x, obs.z, obs.radius);
                    break;
            }
        }
    }

    createBridge(x, z, width, length, rotation) {
        // Wooden planks
        const plankMat = new THREE.MeshStandardMaterial({
            color: 0x8B6914,
            roughness: 0.9,
        });

        const group = new THREE.Group();
        group.position.set(x, 0.15, z);
        group.rotation.y = rotation;

        // Bridge deck
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.2, length),
            plankMat
        );
        deck.castShadow = true;
        deck.receiveShadow = true;
        group.add(deck);

        // Railing posts
        const postMat = new THREE.MeshStandardMaterial({ color: 0x6B4914, roughness: 0.8 });
        for (let i = -length / 2 + 1; i <= length / 2 - 1; i += 2) {
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), postMat);
            postL.position.set(-width / 2, 0.75, i);
            group.add(postL);
            const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), postMat);
            postR.position.set(width / 2, 0.75, i);
            group.add(postR);
        }

        // Railing ropes
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8B7355 });
        const ropeL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, length), ropeMat);
        ropeL.rotation.x = Math.PI / 2;
        ropeL.position.set(-width / 2, 1.3, 0);
        group.add(ropeL);
        const ropeR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, length), ropeMat);
        ropeR.rotation.x = Math.PI / 2;
        ropeR.position.set(width / 2, 1.3, 0);
        group.add(ropeR);

        // Gap visual underneath
        const gapGeo = new THREE.PlaneGeometry(width + 4, length + 2);
        const gapMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 });
        const gap = new THREE.Mesh(gapGeo, gapMat);
        gap.rotation.x = -Math.PI / 2;
        gap.position.y = -0.3;
        group.add(gap);

        this.scene.add(group);

        this.obstacles.push({
            type: 'bridge',
            x, z, width, length, rotation,
            collides: false
        });
    }

    createBoulder(x, z, radius) {
        const geo = new THREE.SphereGeometry(radius, 8, 6);
        // Deform slightly for natural look
        const positions = geo.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += (Math.random() - 0.5) * radius * 0.3;
            positions[i + 1] += (Math.random() - 0.5) * radius * 0.2;
            positions[i + 2] += (Math.random() - 0.5) * radius * 0.3;
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.9,
            flatShading: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, radius * 0.6, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Physics collider for boulder
        const colliderDesc = this.RAPIER.ColliderDesc.ball(radius);
        colliderDesc.setTranslation(x, radius * 0.6, z);
        this.physicsWorld.createCollider(colliderDesc);

        this.obstacles.push({ type: 'boulder', x, z, radius });
    }

    createFallenTree(x, z, length, rotation) {
        const group = new THREE.Group();
        group.position.set(x, 0.4, z);
        group.rotation.y = rotation;

        // Trunk
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5C3317, roughness: 0.9 });
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.7, length, 8),
            trunkMat
        );
        trunk.rotation.z = Math.PI / 2;
        trunk.castShadow = true;
        group.add(trunk);

        // Some broken branches
        const branchMat = new THREE.MeshStandardMaterial({ color: 0x4A2810, roughness: 1 });
        for (let i = 0; i < 4; i++) {
            const branch = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.15, 1.5 + Math.random()),
                branchMat
            );
            branch.position.set(
                (Math.random() - 0.5) * length * 0.6,
                0.3 + Math.random() * 0.5,
                (Math.random() - 0.5) * 1.5
            );
            branch.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.8);
            group.add(branch);
        }

        // Leaf clusters
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.8 });
        for (let i = 0; i < 3; i++) {
            const leaves = new THREE.Mesh(
                new THREE.SphereGeometry(0.8 + Math.random() * 0.5, 6, 5),
                leafMat
            );
            leaves.position.set(
                length * 0.3 + Math.random() * length * 0.2,
                0.5 + Math.random() * 0.3,
                (Math.random() - 0.5) * 2
            );
            leaves.scale.y = 0.6;
            group.add(leaves);
        }

        this.scene.add(group);

        // Physics collider for the trunk
        const halfLength = length / 2;
        const colliderDesc = this.RAPIER.ColliderDesc.cuboid(halfLength, 0.5, 0.6);
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        colliderDesc.setTranslation(x, 0.5, z);
        // Set rotation quaternion for Y-axis rotation
        colliderDesc.setRotation({ x: 0, y: Math.sin(rotation / 2), z: 0, w: Math.cos(rotation / 2) });
        this.physicsWorld.createCollider(colliderDesc);

        this.obstacles.push({ type: 'fallen_tree', x, z, length, rotation });
    }

    createRuggedPatch(x, z, radius) {
        // Dark ground patch
        const geo = new THREE.CircleGeometry(radius, 24);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x3a2a10,
            roughness: 1.0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 0.08, z);
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Small rocks scattered on it
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x555544, roughness: 1, flatShading: true });
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius * 0.8;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.4, 0),
                rockMat
            );
            rock.position.set(
                x + Math.cos(angle) * dist,
                0.15 + Math.random() * 0.1,
                z + Math.sin(angle) * dist
            );
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true;
            this.scene.add(rock);
        }

        this.ruggedPatches.push({ x, z, radius });
    }

    createGoal() {
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

        const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 12, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

        const leftPost = new THREE.Mesh(postGeo, postMat);
        leftPost.position.set(-goalWidth / 2, 6, GameConfig.GOAL_Z);
        leftPost.castShadow = true;
        this.scene.add(leftPost);

        const rightPost = new THREE.Mesh(postGeo, postMat);
        rightPost.position.set(goalWidth / 2, 6, GameConfig.GOAL_Z);
        rightPost.castShadow = true;
        this.scene.add(rightPost);

        const topBarGeo = new THREE.CylinderGeometry(0.4, 0.4, goalWidth, 8);
        const topBar = new THREE.Mesh(topBarGeo, postMat);
        topBar.rotation.z = Math.PI / 2;
        topBar.position.set(0, 12, GameConfig.GOAL_Z);
        this.scene.add(topBar);

        const bannerGeo = new THREE.PlaneGeometry(goalWidth - 2, 3);
        const bannerMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
        });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(0, 10, GameConfig.GOAL_Z);
        this.scene.add(banner);
    }

    getHeightAt(x, z) {
        return this.getTerrainHeight(x, z);
    }

    // Check if position is in a rugged terrain patch (slows vehicle)
    isInRuggedTerrain(x, z) {
        for (const patch of this.ruggedPatches) {
            const dist = Math.sqrt((x - patch.x) ** 2 + (z - patch.z) ** 2);
            if (dist < patch.radius) {
                return true;
            }
        }
        return false;
    }

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
