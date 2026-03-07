#!/usr/bin/env node
// Headless game runner - runs games without browser/socket
// Usage: node test/headless.js [numGames] [seed]

const { GameSimulation } = require('../src/simulation');
const { AIController } = require('../src/ai');

const FIXED_DELTA = 1/20;  // 20 FPS simulation
const MAX_TIME = 120;       // Max 2 minutes per game

function runGame(seed) {
    const sim = new GameSimulation(seed);
    const ai = new AIController();
    
    const events = [];
    let lastGuntherState = 'in_car';
    
    while (sim.gameState === 'playing' && sim.time < MAX_TIME) {
        const state = sim.getState();
        
        // Track state changes for debugging
        if (state.gunther.state !== lastGuntherState) {
            events.push({
                time: sim.time.toFixed(1),
                event: `gunther: ${lastGuntherState} → ${state.gunther.state}`,
                playerInCar: state.player.inCar,
                nearestEnemy: nearestEnemyDist(state).toFixed(1)
            });
            lastGuntherState = state.gunther.state;
        }
        
        // Get AI decision and apply it
        const inputs = ai.decide(state);
        sim.update(FIXED_DELTA, inputs);
    }
    
    return {
        seed,
        result: sim.gameState,
        time: sim.time.toFixed(1),
        loseReason: sim.loseReason,
        finalDistance: (sim.getState().goalZ - sim.car.z).toFixed(0),
        events
    };
}

function nearestEnemyDist(state) {
    let min = Infinity;
    for (const e of state.enemies) {
        const d = Math.hypot(e.x - state.car.x, e.z - state.car.z);
        if (d < min) min = d;
    }
    return min;
}

function runTests(numGames = 50, baseSeed = 12345) {
    console.log(`\n🎮 Running ${numGames} headless games...\n`);
    
    const results = {
        wins: 0,
        losses: 0,
        timeouts: 0,
        totalTime: 0,
        loseReasons: {},
        failedSeeds: []
    };
    
    const startTime = Date.now();
    
    for (let i = 0; i < numGames; i++) {
        const seed = baseSeed + i;
        const game = runGame(seed);
        
        results.totalTime += parseFloat(game.time);
        
        if (game.result === 'won') {
            results.wins++;
        } else if (game.result === 'lost') {
            results.losses++;
            results.loseReasons[game.loseReason] = (results.loseReasons[game.loseReason] || 0) + 1;
            results.failedSeeds.push({ seed, reason: game.loseReason, time: game.time });
        } else {
            results.timeouts++;
            results.failedSeeds.push({ seed, reason: 'timeout', time: game.time });
        }
    }
    
    const elapsed = Date.now() - startTime;
    
    // Report
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${results.wins}/${numGames} wins (${(results.wins/numGames*100).toFixed(1)}%)`);
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Losses: ${results.losses}`);
    console.log(`  Timeouts: ${results.timeouts}`);
    console.log(`  Avg game time: ${(results.totalTime / numGames).toFixed(1)}s (simulated)`);
    console.log(`  Real time: ${elapsed}ms (${(numGames / elapsed * 1000).toFixed(0)} games/sec)`);
    
    if (Object.keys(results.loseReasons).length > 0) {
        console.log('\n  Loss reasons:');
        for (const [reason, count] of Object.entries(results.loseReasons)) {
            console.log(`    ${reason}: ${count}`);
        }
    }
    
    if (results.failedSeeds.length > 0 && results.failedSeeds.length <= 5) {
        console.log('\n  Failed seeds (for replay):');
        for (const { seed, reason, time } of results.failedSeeds.slice(0, 5)) {
            console.log(`    seed=${seed} @ ${time}s: ${reason}`);
        }
    }
    
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Exit code for CI
    const passRate = results.wins / numGames;
    if (passRate < 0.8) {
        console.log('❌ FAIL: Win rate below 80%');
        process.exit(1);
    } else {
        console.log('✅ PASS: Win rate acceptable');
        process.exit(0);
    }
}

// Single game replay for debugging
function replayGame(seed) {
    console.log(`\n🔍 Replaying game with seed ${seed}...\n`);
    
    const sim = new GameSimulation(seed);
    const ai = new AIController();
    
    let frame = 0;
    
    while (sim.gameState === 'playing' && sim.time < MAX_TIME) {
        const state = sim.getState();
        const inputs = ai.decide(state);
        
        // Log every second
        if (frame % 20 === 0) {
            const inputStr = Object.keys(inputs).filter(k => inputs[k]).join(',') || 'none';
            console.log(`t=${sim.time.toFixed(1)}s | car=(${state.car.x.toFixed(0)},${state.car.z.toFixed(0)}) | gunther=${state.gunther.state} | player.inCar=${state.player.inCar} | inputs=${inputStr}`);
        }
        
        sim.update(FIXED_DELTA, inputs);
        frame++;
    }
    
    const state = sim.getState();
    console.log(`\n${sim.gameState === 'won' ? '✅ WIN' : '❌ LOSS'}: ${sim.loseReason || 'Reached goal!'}`);
    console.log(`Final position: ${state.goalZ - state.car.z}m from goal`);
}

// CLI
const args = process.argv.slice(2);
if (args[0] === 'replay' && args[1]) {
    replayGame(parseInt(args[1]));
} else {
    const numGames = parseInt(args[0]) || 50;
    const seed = parseInt(args[1]) || 12345;
    runTests(numGames, seed);
}
