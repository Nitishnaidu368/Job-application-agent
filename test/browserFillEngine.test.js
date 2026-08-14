const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// browserFillEngine.js is injected into the page as raw source text (see
// fillEngineRunner.js), not loaded as a Node module — evaluate it in a minimal sandbox
// (just enough `window` for the top-level self-registration check) to exercise the pure
// label-matching logic exposed on __debug for testing.
const source = fs.readFileSync(path.join(__dirname, '../src/agents/formFillers/browserFillEngine.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const { identifyFieldType } = sandbox.window.__jobAgentFillEngine.__debug;

assert.strictEqual(identifyFieldType('City*', '').type, 'city', 'a trailing "*" required-marker does not block an exact label match');
assert.strictEqual(identifyFieldType('Country*', '').type, 'country', 'same for country');
assert.strictEqual(identifyFieldType('State*', '').type, 'state', 'same for state');
assert.strictEqual(identifyFieldType('Address*', '').type, 'address', 'same for address');
assert.strictEqual(identifyFieldType('City *', '').type, 'city', 'a space before the marker is also handled');
assert.strictEqual(identifyFieldType('City (required)', '').type, 'city', 'an explicit "(required)" suffix is also handled');
assert.strictEqual(
    identifyFieldType('City*', 'job_application_answers_0_text_value').type,
    'city',
    'noisy generated id/name context appended after the label does not break the anchored match'
);
assert.strictEqual(identifyFieldType('Address Line 1*', '').type, 'address', 'an "Address Line 1"-style label is recognized');
assert.strictEqual(identifyFieldType('Street Address', '').type, 'address', 'a "Street Address" label is recognized');
assert.strictEqual(identifyFieldType('Favorite color*', '').type, 'unknown', 'an unrelated label is still unrecognized');

console.log('browserFillEngine: all checks passed');
