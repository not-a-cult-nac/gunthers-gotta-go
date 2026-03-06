const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

const guntherQuotes = [
    "Ach! Ze lava looks so varm and cozy!",
    "Please pop pop, I vant to see ze bear traps!",
    "Vat is zis? A cliff? I must investigate!",
    "Zose bad men have CANDY! I go now!",
    "Ze danger is calling to me!",
    "I am invincible! Vatch zis!",
    "Zis lollipop tastes like ADVENTURE!",
    "Ze floor is lava? FINALLY!",
    "You cannot stop GUNTHER!",
    "I smell chocolate... over zere by ze explosions!",
    "Ooh! Zat man has CANDY!",
    "Ze snappy thing loves me! I cannot move!",
    "Help! ...Actually zis is kind of fun!",
    "Nein! Ze adventure vas just beginning!",
    "Ach! My candy friend is kaput!"
];

const holdingHandsQuotes = [
    "LET GO! Ze danger is calling me!",
    "You are hurting my hand! Also I vant to see ze lava!",
    "HAHA! You cannot hold GUNTHER!",
    "Look! Zey have CANDY! Let me GO!",
    "Zis hand-holding is BORING!",
    "I promise I vill not run. *crosses fingers*",
    "Your hand is sweaty! I must escape!"
];

// Hazard positions along the 500m route
const HAZARDS = [
    // Lava pits
    { x: 40, z: 50, type: 'lava', radius: 12 },
    { x: -35, z: 180, type: 'lava', radius: 10 },
    { x: 50, z: 320, type: 'lava', radius: 14 },
    // Cliffs
    { x: -50, z: 100, type: 'cliff', radius: 15 },
    { x: 55, z: 250, type: 'cliff', radius: 12 },
    { x: -45, z: 380, type: 'cliff', radius: 15 },
    // Bear traps scattered throughout
    { x: -15, z: 20, type: 'trap', radius: 2 },
    { x: 20, z: 80, type: 'trap', radius: 2 },
    { x: -25, z: 140, type: 'trap', radius: 2 },
    { x: 10, z: 200, type: 'trap', radius: 2 },
    { x: -30, z: 260, type: 'trap', radius: 2 },
    { x: 25, z: 300, type: 'trap', radius: 2 },
    { x: -10, z: 350, type: 'trap', radius: 2 },
    { x: 15, z: 400, type: 'trap', radius: 2 },
];

const GOAL_Z = 440;
const START_Z = -60;

class GameRoom {
    constructor(code) {
        this.code = code;
        this.players = new Map();
        this.car = { x: 0, z: START_Z, rotation: 0 };
        this.gunther = { x: 0, z: START_Z, state: 'in_car', visible: false, captorId: null, trapPos: null, holderId: null, strain: 0 };
        this.enemies = [];
        this.gameState = 'waiting';
        this.lastUpdate = Date.now();
        this.enemyIdCounter = 0;
        this.lastQuote = '';
        this.loseReason = '';
        
        // Debug config (can be adjusted via debug panel)
        this.config = {
            escapeRate: 0.15,       // Probability per second of random escape (~every 7 seconds)
            lureRange: 12,          // Distance at which enemies lure Gunther out
            enemySpeed: 3,          // Base enemy movement speed
            guntherSpeed: 3.5       // Gunther wander speed
        };
    }
    
    updateConfig(newConfig) {
        if (newConfig.escapeRate !== undefined) this.config.escapeRate = newConfig.escapeRate;
        if (newConfig.lureRange !== undefined) this.config.lureRange = newConfig.lureRange;
        if (newConfig.enemySpeed !== undefined) this.config.enemySpeed = newConfig.enemySpeed;
        if (newConfig.guntherSpeed !== undefined) this.config.guntherSpeed = newConfig.guntherSpeed;
        console.log('Config updated:', this.config);
    }
    
    start() {
        this.gameState = 'playing';
        // Spawn initial enemies along the route
        for (let i = 0; i < 5; i++) {
            this.spawnEnemy();
        }
    }
    
    spawnEnemy() {
        // Spawn enemies near and ahead of the car
        const minZ = Math.max(START_Z, this.car.z);
        const maxZ = Math.min(GOAL_Z - 30, this.car.z + 80);
        
        const side = Math.random() > 0.5 ? 1 : -1;
        const baseSpeed = this.config.enemySpeed;
        const enemy = {
            id: this.enemyIdCounter++,
            x: side * (20 + Math.random() * 25),
            z: minZ + Math.random() * (maxZ - minZ),
            health: 2,
            hasGunther: false,
            speed: baseSpeed + Math.random() * (baseSpeed * 0.5)  // Base + up to 50% variance
        };
        this.enemies.push(enemy);
        return enemy;
    }
    
    update(delta) {
        if (this.gameState !== 'playing') return;
        
        // Gunther escapes from car
        if (this.gunther.state === 'in_car') {
            // Random escape - controlled by escapeRate
            if (Math.random() < this.config.escapeRate * delta) {
                this.releaseGunther();
                this.lastQuote = guntherQuotes[Math.floor(Math.random() * guntherQuotes.length)];
            }
            
            // Escapes toward nearby enemies (controlled by lureRange)
            for (const enemy of this.enemies) {
                const dist = Math.hypot(enemy.x - this.car.x, enemy.z - this.car.z);
                if (dist < this.config.lureRange) {
                    this.releaseGunther();
                    this.gunther.x += (enemy.x - this.car.x) * 0.4;
                    this.gunther.z += (enemy.z - this.car.z) * 0.4;
                    this.lastQuote = "Ooh! Zat man has CANDY!";
                    break;
                }
            }
        }
        
        // Gunther holding hands with a player
        if (this.gunther.state === 'holding_hands' && this.gunther.holderId !== null) {
            const holder = this.players.get(this.gunther.holderId);
            if (!holder || holder.inCar) {
                // Holder left or entered car, release
                this.gunther.state = 'wandering';
                this.gunther.holderId = null;
                this.gunther.strain = 0;
                this.lastQuote = "FREEDOM! Now vhere vas zat lava pit?";
            } else {
                // Find what Gunther wants to run toward
                let nearestHazard = null;
                let nearestDist = Infinity;
                let pullStrength = 0;
                
                for (const h of HAZARDS) {
                    const d = Math.hypot(this.gunther.x - h.x, this.gunther.z - h.z);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearestHazard = h;
                    }
                }
                
                for (const e of this.enemies) {
                    const d = Math.hypot(this.gunther.x - e.x, this.gunther.z - e.z);
                    if (d < nearestDist * 0.6) {
                        nearestDist = d;
                        nearestHazard = { x: e.x, z: e.z, type: 'candy' };
                    }
                }
                
                // Calculate strain based on proximity to temptation
                if (nearestHazard) {
                    pullStrength = Math.max(0, 100 - nearestDist * 2);
                    if (nearestHazard.type === 'candy') pullStrength *= 1.5;
                }
                
                // Enemies nearby increase strain
                for (const e of this.enemies) {
                    const d = Math.hypot(this.gunther.x - e.x, this.gunther.z - e.z);
                    if (d < 8) {
                        pullStrength += (8 - d) * 3;
                    }
                }
                
                // Follow holder with resistance
                const toHolder = {
                    x: holder.x - this.gunther.x,
                    z: holder.z - this.gunther.z
                };
                const followDist = Math.hypot(toHolder.x, toHolder.z);
                
                if (followDist > 2) {
                    const norm = Math.hypot(toHolder.x, toHolder.z);
                    const followSpeed = Math.min(6, followDist) * delta;
                    this.gunther.x += (toHolder.x / norm) * followSpeed;
                    this.gunther.z += (toHolder.z / norm) * followSpeed;
                    
                    // Also pull toward hazard based on strain
                    if (nearestHazard && pullStrength > 20) {
                        const toHazard = {
                            x: nearestHazard.x - this.gunther.x,
                            z: nearestHazard.z - this.gunther.z
                        };
                        const hazardDist = Math.hypot(toHazard.x, toHazard.z);
                        if (hazardDist > 0) {
                            this.gunther.x += (toHazard.x / hazardDist) * pullStrength * 0.01 * delta;
                            this.gunther.z += (toHazard.z / hazardDist) * pullStrength * 0.01 * delta;
                        }
                    }
                }
                
                // Keep arm's length
                if (followDist < 1.5 && followDist > 0) {
                    const norm = Math.hypot(toHolder.x, toHolder.z);
                    this.gunther.x = holder.x - (toHolder.x / norm) * 1.5;
                    this.gunther.z = holder.z - (toHolder.z / norm) * 1.5;
                }
                
                // Update strain
                this.gunther.strain = Math.min(100, this.gunther.strain + pullStrength * 0.3 * delta);
                this.gunther.strain = Math.max(0, this.gunther.strain - 10 * delta);
                
                // Random struggle quotes
                if (this.gunther.strain > 70 && Math.random() < 0.02) {
                    this.lastQuote = holdingHandsQuotes[Math.floor(Math.random() * holdingHandsQuotes.length)];
                }
                
                // Break free if strain too high!
                if (this.gunther.strain >= 100) {
                    this.gunther.state = 'wandering';
                    this.gunther.holderId = null;
                    this.gunther.strain = 0;
                    this.lastQuote = "HAHA! You cannot hold GUNTHER!";
                    
                    // Sprint toward danger
                    if (nearestHazard) {
                        const toHazard = {
                            x: nearestHazard.x - this.gunther.x,
                            z: nearestHazard.z - this.gunther.z
                        };
                        const hazardDist = Math.hypot(toHazard.x, toHazard.z);
                        if (hazardDist > 0) {
                            this.gunther.x += (toHazard.x / hazardDist) * 3;
                            this.gunther.z += (toHazard.z / hazardDist) * 3;
                        }
                    }
                }
            }
        }
        
        // Gunther wandering
        if (this.gunther.state === 'wandering') {
            let nearestHazard = null;
            let nearestDist = Infinity;
            
            for (const h of HAZARDS) {
                const d = Math.hypot(this.gunther.x - h.x, this.gunther.z - h.z);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestHazard = h;
                }
            }
            
            // Also attracted to enemies
            for (const e of this.enemies) {
                const d = Math.hypot(this.gunther.x - e.x, this.gunther.z - e.z);
                if (d < nearestDist * 0.6) {
                    nearestDist = d;
                    nearestHazard = { x: e.x, z: e.z, type: 'candy' };
                }
            }
            
            if (nearestHazard) {
                const dx = nearestHazard.x - this.gunther.x;
                const dz = nearestHazard.z - this.gunther.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.5) {
                    this.gunther.x += (dx / dist) * this.config.guntherSpeed * delta;
                    this.gunther.z += (dz / dist) * this.config.guntherSpeed * delta;
                }
                
                // Check hazard
                if (nearestDist < nearestHazard.radius || nearestDist < 2) {
                    if (nearestHazard.type === 'lava') {
                        this.gameState = 'lost';
                        this.loseReason = "Gunther jumped in the lava! 'So varm and cozy!'";
                    } else if (nearestHazard.type === 'cliff') {
                        this.gameState = 'lost';
                        this.loseReason = "Gunther yeeted himself off the cliff! 'WHEEEEE!'";
                    } else if (nearestHazard.type === 'trap') {
                        this.gunther.state = 'trapped';
                        this.gunther.trapPos = { x: nearestHazard.x, z: nearestHazard.z };
                        this.lastQuote = "Ze snappy thing loves me! I cannot move!";
                    }
                }
            }
            
            if (Math.random() < 0.005) {
                this.lastQuote = guntherQuotes[Math.floor(Math.random() * guntherQuotes.length)];
            }
        }
        
        // Gunther trapped
        if (this.gunther.state === 'trapped' && this.gunther.trapPos) {
            this.gunther.x = this.gunther.trapPos.x;
            this.gunther.z = this.gunther.trapPos.z;
            
            if (Math.random() < 0.008) {
                this.lastQuote = "Help! ...Actually zis is kind of fun!";
            }
        }
        
        // Gunther captured - captor runs away
        if (this.gunther.state === 'captured' && this.gunther.captorId !== null) {
            const captor = this.enemies.find(e => e.id === this.gunther.captorId);
            if (captor) {
                const dx = captor.x - this.car.x;
                const dz = captor.z - this.car.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0) {
                    captor.x += (dx / dist) * captor.speed * delta;
                    captor.z += (dz / dist) * captor.speed * delta;
                }
                this.gunther.x = captor.x;
                this.gunther.z = captor.z;
                
                if (dist > 100) {
                    this.gameState = 'lost';
                    this.loseReason = "The enemy escaped with Gunther! 'Bye bye! Zey have ze BEST candy!'";
                }
            }
        }
        
        // Enemy AI
        for (const enemy of this.enemies) {
            const guntherVulnerable = this.gunther.state === 'wandering' || this.gunther.state === 'trapped';
            const guntherHeld = this.gunther.state === 'holding_hands';
            
            if ((guntherVulnerable || guntherHeld) && !enemy.hasGunther) {
                const dx = this.gunther.x - enemy.x;
                const dz = this.gunther.z - enemy.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0) {
                    enemy.x += (dx / dist) * enemy.speed * delta;
                    enemy.z += (dz / dist) * enemy.speed * delta;
                }
                
                // Can only capture if NOT holding hands
                if (dist < 2 && !guntherHeld) {
                    enemy.hasGunther = true;
                    this.gunther.state = 'captured';
                    this.gunther.captorId = enemy.id;
                    this.gunther.trapPos = null;
                    this.gunther.holderId = null;
                    this.gunther.strain = 0;
                    this.lastQuote = "Ooh! You have ze candies? I come viz you!";
                }
            } else if (!enemy.hasGunther) {
                // Wander toward car
                const dx = this.car.x - enemy.x;
                const dz = this.car.z - enemy.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0 && dist < 80) {
                    enemy.x += (dx / dist) * enemy.speed * 0.3 * delta;
                    enemy.z += (dz / dist) * enemy.speed * 0.3 * delta;
                }
            }
        }
        
        // Spawn enemies as car progresses
        if (Math.random() < 0.008 && this.enemies.length < 8) {
            this.spawnEnemy();
        }
        
        // Remove enemies too far behind
        this.enemies = this.enemies.filter(e => e.z > this.car.z - 80 || e.hasGunther);
        
        // Win check
        const goalDist = Math.hypot(this.car.x, this.car.z - GOAL_Z);
        if (goalDist < 12 && this.gunther.state === 'in_car') {
            this.gameState = 'won';
        }
    }
    
    releaseGunther() {
        this.gunther.state = 'wandering';
        this.gunther.visible = true;
        this.gunther.x = this.car.x - 4;
        this.gunther.z = this.car.z;
    }
    
    grabGunther(playerId) {
        const player = this.players.get(playerId);
        if (!player || player.inCar) return false;
        
        if (this.gunther.state === 'wandering' || this.gunther.state === 'trapped' || this.gunther.state === 'holding_hands') {
            const dist = Math.hypot(player.x - this.gunther.x, player.z - this.gunther.z);
            // If holding hands, we can put him in car from further away
            const grabDist = this.gunther.state === 'holding_hands' ? 6 : 4;
            if (dist < grabDist) {
                // Must be close to car too
                const carDist = Math.hypot(player.x - this.car.x, player.z - this.car.z);
                if (carDist < 8) {
                    const wasTrapped = this.gunther.state === 'trapped';
                    const wasHolding = this.gunther.state === 'holding_hands';
                    this.gunther.state = 'in_car';
                    this.gunther.visible = false;
                    this.gunther.trapPos = null;
                    this.gunther.holderId = null;
                    this.gunther.strain = 0;
                    this.lastQuote = wasTrapped ? "Ach! You freed me from ze fun snappy thing!" : 
                                     wasHolding ? "NEIN! Not ze boring car again!" :
                                     "Nein! Ze adventure vas just beginning!";
                    return true;
                }
            }
        }
        return false;
    }
    
    holdHand(playerId) {
        const player = this.players.get(playerId);
        if (!player || player.inCar) return false;
        
        if (this.gunther.state === 'wandering' || this.gunther.state === 'trapped') {
            const dist = Math.hypot(player.x - this.gunther.x, player.z - this.gunther.z);
            if (dist < 4) {
                this.gunther.state = 'holding_hands';
                this.gunther.holderId = playerId;
                this.gunther.strain = 0;
                this.gunther.trapPos = null;
                this.lastQuote = "Ach! You are holding my hand! But I vant to EXPLORE!";
                return true;
            }
        }
        return false;
    }
    
    releaseHand(playerId) {
        if (this.gunther.state === 'holding_hands' && this.gunther.holderId === playerId) {
            this.gunther.state = 'wandering';
            this.gunther.holderId = null;
            this.gunther.strain = 0;
            this.lastQuote = "FREEDOM! Now vhere vas zat lava pit?";
            return true;
        }
        return false;
    }
    
    shoot(playerId, x, z, dirX, dirZ) {
        if (this.gameState !== 'playing') return;
        
        let closestEnemy = null;
        let closestDist = Infinity;
        
        for (const enemy of this.enemies) {
            const dx = enemy.x - x;
            const dz = enemy.z - z;
            const dist = Math.hypot(dx, dz);
            
            if (dist > 60 || dist < 1) continue;
            
            const dot = dx * dirX + dz * dirZ;
            if (dot < 0) continue;
            
            const perpDist = Math.abs(dx * dirZ - dz * dirX);
            
            if (perpDist < 2.5 && dot < closestDist) {
                closestDist = dot;
                closestEnemy = enemy;
            }
        }
        
        if (closestEnemy) {
            closestEnemy.health--;
            
            if (closestEnemy.health <= 0) {
                if (closestEnemy.hasGunther) {
                    this.gunther.state = 'wandering';
                    this.gunther.captorId = null;
                    this.gunther.visible = true;
                    this.gunther.x = closestEnemy.x;
                    this.gunther.z = closestEnemy.z;
                    this.lastQuote = "Ach! My candy friend is kaput!";
                }
                
                this.enemies = this.enemies.filter(e => e !== closestEnemy);
                
                setTimeout(() => {
                    if (this.gameState === 'playing') this.spawnEnemy();
                }, 2000);
            }
            
            return { id: closestEnemy.id, killed: closestEnemy.health <= 0 };
        }
        return null;
    }
    
    getState() {
        return {
            car: this.car,
            gunther: this.gunther,
            enemies: this.enemies,
            gameState: this.gameState,
            players: Array.from(this.players.entries()).map(([id, p]) => ({
                id, name: p.name, inCar: p.inCar, x: p.x, z: p.z
            })),
            lastQuote: this.lastQuote,
            loseReason: this.loseReason,
            goalZ: GOAL_Z
        };
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    let currentRoom = null;
    
    socket.on('createRoom', (playerName) => {
        const code = generateRoomCode();
        const room = new GameRoom(code);
        rooms.set(code, room);
        
        room.players.set(socket.id, { name: playerName || 'Player', inCar: true, x: 0, z: START_Z });
        currentRoom = room;
        socket.join(code);
        socket.emit('roomCreated', { code, playerId: socket.id });
        console.log(`Room ${code} created`);
    });
    
    socket.on('joinRoom', ({ code, playerName }) => {
        const room = rooms.get(code.toUpperCase());
        if (!room) return socket.emit('error', 'Room not found');
        if (room.players.size >= 4) return socket.emit('error', 'Room is full');
        
        room.players.set(socket.id, { name: playerName || 'Player', inCar: true, x: room.car.x, z: room.car.z });
        currentRoom = room;
        socket.join(code);
        socket.emit('roomJoined', { code, playerId: socket.id });
        io.to(code).emit('playerJoined', { id: socket.id, name: playerName });
        console.log(`${playerName} joined ${code}`);
    });
    
    socket.on('startGame', () => {
        if (currentRoom && currentRoom.gameState === 'waiting') {
            currentRoom.start();
            io.to(currentRoom.code).emit('gameStarted');
        }
    });
    
    socket.on('carUpdate', (data) => {
        if (!currentRoom || currentRoom.gameState !== 'playing') return;
        currentRoom.car.x = data.x;
        currentRoom.car.z = data.z;
        currentRoom.car.rotation = data.rotation;
    });
    
    socket.on('playerUpdate', (data) => {
        if (!currentRoom) return;
        const player = currentRoom.players.get(socket.id);
        if (player) {
            player.x = data.x;
            player.z = data.z;
            player.inCar = data.inCar;
        }
    });
    
    socket.on('exitCar', () => {
        if (!currentRoom) return;
        const player = currentRoom.players.get(socket.id);
        if (player) {
            player.inCar = false;
            player.x = currentRoom.car.x + 4;
            player.z = currentRoom.car.z;
        }
    });
    
    socket.on('enterCar', () => {
        if (!currentRoom) return;
        const player = currentRoom.players.get(socket.id);
        if (player) {
            const dist = Math.hypot(player.x - currentRoom.car.x, player.z - currentRoom.car.z);
            if (dist < 6) player.inCar = true;
        }
    });
    
    socket.on('grabGunther', () => {
        if (currentRoom) currentRoom.grabGunther(socket.id);
    });
    
    socket.on('holdHand', () => {
        if (currentRoom) currentRoom.holdHand(socket.id);
    });
    
    socket.on('releaseHand', () => {
        if (currentRoom) currentRoom.releaseHand(socket.id);
    });
    
    socket.on('shoot', (data) => {
        if (!currentRoom) return;
        const result = currentRoom.shoot(socket.id, data.x, data.z, data.dirX, data.dirZ);
        if (result) io.to(currentRoom.code).emit('enemyHit', result);
    });
    
    socket.on('debugConfig', (config) => {
        if (!currentRoom) return;
        currentRoom.updateConfig(config);
        // Broadcast config change to all players in room
        io.to(currentRoom.code).emit('configUpdated', currentRoom.config);
    });
    
    socket.on('disconnect', () => {
        if (currentRoom) {
            currentRoom.players.delete(socket.id);
            io.to(currentRoom.code).emit('playerLeft', socket.id);
            if (currentRoom.players.size === 0) {
                rooms.delete(currentRoom.code);
                console.log(`Room ${currentRoom.code} deleted`);
            }
        }
    });
});

// Game loop
setInterval(() => {
    const now = Date.now();
    rooms.forEach((room) => {
        const delta = (now - room.lastUpdate) / 1000;
        room.lastUpdate = now;
        room.update(delta);
        io.to(room.code).emit('gameState', room.getState());
    });
}, 1000 / 20); // 20 FPS server tick

const PORT = 8080;
server.listen(PORT, () => console.log(`GGG server running on port ${PORT}`));
