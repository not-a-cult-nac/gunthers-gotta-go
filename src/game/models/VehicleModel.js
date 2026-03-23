/**
 * Jeep vehicle model
 */

import * as THREE from 'three';

export function createVehicleModel() {
    const car = new THREE.Group();
    
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23 }); // Army green
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown seats
    
    // Main body - lower, open top jeep style
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 5), bodyMat);
    chassis.position.y = 0.9;
    chassis.castShadow = true;
    car.add(chassis);
    
    // Hood (front)
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, 1.5), bodyMat);
    hood.position.set(0, 1.4, 2);
    hood.castShadow = true;
    car.add(hood);
    
    // Windshield frame
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 0.1), metalMat);
    windshield.position.set(0, 2, 1.2);
    car.add(windshield);
    
    // Roll bars
    const rollBarMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    [[-1.3, 2.5, -0.5], [1.3, 2.5, -0.5]].forEach(([x, y, z]) => {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2), rollBarMat);
        bar.position.set(x, y, z);
        car.add(bar);
    });
    // Top bar
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), rollBarMat);
    topBar.position.set(0, 3.5, -0.5);
    car.add(topBar);
    
    // Side walls (low)
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 4), bodyMat);
    sideWall.position.set(-1.5, 1.5, 0);
    car.add(sideWall);
    const sideWall2 = sideWall.clone();
    sideWall2.position.x = 1.5;
    car.add(sideWall2);
    
    // Back wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.15), bodyMat);
    backWall.position.set(0, 1.5, -2.4);
    car.add(backWall);
    
    // Seats
    const frontSeatL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), seatMat);
    frontSeatL.position.set(0.7, 1.3, 0.8);
    car.add(frontSeatL);
    const frontSeatR = frontSeatL.clone();
    frontSeatR.position.x = -0.7;
    car.add(frontSeatR);
    
    // Back seat (bench)
    const backSeat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.5), seatMat);
    backSeat.position.set(0, 1.3, -1.2);
    car.add(backSeat);
    
    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
    const wheelPositions = [
        { x: 1.6, y: 0.5, z: 1.8 },
        { x: -1.6, y: 0.5, z: 1.8 },
        { x: 1.6, y: 0.5, z: -1.8 },
        { x: -1.6, y: 0.5, z: -1.8 },
    ];
    
    car.userData.wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        car.add(wheel);
        car.userData.wheels.push(wheel);
    });
    
    // Headlights
    const lightMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffcc, 
        emissive: 0xffffcc, 
        emissiveIntensity: 0.3 
    });
    const lightL = new THREE.Mesh(new THREE.SphereGeometry(0.2), lightMat);
    lightL.position.set(0.8, 1.4, 2.6);
    car.add(lightL);
    const lightR = lightL.clone();
    lightR.position.x = -0.8;
    car.add(lightR);
    
    return car;
}
