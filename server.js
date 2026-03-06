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
        this.gunther = { x: 0, z: START_Z, state: 'in_car', visible: false, captorId: null, trapPos: null };
        this.enemies = [];
        this.gameState = 'waiting';
        this.lastUpdate = Date.now();
        this.enemyIdCounter = 0;
        this.lastQuote = '';
        this.loseReason = '';
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
        const enemy = {
            id: this.enemyIdCounter++,
            x: side * (20 + Math.random() * 25),  // Closer to path
            z: minZ + Math.random() * (maxZ - minZ),
            health: 2,
            hasGunther: false,
            speed: 3 + Math.random() * 2  // Slightly faster
        };
        this.enemies.push(enemy);
        return enemy;
    }
    
    update(delta) {
        if (this.gameState !== 'playing') return;
        
        // Gunther escapes from car
        if (this.gunther.state === 'in_car') {
            // Random escape - roughly every 45-60 seconds on average
            if (Math.random() < 0.025 * delta) {
                this.releaseGunther();
                this.lastQuote = guntherQuotes[Math.floor(Math.random() * guntherQuotes.length)];
            }
            
            // Escapes toward nearby enemies (only if they get really close)
            for (const enemy of this.enemies) {
                const dist = Math.hypot(enemy.x - this.car.x, enemy.z - this.car.z);
                if (dist < 12) {
                    this.releaseGunther();
                    this.gunther.x += (enemy.x - this.car.x) * 0.4;
                    this.gunther.z += (enemy.z - this.car.z) * 0.4;
                    this.lastQuote = "Ooh! Zat man has CANDY!";
                    break;
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
                    this.gunther.x += (dx / dist) * 3.5 * delta;
                    this.gunther.z += (dz / dist) * 3.5 * delta;
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
            if ((this.gunther.state === 'wandering' || this.gunther.state === 'trapped') && !enemy.hasGunther) {
                const dx = this.gunther.x - enemy.x;
                const dz = this.gunther.z - enemy.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0) {
                    enemy.x += (dx / dist) * enemy.speed * delta;
                    enemy.z += (dz / dist) * enemy.speed * delta;
                }
                
                if (dist < 2) {
                    enemy.hasGunther = true;
                    this.gunther.state = 'captured';
                    this.gunther.captorId = enemy.id;
                    this.gunther.trapPos = null;
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
        
        if (this.gunther.state === 'wandering' || this.gunther.state === 'trapped') {
            const dist = Math.hypot(player.x - this.gunther.x, player.z - this.gunther.z);
            if (dist < 4) {
                const wasTrapped = this.gunther.state === 'trapped';
                this.gunther.state = 'in_car';
                this.gunther.visible = false;
                this.gunther.trapPos = null;
                this.lastQuote = wasTrapped ? "Ach! You freed me from ze fun snappy thing!" : "Nein! Ze adventure vas just beginning!";
                return true;
            }
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
    
    socket.on('shoot', (data) => {
        if (!currentRoom) return;
        const result = currentRoom.shoot(socket.id, data.x, data.z, data.dirX, data.dirZ);
        if (result) io.to(currentRoom.code).emit('enemyHit', result);
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
