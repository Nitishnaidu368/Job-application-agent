const assert = require('assert');
const { config } = require('../src/config');
const { ClaudeClient } = require('../src/clients/claudeClient');
const { bestOptionMatch } = require('../src/clients/optionMatcher');

const client = new ClaudeClient(console);

// bestOptionMatch: confident, low-confidence, and no-match cases against a real option list.
const visaOptions = ['US Citizen', 'Green Card Holder', 'Requires Sponsorship', 'Other'];

assert.strictEqual(bestOptionMatch('US Citizen', visaOptions).option, 'US Citizen', 'exact match resolves');
assert.strictEqual(bestOptionMatch('us citizen', visaOptions).score, 100, 'case-insensitive exact match scores 100');
assert.strictEqual(bestOptionMatch('Nonsense answer with no overlap', visaOptions), null, 'unrelated text has no confident match');
assert.strictEqual(bestOptionMatch('', visaOptions), null, 'empty answer has no match');

// resolveConstrainedAnswer: high vs low confidence tiers, and the null (unresolved) case.
assert.strictEqual(client.resolveConstrainedAnswer('US Citizen', visaOptions).confidence, 'high', 'exact match is high confidence');
assert.strictEqual(client.resolveConstrainedAnswer('nothing like these options', visaOptions).value, null, 'no match resolves to null, not options[0]');

// generateBatchResponses in template-only mode (no network) must never default a constrained
// field to options[0] when unresolved — it should flag it instead.
config.llm.provider = 'template-only';
(async () => {
    const { answers, flagged } = await client.generateBatchResponses({
        questions: [{ id: 'q1', question: 'Visa status', options: visaOptions }],
        job: { company: 'Acme', location: 'Remote' },
        userProfile: { fullName: 'Test User', experiences: [{ company: 'Acme' }] },
        resumeText: ''
    });

    assert.strictEqual(answers.q1, null, 'unresolved constrained field is null, not options[0]');
    assert.strictEqual(flagged.length, 1, 'unresolved constrained field is flagged for review');

    console.log('claudeClient: all checks passed');
})();
