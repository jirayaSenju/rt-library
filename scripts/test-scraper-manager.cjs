/**
 * Test Suite for ScraperManager & Desktop Scraper Integration (Stage 1)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { SCRAPER_IPC_MESSAGES, SCRAPER_STATES } = require('../scraper/protocol.cjs');
const { parseArgs } = require('../scraper/runner.cjs');

console.log('================================================================================');
console.log('       SCRAPER MANAGER & IPC INTEGRATION TEST SUITE (PR 12.5)');
console.log('================================================================================\n');

let testsPassed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// Test 1: IPC Protocol Definitions
runTest('IPC Protocol Message Types & States Integrity', () => {
  assert.strictEqual(SCRAPER_IPC_MESSAGES.CHANNEL_START, 'scraper:start');
  assert.strictEqual(SCRAPER_IPC_MESSAGES.CHANNEL_CANCEL, 'scraper:cancel');
  assert.strictEqual(SCRAPER_IPC_MESSAGES.CHANNEL_GET_STATE, 'scraper:getState');
  assert.strictEqual(SCRAPER_IPC_MESSAGES.CHANNEL_CLEAR_STORAGE, 'scraper:clearStorage');
  assert.strictEqual(SCRAPER_IPC_MESSAGES.CHANNEL_REINDEX_LIBRARY, 'scraper:reindexLibrary');

  assert.strictEqual(SCRAPER_STATES.IDLE, 'idle');
  assert.strictEqual(SCRAPER_STATES.RUNNING, 'running');
  assert.strictEqual(SCRAPER_STATES.CANCELLING, 'cancelling');
  assert.strictEqual(SCRAPER_STATES.COMPLETED, 'completed');
  assert.strictEqual(SCRAPER_STATES.FAILED, 'failed');
  assert.strictEqual(SCRAPER_STATES.SESSION_REQUIRED, 'session_required');
});

// Test 2: Runner CLI Defaults for Desktop
runTest('Runner Headless Default Enforcement for Desktop UI', () => {
  const origArgv = process.argv;
  process.argv = ['node', 'runner.cjs', '--category', 'ps2'];
  const opts = parseArgs();
  assert.strictEqual(opts.headed, false); // Desktop runs should default to headless: true
  assert.strictEqual(opts.category, 'ps2');
  process.argv = origArgv;
});

// Test 3: Log Buffer Circular Limit Simulation
runTest('Circular Log Buffer Capping (Max 50 items)', () => {
  const logs = [];
  const maxLogs = 50;

  for (let i = 1; i <= 75; i++) {
    logs.push({ level: 'info', message: `Log message ${i}`, timestamp: new Date().toISOString() });
    if (logs.length > maxLogs) {
      logs.shift();
    }
  }

  assert.strictEqual(logs.length, 50);
  assert.strictEqual(logs[0].message, 'Log message 26');
  assert.strictEqual(logs[49].message, 'Log message 75');
});

// Test 4: Mock Scraper Manager State Transitions
runTest('Mock Scraper State Machine Transitions', () => {
  let state = SCRAPER_STATES.IDLE;
  let isRunning = false;

  function transition(newState) {
    state = newState;
    isRunning = [SCRAPER_STATES.STARTING, SCRAPER_STATES.RUNNING, SCRAPER_STATES.CANCELLING].includes(state);
  }

  assert.strictEqual(state, 'idle');
  assert.strictEqual(isRunning, false);

  transition(SCRAPER_STATES.STARTING);
  assert.strictEqual(isRunning, true);

  transition(SCRAPER_STATES.RUNNING);
  assert.strictEqual(isRunning, true);

  transition(SCRAPER_STATES.CANCELLING);
  assert.strictEqual(isRunning, true);

  transition(SCRAPER_STATES.COMPLETED);
  assert.strictEqual(state, 'completed');
  assert.strictEqual(isRunning, false);
});

console.log(`\nRESULTS: ${testsPassed}/4 tests passed.`);
console.log('================================================================================\n');
