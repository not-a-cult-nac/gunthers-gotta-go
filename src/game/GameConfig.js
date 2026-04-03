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
    IPAD_DRAIN_RATE: 4.5, // per second while moving
    IPAD_CHARGE_RATE: 17, // per second while stopped
    IPAD_CHARGE_SPEED_THRESHOLD: 1.5, // speed below which jeep counts as "stopped"

    // Gunther
    GUNTHER_WANDER_SPEED: 2.0,
    GUNTHER_WANDER_DIR_CHANGE: 1.5, // seconds between random direction changes
    GUNTHER_WANDER_MAX_DISTANCE: 40, // distance from jeep before game over
    GUNTHER_REBOARD_CHARGE: 10, // iPad charge % needed for Gunther to reboard
    GUNTHER_REBOARD_DISTANCE: 8, // max distance from jeep to reboard

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

        // === Opening gauntlet (z: 10-50) - tight boulder chicane ===
        { x: 6, z: 12, type: 'boulder', radius: 3 },
        { x: -6, z: 18, type: 'boulder', radius: 3 },
        { x: 5, z: 25, type: 'boulder', radius: 2.5 },
        { x: -5, z: 32, type: 'boulder', radius: 2.5 },
        { x: 8, z: 30, type: 'boulder', radius: 3 },
        { x: -5, z: 45, type: 'fallen_tree', length: 8, rotation: 0.8 },

        // === First rugged zone with flanking boulders (z: 70-100) ===
        { x: 0, z: 85, type: 'rugged', radius: 14 },
        { x: -12, z: 75, type: 'boulder', radius: 2.5 },
        { x: 14, z: 80, type: 'boulder', radius: 3 },
        { x: -14, z: 90, type: 'boulder', radius: 2 },
        { x: 6, z: 95, type: 'fallen_tree', length: 10, rotation: -0.5 },

        // === S-curve section 1 (z: 105-135) - boulders force S-path ===
        { x: -10, z: 105, type: 'boulder', radius: 4 },
        { x: -4, z: 108, type: 'boulder', radius: 3 },
        { x: 15, z: 110, type: 'boulder', radius: 3.5 },
        { x: 8, z: 120, type: 'boulder', radius: 4 },
        { x: 12, z: 123, type: 'boulder', radius: 3 },
        { x: -12, z: 128, type: 'boulder', radius: 3.5 },
        { x: -6, z: 135, type: 'boulder', radius: 3 },

        // === Fallen tree maze (z: 145-175) - overlapping trees ===
        { x: -8, z: 148, type: 'fallen_tree', length: 9, rotation: 0.3 },
        { x: 5, z: 152, type: 'fallen_tree', length: 8, rotation: -0.6 },
        { x: -8, z: 155, type: 'boulder', radius: 2 },
        { x: -3, z: 160, type: 'fallen_tree', length: 10, rotation: 0.7 },
        { x: 8, z: 165, type: 'fallen_tree', length: 7, rotation: -0.3 },
        { x: 10, z: 170, type: 'boulder', radius: 3 },
        { x: -6, z: 173, type: 'fallen_tree', length: 8, rotation: 0.5 },

        // === Wide rugged zone - go around or plow through (z: 180-200) ===
        { x: 0, z: 190, type: 'rugged', radius: 18 },
        { x: -15, z: 195, type: 'boulder', radius: 4 },
        { x: 16, z: 188, type: 'boulder', radius: 3 },

        // === Narrow gap squeeze (z: 215-230) ===
        { x: -4, z: 218, type: 'boulder', radius: 4 },
        { x: 5, z: 218, type: 'boulder', radius: 4 },
        { x: 0, z: 225, type: 'fallen_tree', length: 6, rotation: 1.5 },
        { x: -15, z: 220, type: 'boulder', radius: 4 },
        { x: 4, z: 235, type: 'fallen_tree', length: 7, rotation: -0.7 },

        // === S-curve section 2 (z: 245-275) - tighter than the first ===
        { x: 12, z: 245, type: 'boulder', radius: 3.5 },
        { x: 6, z: 248, type: 'boulder', radius: 3 },
        { x: -10, z: 255, type: 'boulder', radius: 4 },
        { x: -4, z: 258, type: 'boulder', radius: 2.5 },
        { x: 12, z: 260, type: 'boulder', radius: 2.5 },
        { x: 8, z: 265, type: 'boulder', radius: 3.5 },
        { x: -12, z: 270, type: 'boulder', radius: 3 },
        { x: 0, z: 270, type: 'rugged', radius: 10 },

        // === Dense tree corridor (z: 278-300) ===
        { x: -3, z: 280, type: 'fallen_tree', length: 10, rotation: 0.6 },
        { x: 7, z: 285, type: 'fallen_tree', length: 9, rotation: -0.5 },
        { x: -10, z: 290, type: 'boulder', radius: 3 },
        { x: -2, z: 293, type: 'fallen_tree', length: 8, rotation: 0.4 },
        { x: 9, z: 298, type: 'fallen_tree', length: 7, rotation: -0.7 },

        // === Boulder cluster bottleneck (z: 305-320) ===
        { x: 7, z: 308, type: 'boulder', radius: 2 },
        { x: -8, z: 310, type: 'boulder', radius: 3 },
        { x: 3, z: 312, type: 'boulder', radius: 2.5 },
        { x: -3, z: 316, type: 'boulder', radius: 2 },
        { x: 10, z: 318, type: 'boulder', radius: 3.5 },
        { x: 7, z: 330, type: 'fallen_tree', length: 8, rotation: -0.4 },

        // === Final rugged + tree gauntlet (z: 345-380) ===
        { x: 0, z: 355, type: 'rugged', radius: 15 },
        { x: -5, z: 350, type: 'boulder', radius: 3.5 },
        { x: 8, z: 358, type: 'boulder', radius: 2.5 },
        { x: -6, z: 365, type: 'fallen_tree', length: 9, rotation: 0.5 },
        { x: 5, z: 370, type: 'fallen_tree', length: 8, rotation: -0.6 },
        { x: -10, z: 375, type: 'boulder', radius: 3 },
        { x: 12, z: 378, type: 'boulder', radius: 2.5 },

        // === Sprint to finish with scattered hazards (z: 385-430) ===
        { x: 13, z: 390, type: 'boulder', radius: 2.5 },
        { x: -7, z: 395, type: 'fallen_tree', length: 7, rotation: 0.4 },
        { x: 5, z: 405, type: 'boulder', radius: 3 },
        { x: -11, z: 410, type: 'fallen_tree', length: 7, rotation: -0.6 },
        { x: -11, z: 420, type: 'boulder', radius: 3 },
        { x: 8, z: 425, type: 'boulder', radius: 2.5 },
        { x: -4, z: 430, type: 'fallen_tree', length: 6, rotation: 0.7 },
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
        iPadReboard: [
            "Ah, ze iPad lives again! I come back!",
            "Okay okay, ze charge is back. I get in.",
            "Finally! Ze YouTube awaits!",
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
