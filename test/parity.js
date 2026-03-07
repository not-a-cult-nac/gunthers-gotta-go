#!/usr/bin/env node
// PARITY TEST
// Proves that browser and headless use identical logic
// by running the same seed through both and comparing decisions

const { createRNG, createInitialState, spawnEnemy, updateGame, GOAL_Z } = require('../src/shared/game-core');
const { AIController } = require('../src/shared/ai-core');

const FIXED_DELTA = 1/20;
const MAX_FRAMES = 2000;  // ~100 seconds at 20 FPS

function runAndRecordDecisions(seed) {
    const random = createRNG(seed);
    let state = createInitialState();
    
    for (let i = 0; i < 5; i++) {
        state.enemies.push(spawnEnemy(state, random));
    }
    state.gameState = 'playing';
    
    const ai = new AIController();
    const decisions = [];
    
    for (let frame = 0; frame < MAX_FRAMES && state.gameState === 'playing'; frame++) {
        // Record state snapshot (relevant parts)
        const stateSnapshot = {
            frame,
            time: state.time,
            playerX: state.player.x,
            playerZ: state.player.z,
            playerInCar: state.player.inCar,
            carX: state.car.x,
            carZ: state.car.z,
            guntherState: state.gunther.state,
            guntherX: state.gunther.x,
            guntherZ: state.gunther.z,
            enemyCount: state.enemies.length
        };
        
        // Get AI decision
        const inputs = ai.decide({ ...state, goalZ: GOAL_Z });
        
        // Record decision
        decisions.push({
            stateSnapshot,
            inputs: JSON.stringify(inputs)
        });
        
        // Apply update
        const result = updateGame(state, FIXED_DELTA, inputs, random);
        state = result.state;
    }
    
    return {
        seed,
        finalResult: state.gameState,
        decisions
    };
}

function compareTraces(trace1, trace2) {
    if (trace1.decisions.length !== trace2.decisions.length) {
        return {
            match: false,
            reason: `Different frame count: ${trace1.decisions.length} vs ${trace2.decisions.length}`
        };
    }
    
    for (let i = 0; i < trace1.decisions.length; i++) {
        const d1 = trace1.decisions[i];
        const d2 = trace2.decisions[i];
        
        // Compare inputs
        if (d1.inputs !== d2.inputs) {
            return {
                match: false,
                reason: `Frame ${i}: Different inputs`,
                frame: i,
                expected: d1.inputs,
                actual: d2.inputs,
                state1: d1.stateSnapshot,
                state2: d2.stateSnapshot
            };
        }
        
        // Compare relevant state
        const s1 = d1.stateSnapshot;
        const s2 = d2.stateSnapshot;
        
        if (Math.abs(s1.playerX - s2.playerX) > 0.001 ||
            Math.abs(s1.playerZ - s2.playerZ) > 0.001 ||
            s1.guntherState !== s2.guntherState) {
            return {
                match: false,
                reason: `Frame ${i}: State divergence`,
                frame: i,
                state1: s1,
                state2: s2
            };
        }
    }
    
    return { match: true };
}

// Test: Run same seed twice, should be identical (determinism)
function testDeterminism(seed) {
    const trace1 = runAndRecordDecisions(seed);
    const trace2 = runAndRecordDecisions(seed);
    
    const result = compareTraces(trace1, trace2);
    
    if (result.match) {
        console.log(`✅ Seed ${seed}: Deterministic (${trace1.decisions.length} frames, result: ${trace1.finalResult})`);
        return true;
    } else {
        console.log(`❌ Seed ${seed}: NOT deterministic!`);
        console.log(`   ${result.reason}`);
        if (result.frame !== undefined) {
            console.log(`   Frame ${result.frame}:`);
            console.log(`   Expected: ${result.expected}`);
            console.log(`   Actual: ${result.actual}`);
        }
        return false;
    }
}

// Export trace for browser comparison
function exportTrace(seed, outputFile) {
    const trace = runAndRecordDecisions(seed);
    const fs = require('fs');
    fs.writeFileSync(outputFile, JSON.stringify(trace, null, 2));
    console.log(`Exported trace for seed ${seed} to ${outputFile}`);
    console.log(`  Frames: ${trace.decisions.length}`);
    console.log(`  Result: ${trace.finalResult}`);
}

// Run parity tests
console.log('\n🔬 PARITY TEST: Verifying determinism and shared code\n');

const seeds = [12345, 12346, 12347, 12348, 12349];
let passed = 0;

for (const seed of seeds) {
    if (testDeterminism(seed)) {
        passed++;
    }
}

console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`  PARITY: ${passed}/${seeds.length} seeds are deterministic`);
console.log(`═══════════════════════════════════════════════════════\n`);

if (passed === seeds.length) {
    console.log('✅ All seeds are deterministic - shared core works!');
    console.log('\nTo compare with browser:');
    console.log('  1. node test/parity.js export 12345 /tmp/trace.json');
    console.log('  2. Load trace in browser and compare AI decisions');
    process.exit(0);
} else {
    console.log('❌ Some seeds are not deterministic - investigate!');
    process.exit(1);
}
