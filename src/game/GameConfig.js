/**
 * Game configuration and constants
 */

export const GameConfig = {
    // World bounds
    GOAL_Z: 440,
    START_Z: -60,
    WORLD_WIDTH: 200,
    
    // Player
    PLAYER_HEALTH: 100,
    PLAYER_SPEED: 8,
    PLAYER_SHOOT_DAMAGE: 25,
    PLAYER_SHOOT_COOLDOWN: 0.15, // seconds
    
    // Vehicle
    VEHICLE_HEALTH: 150,
    VEHICLE_MAX_SPEED: 20,
    VEHICLE_ACCELERATION: 12,
    VEHICLE_TURN_SPEED: 2,
    VEHICLE_BOOST_MULTIPLIER: 1.5,
    VEHICLE_BOOST_DURATION: 2,
    VEHICLE_BOOST_COOLDOWN: 5,
    
    // Gunther
    GUNTHER_ESCAPE_RATE: 0.025, // Probability per second to escape vehicle
    GUNTHER_WANDER_SPEED: 3.5,
    GUNTHER_DANGER_ATTRACTION: 0.8, // How much he's attracted to danger (0-1)
    
    // Enemies
    ENEMY_SPAWN_INTERVAL: 3, // seconds between spawns
    ENEMY_MAX_COUNT: 15,
    ENEMY_INITIAL_COUNT: 5,
    ENEMY_BASE_SPEED: 5,
    ENEMY_HEALTH: 2,
    ENEMY_STEALER_RATIO: 0.6, // 60% stealers, 40% killers
    ENEMY_SPAWN_AHEAD_MIN: 30, // Minimum distance ahead of vehicle to spawn
    ENEMY_SPAWN_AHEAD_MAX: 100,
    ENEMY_SPAWN_SIDE_MIN: 20,
    ENEMY_SPAWN_SIDE_MAX: 45,
    ENEMY_DETECTION_RANGE: 50,
    
    // Hazards
    HAZARDS: [
        // Lava pools
        { x: 40, z: 50, type: 'lava', radius: 12 },
        { x: -35, z: 180, type: 'lava', radius: 10 },
        { x: 50, z: 320, type: 'lava', radius: 14 },
        // Cliffs
        { x: -50, z: 100, type: 'cliff', radius: 15 },
        { x: 55, z: 250, type: 'cliff', radius: 12 },
        { x: -45, z: 380, type: 'cliff', radius: 15 },
        // Bear traps
        { x: -15, z: 20, type: 'trap', radius: 2 },
        { x: 20, z: 80, type: 'trap', radius: 2 },
        { x: -25, z: 140, type: 'trap', radius: 2 },
        { x: 10, z: 200, type: 'trap', radius: 2 },
        { x: -30, z: 260, type: 'trap', radius: 2 },
        { x: 25, z: 300, type: 'trap', radius: 2 },
        { x: -10, z: 350, type: 'trap', radius: 2 },
        { x: 15, z: 400, type: 'trap', radius: 2 },
    ],
    
    // Gunther quotes
    QUOTES: {
        escape: [
            "Ach! Ze lava looks so varm and cozy!",
            "Please pop pop, I vant to see ze bear traps!",
            "Vat is zis? A cliff? I must investigate!",
            "Zose bad men have CANDY! I go now!",
            "Ze danger is calling to me!",
            "I am invincible! Vatch zis!",
            "Ooh! Zat man has CANDY!",
        ],
        trapped: [
            "Ze snappy thing loves me! I cannot move!",
            "Help! ...Actually zis is kind of fun!",
        ],
        carried: [
            "I can see my house from here!",
            "Wheee! Zis is fun!",
            "I am ze tallest German boy!",
        ],
        death: {
            lava: "AAHHH! Ze lava is NOT cozy!",
            cliff: "Wheeeee— *splat*",
            trap: "Ze snappy thing... too snappy...",
            enemy: "Nein! Ze adventure vas just beginning!",
        }
    }
};
