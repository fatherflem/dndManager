import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withTimeout} from '../src/shared/timeout.js';
test('unresponsive Foundry actions produce bounded connection errors',async()=>{await assert.rejects(withTimeout(new Promise(()=>{}),10),/timed out/);});
test('action wrappers retain real failures and successful results',async()=>{assert.equal(await withTimeout(Promise.resolve(73)),73);await assert.rejects(withTimeout(Promise.reject(new Error('Scene missing'))),/Scene missing/);});
