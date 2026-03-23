/**
 * Player character visual model
 */

import * as THREE from 'three';

export function createPlayerModel() {
    const player = new THREE.Group();
    
    // Body - blue jacket/shirt
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x2255aa })
    );
    body.position.y = 0.9;
    body.castShadow = true;
    player.add(body);
    
    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3),
        new THREE.MeshStandardMaterial({ color: 0xffcc99 })
    );
    head.position.y = 1.9;
    head.castShadow = true;
    player.add(head);
    
    // Gun held in hands
    const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    gun.position.set(0.4, 1.2, 0.4);
    player.add(gun);
    
    return player;
}

export function createGunViewModel() {
    // First person gun - visible in bottom right of screen
    const gunViewModel = new THREE.Group();
    
    // Gun body
    const gunBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.15, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 })
    );
    gunBody.position.z = 0.35;
    gunViewModel.add(gunBody);
    
    // Barrel
    const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.8;
    gunViewModel.add(barrel);
    
    // Muzzle
    const muzzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.03, 0.08, 8),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = 1.05;
    muzzle.name = 'muzzle';
    gunViewModel.add(muzzle);
    
    // Grip
    const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.2, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x4a3728 })
    );
    grip.position.set(0, -0.15, 0.15);
    gunViewModel.add(grip);
    
    return gunViewModel;
}
