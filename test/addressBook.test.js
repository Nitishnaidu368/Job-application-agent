const assert = require('assert');
const { resolveAddress } = require('../src/agents/formFillers/addressBook');

const sf = resolveAddress('San Francisco, CA');
assert.strictEqual(sf.city, 'San Francisco', 'resolves a known city');
assert.strictEqual(sf.country, 'United States', 'a US state resolves to United States');

const toronto = resolveAddress('Toronto, ON');
assert.strictEqual(toronto.country, 'Canada', 'the one Canadian entry resolves to Canada');

const unknownCity = resolveAddress('Boise, ID');
assert.strictEqual(unknownCity.city, 'Boise', 'an unknown city still returns the job\'s real city');
assert.strictEqual(unknownCity.state, 'ID', 'an unknown city still returns the job\'s real state');
assert.strictEqual(unknownCity.country, 'United States', 'a synthesized US entry still resolves to United States');

assert.strictEqual(resolveAddress('Remote'), null, 'an unparsable location resolves to null');

console.log('addressBook: all checks passed');
