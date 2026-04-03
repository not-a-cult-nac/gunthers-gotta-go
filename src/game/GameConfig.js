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

    // Vehicle (slowed down ~45% from original)
    VEHICLE_HEALTH: 150,
    VEHICLE_MAX_SPEED: 10,
    VEHICLE_ACCELERATION: 6,
    VEHICLE_TURN_SPEED: 1.8,
    VEHICLE_BOOST_MULTIPLIER: 1.5,
    VEHICLE_BOOST_DURATION: 2,
    VEHICLE_BOOST_COOLDOWN: 5,

    // iPad charge
    IPAD_MAX_CHARGE: 100,
    IPAD_DRAIN_RATE: 9, // per second while moving
    IPAD_CHARGE_RATE: 17, // per second while stopped
    IPAD_CHARGE_SPEED_THRESHOLD: 1.5, // speed below which jeep counts as "stopped"

    // Gunther
    GUNTHER_ESCAPE_RATE: 0.025, // unused now - Gunther stays in jeep
    GUNTHER_WANDER_SPEED: 3.5,
    GUNTHER_DANGER_ATTRACTION: 0.8,

    // Enemies (background scenery only)
    ENEMY_SPAWN_INTERVAL: 5,
    ENEMY_MAX_COUNT: 8,
    ENEMY_INITIAL_COUNT: 3,
    ENEMY_BASE_SPEED: 2,
    ENEMY_HEALTH: 2,
    ENEMY_STEALER_RATIO: 0.6,
    ENEMY_SPAWN_AHEAD_MIN: 30,
    ENEMY_SPAWN_AHEAD_MAX: 100,
    ENEMY_SPAWN_SIDE_MIN: 20,
    ENEMY_SPAWN_SIDE_MAX: 45,
    ENEMY_DETECTION_RANGE: 50,

    // Obstacles
    OBSTACLES: [
        // Bridges (narrow crossings)
        { x: 0, z: 60, type: 'bridge', width: 5, length: 12, rotation: 0 },
        { x: 0, z: 200, type: 'bridge', width: 5, length: 14, rotation: 0.2 },
        { x: 0, z: 340, type: 'bridge', width: 5, length: 12, rotation: -0.15 },

        // Boulders
        { x: 8, z: 30, type: 'boulder', radius: 3 },
        { x: -12, z: 75, type: 'boulder', radius: 2.5 },
        { x: 15, z: 110, type: 'boulder', radius: 3.5 },
        { x: -8, z: 150, type: 'boulder', radius: 2 },
        { x: 10, z: 170, type: 'boulder', radius: 3 },
        { x: -15, z: 220, type: 'boulder', radius: 4 },
        { x: 12, z: 260, type: 'boulder', radius: 2.5 },
        { x: -10, z: 290, type: 'boulder', radius: 3 },
        { x: 7, z: 310, type: 'boulder', radius: 2 },
        { x: -5, z: 360, type: 'boulder', radius: 3.5 },
        { x: 13, z: 390, type: 'boulder', radius: 2.5 },
        { x: -11, z: 420, type: 'boulder', radius: 3 },

        // Fallen trees
        { x: -5, z: 45, type: 'fallen_tree', length: 8, rotation: 0.8 },
        { x: 6, z: 95, type: 'fallen_tree', length: 10, rotation: -0.5 },
        { x: -8, z: 160, type: 'fallen_tree', length: 9, rotation: 0.3 },
        { x: 4, z: 235, type: 'fallen_tree', length: 7, rotation: -0.7 },
        { x: -3, z: 280, type: 'fallen_tree', length: 10, rotation: 0.6 },
        { x: 7, z: 330, type: 'fallen_tree', length: 8, rotation: -0.4 },
        { x: -6, z: 370, type: 'fallen_tree', length: 9, rotation: 0.5 },
        { x: 5, z: 410, type: 'fallen_tree', length: 7, rotation: -0.6 },

        // Rugged terrain patches (slow zones)
        { x: 0, z: 85, type: 'rugged', radius: 12 },
        { x: 0, z: 185, type: 'rugged', radius: 15 },
        { x: 0, z: 270, type: 'rugged', radius: 10 },
        { x: 0, z: 350, type: 'rugged', radius: 13 },
    ],

    // Hazards (kept but fewer - mostly decorative now)
    HAZARDS: [
        { x: 40, z: 50, type: 'lava', radius: 12 },
        { x: -35, z: 180, type: 'lava', radius: 10 },
        { x: 50, z: 320, type: 'lava', radius: 14 },
        { x: -50, z: 100, type: 'cliff', radius: 15 },
        { x: 55, z: 250, type: 'cliff', radius: 12 },
        { x: -45, z: 380, type: 'cliff', radius: 15 },
    ],

    // Gunther quotes - iPad themed
    QUOTES: {
        escape: [
            "Mein iPad is dying!",
            "Vhere is ze charger?!",
            "Zis YouTube video is BUFFERING!",
            "I need ze WiFi!",
            "Ze battery! NEIN!",
        ],
        iPadLow: [
            "Mein iPad is dying!",
            "Ze battery is getting low!",
            "Vhere is ze charger?!",
            "Nein! Only 25 percent!",
            "Ze screen is dimming!",
        ],
        iPadCritical: [
            "ZE BATTERY! NEIN NEIN NEIN!",
            "I CANNOT LIVE VIZOUT YOUTUBE!",
            "CHARGE ZE IPAD OR I LEAVE!",
            "ZIS IS AN EMERGENCY!",
        ],
        iPadCharging: [
            "Ah, ze battery is charging! Gut!",
            "Stay still! Ze iPad needs ze rest!",
            "Zis is a good parking spot, ja?",
            "More charging please!",
        ],
        iPadDead: [
            "ZE IPAD IS DEAD! I AM LEAVING!",
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
            ipad: "Ze iPad is DEAD! I go find a charger!",
        }
    }
};
