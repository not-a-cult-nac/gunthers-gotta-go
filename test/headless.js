#!/usr/bin/env node
// Headless game runner - uses SHARED game-core and ai-core
// This ensures headless and browser use identical logic

const { createRNG, createInitialState, spawnEnemy, updateGame, GOAL_Z } = require('../src/shared/game-core');
const { AIController } = require('../src/shared/ai-core');

const FIXED_DELTA = 1/20;  // 20 FPS simulation
const MAX_TIME = 120;      // Max 2 minutes per game

function runGame(seed) {
    const random = createRNG(seed);
    let state = createInitialState();
    state.time = 0;
    
    // Spawn initial enemies
    for (let i = 0; i < 5; i++) {
        state.enemies.push(spawnEnemy(state, random));
    }
    state.gameState = 'playing';
    
    const ai = new AIController();
    const events = [];
    let lastGuntherState = 'in_car';
    
    while (state.gameState === 'playing' && state.time < MAX_TIME) {
        // Track state changes
        if (state.gunther.state !== lastGuntherState) {
            events.push({
                time: state.time.toFixed(1),
                event: `gunther: ${lastGuntherState} → ${state.gunther.state}`,
                playerInCar: state.player.inCar,
                nearestEnemy: nearestEnemyDist(state).toFixed(1)
            });
            lastGuntherState = state.gunther.state;
        }
        
        // Get AI decision
        const inputs = ai.decide({ ...state, goalZ: GOAL_Z });
        
        // Update game
        const result = updateGame(state, FIXED_DELTA, inputs, random);
        state = result.state;
    }
    
    return {
        seed,
        result: state.gameState,
        time: state.time.toFixed(1),
        loseReason: state.loseReason,
        finalDistance: (GOAL_Z - state.car.z).toFixed(0),
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
    console.log(`\n🎮 Running ${numGames} headless games (shared core)...\n`);
    
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
    
    const passRate = results.wins / numGames;
    if (passRate < 0.8) {
        console.log('❌ FAIL: Win rate below 80%');
        process.exit(1);
    } else {
        console.log('✅ PASS: Win rate acceptable');
        process.exit(0);
    }
}

// Single game replay
function replayGame(seed) {
    console.log(`\n🔍 Replaying game with seed ${seed}...\n`);
    
    const random = createRNG(seed);
    let state = createInitialState();
    
    for (let i = 0; i < 5; i++) {
        state.enemies.push(spawnEnemy(state, random));
    }
    state.gameState = 'playing';
    
    const ai = new AIController();
    let frame = 0;
    
    while (state.gameState === 'playing' && state.time < MAX_TIME) {
        const inputs = ai.decide({ ...state, goalZ: GOAL_Z });
        
        if (frame % 20 === 0) {
            const inputStr = Object.keys(inputs).filter(k => inputs[k]).join(',') || 'none';
            console.log(`t=${state.time.toFixed(1)}s | car=(${state.car.x.toFixed(0)},${state.car.z.toFixed(0)}) | gunther=${state.gunther.state} | player.inCar=${state.player.inCar} | inputs=${inputStr}`);
        }
        
        const result = updateGame(state, FIXED_DELTA, inputs, random);
        state = result.state;
        frame++;
    }
    
    console.log(`\n${state.gameState === 'won' ? '✅ WIN' : '❌ LOSS'}: ${state.loseReason || 'Reached goal!'}`);
    console.log(`Final position: ${(GOAL_Z - state.car.z).toFixed(0)}m from goal`);
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
