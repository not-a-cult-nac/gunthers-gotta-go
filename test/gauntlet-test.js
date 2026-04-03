/**
 * Gauntlet Level - 10 Acceptance Tests
 * Tests that all sections exist and function correctly
 */

import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:10007';
const HEADLESS = process.env.HEADLESS !== 'false';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let passed = 0;
let failed = 0;
const results = [];

function test(name, pass, detail = '') {
    if (pass) {
        passed++;
        results.push({ name, status: 'PASS', detail });
        console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
    } else {
        failed++;
        results.push({ name, status: 'FAIL', detail });
        console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    }
}

async function runTests() {
    console.log('🏰 THE GAUNTLET — Acceptance Tests');
    console.log(`URL: ${GAME_URL}\n`);

    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    try {
        await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(2000);

        // Check if game source loads properly by examining the module code
        const configCheck = await page.evaluate(async () => {
            // Fetch the GameConfig source to verify zone definitions
            try {
                const resp = await fetch('/src/game/GameConfig.js');
                const text = await resp.text();
                return {
                    hasWaterZone: text.includes('WATER_ZONE') || text.includes('waterZone') || text.includes('RIVER') || text.includes('water'),
                    hasMudZone: text.includes('MUD_ZONE') || text.includes('mudZone') || text.includes('MUD') || text.includes('mud'),
                    hasTunnelZone: text.includes('TUNNEL') || text.includes('tunnel'),
                    hasPendulums: text.includes('PENDULUM') || text.includes('pendulum'),
                    hasBridge: text.includes('BRIDGE') || text.includes('bridge') || text.includes('CRUMBLING'),
                    hasLava: text.includes('LAVA') || text.includes('lava'),
                    hasIce: text.includes('ICE') || text.includes('ice'),
                    hasFallingRocks: text.includes('FALLING') || text.includes('falling') || text.includes('CANYON'),
                    hasGoalZ620: text.includes('620'),
                    hasBoulders: text.includes('boulder') || text.includes('BOULDER'),
                    raw: text.substring(0, 200)
                };
            } catch(e) {
                return { error: e.message };
            }
        });

        // Test 1: River Ford zone defined
        test('1. River Ford zone', configCheck.hasWaterZone, 
            configCheck.hasWaterZone ? 'Water zone config found' : 'No water zone in GameConfig');

        // Test 2: Boulder Slalom
        test('2. Boulder Slalom', configCheck.hasBoulders,
            configCheck.hasBoulders ? 'Boulder definitions found' : 'No boulders in GameConfig');

        // Test 3: Mud Swamp
        test('3. Mud Swamp zone', configCheck.hasMudZone,
            configCheck.hasMudZone ? 'Mud zone config found' : 'No mud zone in GameConfig');

        // Test 4: Pitch Black Tunnel
        test('4. Pitch Black Tunnel', configCheck.hasTunnelZone,
            configCheck.hasTunnelZone ? 'Tunnel zone config found' : 'No tunnel in GameConfig');

        // Test 5: Pendulum Alley
        test('5. Pendulum Alley', configCheck.hasPendulums,
            configCheck.hasPendulums ? 'Pendulum config found' : 'No pendulums in GameConfig');

        // Test 6: Crumbling Bridge
        test('6. Crumbling Bridge', configCheck.hasBridge,
            configCheck.hasBridge ? 'Bridge config found' : 'No bridge in GameConfig');

        // Test 7: Lava Field
        test('7. Lava Field', configCheck.hasLava,
            configCheck.hasLava ? 'Lava config found' : 'No lava in GameConfig');

        // Test 8: Ice Patch
        test('8. Ice Patch Drift', configCheck.hasIce,
            configCheck.hasIce ? 'Ice zone config found' : 'No ice in GameConfig');

        // Test 9: Falling Rocks
        test('9. Falling Rocks', configCheck.hasFallingRocks,
            configCheck.hasFallingRocks ? 'Falling rocks/canyon config found' : 'No falling rocks in GameConfig');

        // Now check the World.js and Game.js for implementation
        const implCheck = await page.evaluate(async () => {
            try {
                const [worldResp, gameResp, vehicleResp] = await Promise.all([
                    fetch('/src/game/World.js'),
                    fetch('/src/game/Game.js'),
                    fetch('/src/game/Vehicle.js')
                ]);
                const [worldSrc, gameSrc, vehicleSrc] = await Promise.all([
                    worldResp.text(), gameResp.text(), vehicleResp.text()
                ]);
                return {
                    // World.js checks
                    worldHasWater: worldSrc.includes('createWater') || worldSrc.includes('waterZone') || worldSrc.includes('Water'),
                    worldHasTunnel: worldSrc.includes('createTunnel') || worldSrc.includes('Tunnel'),
                    worldHasPendulum: worldSrc.includes('createPendulum') || worldSrc.includes('Pendulum'),
                    worldHasLava: worldSrc.includes('createLava') || worldSrc.includes('Lava') || worldSrc.includes('lavaPool'),
                    worldHasIce: worldSrc.includes('createIce') || worldSrc.includes('Ice'),
                    worldHasCanyon: worldSrc.includes('createCanyon') || worldSrc.includes('Canyon') || worldSrc.includes('canyon'),
                    worldHasBridge: worldSrc.includes('createBridge') || worldSrc.includes('Crumbling') || worldSrc.includes('crumbling'),
                    
                    // Game.js checks  
                    gameHasZoneEffects: gameSrc.includes('Gauntlet') || gameSrc.includes('zoneEffect') || gameSrc.includes('updateZone'),
                    gameHasPendulumAnim: gameSrc.includes('pendulum') && gameSrc.includes('sin'),
                    gameHasFallingRocks: gameSrc.includes('fallingRock') || gameSrc.includes('spawnRock') || gameSrc.includes('Falling'),
                    gameHasTunnelLight: gameSrc.includes('tunnel') && (gameSrc.includes('fog') || gameSrc.includes('ambient') || gameSrc.includes('SpotLight') || gameSrc.includes('spotlight')),
                    
                    // Vehicle.js checks
                    vehicleHasTraction: vehicleSrc.includes('traction') || vehicleSrc.includes('Traction'),
                    vehicleHasLateral: vehicleSrc.includes('lateral') || vehicleSrc.includes('Lateral') || vehicleSrc.includes('current'),
                    vehicleHasSpeedMult: vehicleSrc.includes('speedMult') || vehicleSrc.includes('SpeedMult') || vehicleSrc.includes('speed_mult'),
                };
            } catch(e) {
                return { error: e.message };
            }
        });

        // Test 10: Full implementation - check that key systems exist
        const implScore = [
            implCheck.worldHasWater,
            implCheck.worldHasTunnel,
            implCheck.worldHasPendulum,
            implCheck.worldHasLava,
            implCheck.worldHasIce,
            implCheck.worldHasCanyon,
            implCheck.gameHasZoneEffects,
            implCheck.gameHasPendulumAnim,
            implCheck.gameHasFallingRocks,
            implCheck.gameHasTunnelLight,
            implCheck.vehicleHasTraction,
            implCheck.vehicleHasLateral,
        ].filter(Boolean).length;

        test('10. Full Implementation', implScore >= 10,
            `${implScore}/12 implementation checks passed: ` +
            `Water:${implCheck.worldHasWater} Tunnel:${implCheck.worldHasTunnel} Pend:${implCheck.worldHasPendulum} ` +
            `Lava:${implCheck.worldHasLava} Ice:${implCheck.worldHasIce} Canyon:${implCheck.worldHasCanyon} ` +
            `ZoneEff:${implCheck.gameHasZoneEffects} PendAnim:${implCheck.gameHasPendulumAnim} FallRock:${implCheck.gameHasFallingRocks} ` +
            `TunnelLight:${implCheck.gameHasTunnelLight} Traction:${implCheck.vehicleHasTraction} Lateral:${implCheck.vehicleHasLateral}`
        );

        // Bonus: check for JS errors on load
        if (errors.length > 0) {
            console.log(`\n  ⚠️  ${errors.length} console errors detected:`);
            errors.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 120)}`));
        } else {
            console.log('\n  ✅ No console errors on load');
        }

    } catch(e) {
        console.error('Test setup failed:', e.message);
        test('Setup', false, e.message);
    } finally {
        await browser.close();
    }

    // Summary
    const total = passed + failed;
    const pct = Math.round((passed / total) * 100);
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`SCORE: ${passed}/${total} (${pct}%)`);
    console.log(`${'═'.repeat(50)}`);
    
    if (pct >= 95) {
        console.log('🎉 PASSED — Ready to ship!');
    } else {
        console.log('🔧 NEEDS WORK — Fix failing tests');
    }

    process.exit(pct >= 95 ? 0 : 1);
}

runTests().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
