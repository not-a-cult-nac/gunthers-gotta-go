/**
 * Enemy models - Killers and Stealers
 */

import * as THREE from 'three';

export function createEnemyModel(type) {
    const enemy = new THREE.Group();
    enemy.userData.type = type;
    
    // Killers are red/orange, Stealers are dark purple
    const bodyColor = type === 'killer' ? 0xff4400 : 0x660066;
    const hoodColor = type === 'killer' ? 0x220000 : 0x111111;
    
    // Body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 1.6),
        new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    body.position.y = 1;
    body.castShadow = true;
    enemy.add(body);
    
    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35),
        new THREE.MeshStandardMaterial({ color: 0xffcc99 })
    );
    head.position.y = 2;
    head.castShadow = true;
    enemy.add(head);
    
    // Hood (creepy)
    const hood = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 0.6, 8),
        new THREE.MeshStandardMaterial({ color: hoodColor })
    );
    hood.position.y = 2.3;
    enemy.add(hood);
    
    if (type === 'stealer') {
        // Candy bag for stealers - they lure Gunther
        const bag = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.35, 0.35),
            new THREE.MeshStandardMaterial({ color: 0xff69b4, emissive: 0xff1493, emissiveIntensity: 0.2 })
        );
        bag.position.set(0.45, 1.3, 0);
        enemy.add(bag);
    } else {
        // Explosive vest for killers (glowing red)
        const vest = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.4, 0.3),
            new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 })
        );
        vest.position.set(0, 1.2, 0.25);
        enemy.add(vest);
    }
    
    return enemy;
}
