/**
 * Game configuration and constants - THE GAUNTLET
 */

export const GameConfig = {
    // World bounds
    GOAL_Z: 620,
    START_Z: -60,
    WORLD_WIDTH: 200,

    // Player
    PLAYER_HEALTH: 100,
    PLAYER_SPEED: 8,
    PLAYER_SHOOT_DAMAGE: 25,
    PLAYER_SHOOT_COOLDOWN: 0.15,

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
    IPAD_DRAIN_RATE: 4.5,
    IPAD_CHARGE_RATE: 17,
    IPAD_CHARGE_SPEED_THRESHOLD: 1.5,

    // Gunther
    GUNTHER_WANDER_SPEED: 2.0,
    GUNTHER_WANDER_DIR_CHANGE: 1.5,
    GUNTHER_WANDER_MAX_DISTANCE: 40,
    GUNTHER_REBOARD_CHARGE: 10,
    GUNTHER_REBOARD_DISTANCE: 8,

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

    // === THE GAUNTLET - Zone Definitions ===
    ZONES: {
        water:        { startZ: 0,   endZ: 60,  currentForce: 3 },
        mud:          { startZ: 130, endZ: 180 },
        tunnel:       { startZ: 200, endZ: 280 },
        bridge:       { startZ: 360, endZ: 390, halfWidth: 3 },
        ice:          { startZ: 450, endZ: 490 },
        fallingRocks: { startZ: 500, endZ: 540, spawnInterval: 1.5 },
    },

    // Pendulums (Section 5: Pendulum Alley + one in Final Gauntlet)
    PENDULUMS: [
        { x: 0, z: 300, phase: 0,   period: 2.5, amplitude: 7, radius: 2 },
        { x: 0, z: 317, phase: 1.3, period: 2.8, amplitude: 8, radius: 2.2 },
        { x: 0, z: 334, phase: 2.6, period: 2.3, amplitude: 7, radius: 2 },
        { x: 0, z: 348, phase: 3.9, period: 2.6, amplitude: 8, radius: 2.2 },
        // Final gauntlet pendulum
        { x: 0, z: 588, phase: 0.5, period: 2.4, amplitude: 6, radius: 1.8 },
    ],

    // Gauntlet Lava Pools on the path (Section 7 + one in Final Gauntlet)
    GAUNTLET_LAVA: [
        { x: -5, z: 408, radius: 4 },
        { x: 6,  z: 416, radius: 3.5 },
        { x: -3, z: 425, radius: 3 },
        { x: 5,  z: 433, radius: 4 },
        { x: -6, z: 440, radius: 3.5 },
        // Final gauntlet lava
        { x: 3, z: 570, radius: 3 },
    ],

    // Crumbling bridge holes (Section 6)
    BRIDGE_HOLES: [
        { z: 368, halfWidth: 1.2 },
        { z: 376, halfWidth: 1.5 },
        { z: 384, halfWidth: 1.2 },
    ],

    // Obstacles - THE GAUNTLET layout
    OBSTACLES: [
        // === Section 1: River Ford (z=0-60) - boulders in water ===
        { x: -8, z: 15, type: 'boulder', radius: 2.5 },
        { x: 7, z: 25, type: 'boulder', radius: 3 },
        { x: -5, z: 40, type: 'boulder', radius: 2 },
        { x: 10, z: 50, type: 'boulder', radius: 2.5 },

        // === Section 2: Boulder Slalom (z=60-130) - S-pattern ===
        { x: 7, z: 68, type: 'boulder', radius: 3.5 },
        { x: -8, z: 78, type: 'boulder', radius: 3 },
        { x: 6, z: 88, type: 'boulder', radius: 4 },
        { x: -7, z: 98, type: 'boulder', radius: 3.5 },
        { x: 8, z: 105, type: 'boulder', radius: 3 },
        { x: -6, z: 112, type: 'boulder', radius: 3.5 },
        { x: 7, z: 120, type: 'boulder', radius: 4 },
        { x: -8, z: 128, type: 'boulder', radius: 3 },

        // === Section 3: Mud Swamp (z=130-180) - fallen trees blocking ===
        { x: -6, z: 140, type: 'fallen_tree', length: 8, rotation: 0.4 },
        { x: 5, z: 150, type: 'fallen_tree', length: 9, rotation: -0.6 },
        { x: -4, z: 160, type: 'fallen_tree', length: 7, rotation: 0.3 },
        { x: 7, z: 170, type: 'fallen_tree', length: 8, rotation: -0.5 },
        { x: -8, z: 155, type: 'boulder', radius: 2 },
        { x: 9, z: 165, type: 'boulder', radius: 2.5 },

        // === Section 4: Tunnel (z=200-280) - hidden boulders ===
        { x: 3, z: 225, type: 'boulder', radius: 2.5 },
        { x: -4, z: 245, type: 'boulder', radius: 3 },
        { x: 2, z: 260, type: 'boulder', radius: 2 },
        { x: -3, z: 270, type: 'boulder', radius: 2.5 },

        // === Section 8: Ice Patch (z=450-490) - boulders to dodge while drifting ===
        { x: 5, z: 460, type: 'boulder', radius: 2.5 },
        { x: -6, z: 475, type: 'boulder', radius: 3 },
        { x: 4, z: 485, type: 'boulder', radius: 2 },

        // === Section 10: Final Gauntlet (z=550-600) - a bit of everything ===
        { x: -6, z: 555, type: 'boulder', radius: 3 },
        { x: 7, z: 562, type: 'boulder', radius: 2.5 },
        { x: -4, z: 568, type: 'fallen_tree', length: 7, rotation: 0.5 },
        { x: 0, z: 565, type: 'rugged', radius: 8 },
        { x: 5, z: 578, type: 'boulder', radius: 3.5 },
        { x: -7, z: 585, type: 'boulder', radius: 2.5 },
        { x: 3, z: 595, type: 'fallen_tree', length: 6, rotation: -0.4 },
        { x: -5, z: 598, type: 'boulder', radius: 3 },
    ],

    // Hazards (decorative, off the main path)
    HAZARDS: [
        { x: 45, z: 100, type: 'lava', radius: 12 },
        { x: -40, z: 300, type: 'lava', radius: 10 },
        { x: 50, z: 500, type: 'lava', radius: 14 },
        { x: -55, z: 200, type: 'cliff', radius: 15 },
        { x: 55, z: 400, type: 'cliff', radius: 12 },
        { x: -50, z: 550, type: 'cliff', radius: 15 },
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
        tunnel: [
            "Vhy is it so DARK?!",
            "I cannot see mein YouTube!",
            "Turn on ze lights!",
            "Ze iPad is ze only light in here!",
        ],
        lava: [
            "AAHHH! ZE LAVA IS BURNING!",
            "NEIN! TOO HOT! TOO HOT!",
            "Mein iPad is MELTING!",
            "ZIS IS WORSE ZAN NO WIFI!",
        ],
        ice: [
            "WHEEE! Ve are SLIDING!",
            "Zis is like ze ice skating!",
            "CAREFUL! Ze road is slippery!",
        ],
        fallingRocks: [
            "ZE ROCKS! ZEY ARE FALLING!",
            "Look out above!",
            "Mein iPad will be CRUSHED!",
        ],
        water: [
            "Ze river is PUSHING us!",
            "Hold on to ze iPad!",
            "Zis water is COLD!",
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
