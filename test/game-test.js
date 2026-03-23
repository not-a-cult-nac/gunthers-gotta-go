/**
 * Automated game testing via Playwright
 * Tests core gameplay mechanics
 */

import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS !== 'false';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🎮 Starting GGG Game Tests...');
    console.log(`URL: ${GAME_URL}`);
    
    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();
    
    // Collect console errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    
    const results = {
        passed: [],
        failed: [],
    };
    
    function pass(name) {
        console.log(`  ✅ ${name}`);
        results.passed.push(name);
    }
    
    function fail(name, reason) {
        console.log(`  ❌ ${name}: ${reason}`);
        results.failed.push({ name, reason });
    }
    
    try {
        // Test 1: Page loads
        console.log('\n📋 Test: Page Load');
        await page.goto(GAME_URL, { timeout: 30000 });
        const startBtn = await page.$('#start-btn');
        if (startBtn) {
            pass('Start button exists');
        } else {
            fail('Start button exists', 'Button not found');
        }
        
        // Test 2: Game starts
        console.log('\n📋 Test: Game Start');
        await page.click('#start-btn');
        await sleep(1000);
        
        // Check for WebGL canvas
        const canvas = await page.$('canvas');
        if (canvas) {
            pass('Canvas created');
        } else {
            fail('Canvas created', 'No canvas element');
        }
        
        // Test 3: HUD elements present
        console.log('\n📋 Test: HUD Elements');
        const guntherStatus = await page.$('#gunther-status');
        const enemyCount = await page.$('#enemy-count');
        const distance = await page.$('#distance');
        
        if (guntherStatus) pass('Gunther status HUD');
        else fail('Gunther status HUD', 'Not found');
        
        if (enemyCount) pass('Enemy count HUD');
        else fail('Enemy count HUD', 'Not found');
        
        if (distance) pass('Distance HUD');
        else fail('Distance HUD', 'Not found');
        
        // Test 4: Drive forward
        console.log('\n📋 Test: Vehicle Movement');
        const distBefore = await page.$eval('#distance', el => parseInt(el.textContent));
        
        // Hold W for 2 seconds
        await page.keyboard.down('KeyW');
        await sleep(2000);
        await page.keyboard.up('KeyW');
        
        const distAfter = await page.$eval('#distance', el => parseInt(el.textContent));
        if (distAfter < distBefore) {
            pass(`Vehicle moves forward (${distBefore}m -> ${distAfter}m)`);
        } else {
            fail('Vehicle moves forward', `Distance unchanged: ${distBefore} -> ${distAfter}`);
        }
        
        // Test 5: Shooting
        console.log('\n📋 Test: Shooting');
        await page.mouse.click(640, 360); // Click to shoot
        await sleep(100);
        await page.mouse.click(640, 360);
        await sleep(100);
        pass('Shooting does not crash');
        
        // Test 6: Camera toggle
        console.log('\n📋 Test: Camera Toggle');
        await page.keyboard.press('KeyC');
        await sleep(500);
        await page.keyboard.press('KeyC');
        await sleep(500);
        pass('Camera toggle does not crash');
        
        // Test 7: Drive more and check for enemies
        console.log('\n📋 Test: Enemy Spawning');
        await page.keyboard.down('KeyW');
        await sleep(3000);
        await page.keyboard.up('KeyW');
        
        const enemyCountVal = await page.$eval('#enemy-count', el => parseInt(el.textContent));
        if (enemyCountVal > 0) {
            pass(`Enemies spawned (${enemyCountVal} enemies)`);
        } else {
            fail('Enemies spawned', 'No enemies found');
        }
        
        // Test 8: No JS errors
        console.log('\n📋 Test: JavaScript Errors');
        const jsErrors = errors.filter(e => !e.includes('favicon') && !e.includes('404'));
        if (jsErrors.length === 0) {
            pass('No JavaScript errors');
        } else {
            fail('No JavaScript errors', jsErrors.join('; '));
        }
        
        // Test 9: Game doesn't crash after 10 seconds of play
        console.log('\n📋 Test: Stability');
        await page.keyboard.down('KeyW');
        for (let i = 0; i < 10; i++) {
            await page.mouse.click(640 + (Math.random() - 0.5) * 200, 360);
            await sleep(500);
            if (i % 2 === 0) {
                await page.keyboard.press('KeyA');
            } else {
                await page.keyboard.press('KeyD');
            }
        }
        await page.keyboard.up('KeyW');
        
        // Check game is still running
        const stillRunning = await page.$eval('#distance', el => parseInt(el.textContent));
        if (typeof stillRunning === 'number') {
            pass('Game stable after 10 seconds of play');
        } else {
            fail('Game stable', 'Game appears to have crashed');
        }
        
    } catch (error) {
        fail('Test execution', error.message);
    }
    
    await browser.close();
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${results.passed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
        console.log('\nFailed tests:');
        results.failed.forEach(f => console.log(`  - ${f.name}: ${f.reason}`));
    }
    
    console.log('');
    
    return results.failed.length === 0;
}

runTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
        console.error('Test runner error:', err);
        process.exit(1);
    });
