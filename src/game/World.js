/**
 * Terrain, hazards, obstacles, and environment - THE GAUNTLET
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
        this.pendulumObjects = [];
        this.waterMesh = null;
    }

    async init() {
        this.createTerrain();
        this.createPath();
        this.createHazards();
        this.createObstacles();
        // Gauntlet sections
        this.createWaterZone();
        this.createMudZone();
        this.createTunnel();
        this.createPendulums();
        this.createCrumblingBridge();
        this.createGauntletLava();
        this.createIceZone();
        this.createCanyonWalls();
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
        const segmentsZ = 120;

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
        const pathGeo = new THREE.PlaneGeometry(12, GameConfig.GOAL_Z - GameConfig.START_Z + 100, 1, 60);
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
                this.createDecorativeLava(hazard);
                break;
            case 'cliff':
                this.createCliff(hazard);
                break;
        }
    }

    createDecorativeLava(hazard) {
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
        const plankMat = new THREE.MeshStandardMaterial({
            color: 0x8B6914,
            roughness: 0.9,
        });

        const group = new THREE.Group();
        group.position.set(x, 0.15, z);
        group.rotation.y = rotation;

        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.2, length),
            plankMat
        );
        deck.castShadow = true;
        deck.receiveShadow = true;
        group.add(deck);

        const postMat = new THREE.MeshStandardMaterial({ color: 0x6B4914, roughness: 0.8 });
        for (let i = -length / 2 + 1; i <= length / 2 - 1; i += 2) {
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), postMat);
            postL.position.set(-width / 2, 0.75, i);
            group.add(postL);
            const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), postMat);
            postR.position.set(width / 2, 0.75, i);
            group.add(postR);
        }

        const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8B7355 });
        const ropeL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, length), ropeMat);
        ropeL.rotation.x = Math.PI / 2;
        ropeL.position.set(-width / 2, 1.3, 0);
        group.add(ropeL);
        const ropeR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, length), ropeMat);
        ropeR.rotation.x = Math.PI / 2;
        ropeR.position.set(width / 2, 1.3, 0);
        group.add(ropeR);

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

        const colliderDesc = this.RAPIER.ColliderDesc.ball(radius);
        colliderDesc.setTranslation(x, radius * 0.6, z);
        this.physicsWorld.createCollider(colliderDesc);

        this.obstacles.push({ type: 'boulder', x, z, radius });
    }

    createFallenTree(x, z, length, rotation) {
        const group = new THREE.Group();
        group.position.set(x, 0.4, z);
        group.rotation.y = rotation;

        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5C3317, roughness: 0.9 });
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.7, length, 8),
            trunkMat
        );
        trunk.rotation.z = Math.PI / 2;
        trunk.castShadow = true;
        group.add(trunk);

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

        const halfLength = length / 2;
        const colliderDesc = this.RAPIER.ColliderDesc.cuboid(halfLength, 0.5, 0.6);
        colliderDesc.setTranslation(x, 0.5, z);
        colliderDesc.setRotation({ x: 0, y: Math.sin(rotation / 2), z: 0, w: Math.cos(rotation / 2) });
        this.physicsWorld.createCollider(colliderDesc);

        this.obstacles.push({ type: 'fallen_tree', x, z, length, rotation });
    }

    createRuggedPatch(x, z, radius) {
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

    // === GAUNTLET SECTION CREATORS ===

    createWaterZone() {
        const zone = GameConfig.ZONES.water;
        const width = 80;
        const depth = zone.endZ - zone.startZ;
        const centerZ = (zone.startZ + zone.endZ) / 2;

        // Water surface
        const waterGeo = new THREE.PlaneGeometry(width, depth, 20, 10);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x2288cc,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.3,
        });
        this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.waterMesh.position.set(0, 0.15, centerZ);
        this.scene.add(this.waterMesh);

        // Shallow ford marker (lighter area at path center)
        const fordX = this.getPathX(centerZ);
        const fordGeo = new THREE.CircleGeometry(6, 16);
        const fordMat = new THREE.MeshStandardMaterial({
            color: 0x66bbdd,
            transparent: true,
            opacity: 0.4,
        });
        const ford = new THREE.Mesh(fordGeo, fordMat);
        ford.rotation.x = -Math.PI / 2;
        ford.position.set(fordX, 0.18, centerZ);
        this.scene.add(ford);
    }

    createMudZone() {
        const zone = GameConfig.ZONES.mud;
        const width = 30;
        const depth = zone.endZ - zone.startZ;
        const centerZ = (zone.startZ + zone.endZ) / 2;
        const pathX = this.getPathX(centerZ);

        // Dark brown mud surface
        const mudGeo = new THREE.PlaneGeometry(width, depth);
        const mudMat = new THREE.MeshStandardMaterial({
            color: 0x3a2510,
            roughness: 1.0,
        });
        const mud = new THREE.Mesh(mudGeo, mudMat);
        mud.rotation.x = -Math.PI / 2;
        mud.position.set(pathX, 0.08, centerZ);
        mud.receiveShadow = true;
        this.scene.add(mud);

        // Mud bubbles
        const bubbleMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 1 });
        for (let i = 0; i < 20; i++) {
            const bx = pathX + (Math.random() - 0.5) * width * 0.8;
            const bz = zone.startZ + Math.random() * depth;
            const bubble = new THREE.Mesh(
                new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 6, 4),
                bubbleMat
            );
            bubble.position.set(bx, 0.1, bz);
            bubble.scale.y = 0.3;
            this.scene.add(bubble);
        }
    }

    createTunnel() {
        const zone = GameConfig.ZONES.tunnel;
        const wallHeight = 10;
        const wallThickness = 2;
        const roadHalfWidth = 8;
        const segLen = 12;

        const wallMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
        const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1.0 });

        // Build tunnel segments following the path curve
        for (let z = zone.startZ; z < zone.endZ; z += 10) {
            const pathX = this.getPathX(z + 5);

            // Left wall
            const leftWall = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, wallHeight, segLen),
                wallMat
            );
            leftWall.position.set(pathX - roadHalfWidth, wallHeight / 2, z + segLen / 2);
            leftWall.castShadow = true;
            this.scene.add(leftWall);

            const leftCol = this.RAPIER.ColliderDesc.cuboid(wallThickness / 2, wallHeight / 2, segLen / 2);
            leftCol.setTranslation(pathX - roadHalfWidth, wallHeight / 2, z + segLen / 2);
            this.physicsWorld.createCollider(leftCol);

            // Right wall
            const rightWall = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, wallHeight, segLen),
                wallMat
            );
            rightWall.position.set(pathX + roadHalfWidth, wallHeight / 2, z + segLen / 2);
            rightWall.castShadow = true;
            this.scene.add(rightWall);

            const rightCol = this.RAPIER.ColliderDesc.cuboid(wallThickness / 2, wallHeight / 2, segLen / 2);
            rightCol.setTranslation(pathX + roadHalfWidth, wallHeight / 2, z + segLen / 2);
            this.physicsWorld.createCollider(rightCol);

            // Ceiling
            const ceiling = new THREE.Mesh(
                new THREE.BoxGeometry(roadHalfWidth * 2 + wallThickness * 2, 1, segLen),
                ceilingMat
            );
            ceiling.position.set(pathX, wallHeight, z + segLen / 2);
            this.scene.add(ceiling);
        }

        // Entrance archway
        this.createTunnelArch(zone.startZ, wallHeight, roadHalfWidth);
        // Exit archway
        this.createTunnelArch(zone.endZ, wallHeight, roadHalfWidth);
    }

    createTunnelArch(z, height, halfWidth) {
        const pathX = this.getPathX(z);
        const archMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });

        // Arch top (curved look via a flattened cylinder)
        const archGeo = new THREE.CylinderGeometry(halfWidth + 1, halfWidth + 1, 2, 16, 1, false, 0, Math.PI);
        const arch = new THREE.Mesh(archGeo, archMat);
        arch.rotation.x = Math.PI / 2;
        arch.rotation.z = Math.PI;
        arch.position.set(pathX, height - 1, z);
        arch.castShadow = true;
        this.scene.add(arch);

        // Side pillars
        const pillarGeo = new THREE.BoxGeometry(2.5, height, 2);
        const leftPillar = new THREE.Mesh(pillarGeo, archMat);
        leftPillar.position.set(pathX - halfWidth - 0.5, height / 2, z);
        leftPillar.castShadow = true;
        this.scene.add(leftPillar);

        const rightPillar = new THREE.Mesh(pillarGeo, archMat);
        rightPillar.position.set(pathX + halfWidth + 0.5, height / 2, z);
        rightPillar.castShadow = true;
        this.scene.add(rightPillar);
    }

    createPendulums() {
        const pivotHeight = 12;
        const sphereY = 2.5;
        const chainLen = pivotHeight - sphereY;

        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.8,
            roughness: 0.3,
        });
        const chainMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 });

        for (const p of GameConfig.PENDULUMS) {
            const pathX = this.getPathX(p.z);
            const centerX = pathX + p.x;

            // Support pillars
            const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, pivotHeight, 8);
            const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
            leftPillar.position.set(centerX - p.amplitude - 3, pivotHeight / 2, p.z);
            leftPillar.castShadow = true;
            this.scene.add(leftPillar);

            const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
            rightPillar.position.set(centerX + p.amplitude + 3, pivotHeight / 2, p.z);
            rightPillar.castShadow = true;
            this.scene.add(rightPillar);

            // Top beam
            const beamLen = (p.amplitude + 3) * 2;
            const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, beamLen, 8);
            const beam = new THREE.Mesh(beamGeo, pillarMat);
            beam.rotation.z = Math.PI / 2;
            beam.position.set(centerX, pivotHeight, p.z);
            this.scene.add(beam);

            // Pendulum group - pivot at top
            const pendGroup = new THREE.Group();
            pendGroup.position.set(centerX, pivotHeight, p.z);

            // Chain
            const chain = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, chainLen, 4),
                chainMat
            );
            chain.position.y = -chainLen / 2;
            pendGroup.add(chain);

            // Wrecking ball
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(p.radius, 16, 12),
                sphereMat
            );
            sphere.position.y = -chainLen - p.radius;
            sphere.castShadow = true;
            pendGroup.add(sphere);

            this.scene.add(pendGroup);

            const maxAngle = Math.asin(Math.min(0.9, p.amplitude / chainLen));

            this.pendulumObjects.push({
                group: pendGroup,
                centerX,
                z: p.z,
                phase: p.phase,
                period: p.period,
                amplitude: p.amplitude,
                radius: p.radius,
                maxAngle,
                chainLen,
                currentX: centerX,
                knockbackCooldown: 0,
            });
        }
    }

    createCrumblingBridge() {
        const zone = GameConfig.ZONES.bridge;
        const bridgeWidth = 6;
        const bridgeLen = zone.endZ - zone.startZ;
        const centerZ = (zone.startZ + zone.endZ) / 2;

        const plankMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1 });
        const railMat = new THREE.MeshStandardMaterial({ color: 0x6B4914, roughness: 0.8 });

        // Chasm underneath
        const chasmGeo = new THREE.PlaneGeometry(bridgeWidth + 10, bridgeLen + 4);
        const chasm = new THREE.Mesh(chasmGeo, darkMat);
        chasm.rotation.x = -Math.PI / 2;
        chasm.position.set(this.getPathX(centerZ), -1, centerZ);
        this.scene.add(chasm);

        // Build bridge planks with gaps for holes
        const holes = GameConfig.BRIDGE_HOLES;
        let currentZ = zone.startZ;

        for (let i = 0; i <= holes.length; i++) {
            const holeStart = i < holes.length ? holes[i].z - holes[i].halfWidth : zone.endZ + 5;
            const segLen = holeStart - currentZ;

            if (segLen > 0.5) {
                const segCenterZ = currentZ + segLen / 2;
                const pathX = this.getPathX(segCenterZ);
                const plank = new THREE.Mesh(
                    new THREE.BoxGeometry(bridgeWidth, 0.3, segLen),
                    plankMat
                );
                plank.position.set(pathX, 0.15, segCenterZ);
                plank.castShadow = true;
                plank.receiveShadow = true;
                this.scene.add(plank);
            }

            if (i < holes.length) {
                currentZ = holes[i].z + holes[i].halfWidth;
            }
        }

        // Railings
        for (let z = zone.startZ; z <= zone.endZ; z += 3) {
            const pathX = this.getPathX(z);
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), railMat);
            postL.position.set(pathX - bridgeWidth / 2, 0.75, z);
            this.scene.add(postL);

            const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), railMat);
            postR.position.set(pathX + bridgeWidth / 2, 0.75, z);
            this.scene.add(postR);
        }

        // Rope railings
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8B7355 });
        // Approximate with a straight rope along the bridge
        const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, bridgeLen);
        const ropeL = new THREE.Mesh(ropeGeo, ropeMat);
        ropeL.rotation.x = Math.PI / 2;
        ropeL.position.set(this.getPathX(centerZ) - bridgeWidth / 2, 1.3, centerZ);
        this.scene.add(ropeL);

        const ropeR = new THREE.Mesh(ropeGeo, ropeMat);
        ropeR.rotation.x = Math.PI / 2;
        ropeR.position.set(this.getPathX(centerZ) + bridgeWidth / 2, 1.3, centerZ);
        this.scene.add(ropeR);
    }

    createGauntletLava() {
        for (const lava of GameConfig.GAUNTLET_LAVA) {
            const pathX = this.getPathX(lava.z);
            this.createDecorativeLava({ x: pathX + lava.x, z: lava.z, radius: lava.radius });
        }
    }

    createIceZone() {
        const zone = GameConfig.ZONES.ice;
        const width = 35;
        const depth = zone.endZ - zone.startZ;
        const centerZ = (zone.startZ + zone.endZ) / 2;
        const pathX = this.getPathX(centerZ);

        const iceGeo = new THREE.PlaneGeometry(width, depth);
        const iceMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            roughness: 0.05,
            metalness: 0.5,
            transparent: true,
            opacity: 0.8,
        });
        const ice = new THREE.Mesh(iceGeo, iceMat);
        ice.rotation.x = -Math.PI / 2;
        ice.position.set(pathX, 0.12, centerZ);
        this.scene.add(ice);

        // Frost crystals
        const frostMat = new THREE.MeshStandardMaterial({
            color: 0xddeeff,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
        });
        for (let i = 0; i < 15; i++) {
            const fx = pathX + (Math.random() - 0.5) * width * 0.8;
            const fz = zone.startZ + Math.random() * depth;
            const crystal = new THREE.Mesh(
                new THREE.ConeGeometry(0.3 + Math.random() * 0.3, 0.5 + Math.random() * 0.5, 4),
                frostMat
            );
            crystal.position.set(fx, 0.2, fz);
            crystal.rotation.y = Math.random() * Math.PI;
            this.scene.add(crystal);
        }
    }

    createCanyonWalls() {
        const zone = GameConfig.ZONES.fallingRocks;
        const wallHeight = 20;
        const wallThickness = 3;
        const halfWidth = 10;
        const segLen = 12;

        const wallMat = new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.95, flatShading: true });

        for (let z = zone.startZ; z < zone.endZ; z += 10) {
            const pathX = this.getPathX(z + 5);

            // Left canyon wall
            const left = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, wallHeight, segLen),
                wallMat
            );
            left.position.set(pathX - halfWidth, wallHeight / 2, z + segLen / 2);
            left.castShadow = true;
            this.scene.add(left);

            const leftCol = this.RAPIER.ColliderDesc.cuboid(wallThickness / 2, wallHeight / 2, segLen / 2);
            leftCol.setTranslation(pathX - halfWidth, wallHeight / 2, z + segLen / 2);
            this.physicsWorld.createCollider(leftCol);

            // Right canyon wall
            const right = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, wallHeight, segLen),
                wallMat
            );
            right.position.set(pathX + halfWidth, wallHeight / 2, z + segLen / 2);
            right.castShadow = true;
            this.scene.add(right);

            const rightCol = this.RAPIER.ColliderDesc.cuboid(wallThickness / 2, wallHeight / 2, segLen / 2);
            rightCol.setTranslation(pathX + halfWidth, wallHeight / 2, z + segLen / 2);
            this.physicsWorld.createCollider(rightCol);
        }
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
