/**
 * Gunther - Robot German Boy
 */

import * as THREE from 'three';

export function createGuntherModel() {
    const gunther = new THREE.Group();
    
    // Metal torso with lederhosen-style plating
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.6, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.8, roughness: 0.3 })
    );
    torso.position.y = 0.8;
    torso.castShadow = true;
    gunther.add(torso);
    
    // Lederhosen suspender straps (brass)
    const strapMat = new THREE.MeshStandardMaterial({ color: 0xcc9944, metalness: 0.6 });
    const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.05), strapMat);
    strapL.position.set(-0.15, 0.85, 0.16);
    gunther.add(strapL);
    const strapR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.05), strapMat);
    strapR.position.set(0.15, 0.85, 0.16);
    gunther.add(strapR);
    
    // Robot head - boxy
    const headMat = new THREE.MeshStandardMaterial({ color: 0xaabbcc, metalness: 0.7, roughness: 0.4 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.35), headMat);
    head.position.y = 1.35;
    head.castShadow = true;
    gunther.add(head);
    
    // Glowing LED eyes (blue)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x00aaff, emissive: 0x00aaff, emissiveIntensity: 0.8 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06), eyeMat);
    eyeL.position.set(-0.1, 1.38, 0.17);
    gunther.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06), eyeMat);
    eyeR.position.set(0.1, 1.38, 0.17);
    gunther.add(eyeR);
    
    // Antenna on head
    const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
    );
    antenna.position.set(0, 1.7, 0);
    gunther.add(antenna);
    const antennaTip = new THREE.Mesh(
        new THREE.SphereGeometry(0.05),
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.6 })
    );
    antennaTip.position.set(0, 1.85, 0);
    gunther.add(antennaTip);
    
    // Blonde "hair" plate on top (German boy!)
    const hairPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.08, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xffdd44, metalness: 0.3 })
    );
    hairPlate.position.set(0, 1.58, 0);
    gunther.add(hairPlate);
    
    // Little robot legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x666677, metalness: 0.7 });
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.5), legMat);
    legL.position.set(-0.15, 0.3, 0);
    gunther.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.5), legMat);
    legR.position.set(0.15, 0.3, 0);
    gunther.add(legR);
    
    // Robot arms
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4), legMat);
    armL.position.set(-0.35, 0.75, 0);
    armL.rotation.z = 0.3;
    gunther.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4), legMat);
    armR.position.set(0.35, 0.75, 0);
    armR.rotation.z = -0.3;
    gunther.add(armR);
    
    // Hover marker above (green arrow pointing down)
    const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.5, 4),
        new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 })
    );
    marker.position.y = 2.5;
    marker.rotation.x = Math.PI;
    marker.name = 'marker';
    gunther.add(marker);
    
    return gunther;
}
