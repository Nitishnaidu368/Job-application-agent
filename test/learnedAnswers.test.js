const assert = require('assert');
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'learnedAnswers.json');
const backup = fs.existsSync(STORE_PATH) ? fs.readFileSync(STORE_PATH, 'utf8') : null;
fs.rmSync(STORE_PATH, { force: true });

const learnedAnswers = require('../src/agents/formFillers/learnedAnswers');

const visaOptions = ['US Citizen', 'Green Card Holder', 'Requires Sponsorship', 'Other'];

(async () => {
    assert.strictEqual(await learnedAnswers.findMatch('Visa status', 'select', visaOptions), null, 'no answer stored yet');

    learnedAnswers.saveAnswer('Visa status', 'select', visaOptions, 'US Citizen');

    assert.strictEqual(
        await learnedAnswers.findMatch('Visa status', 'select', visaOptions),
        'US Citizen',
        'exact label + matching options reuses the stored answer'
    );
    assert.strictEqual(
        await learnedAnswers.findMatch('visa status', 'select', visaOptions),
        'US Citizen',
        'a case-insensitive label variant (same field type, overlapping options) reuses the stored answer'
    );
    assert.strictEqual(
        await learnedAnswers.findMatch('Visa', 'select', visaOptions),
        'US Citizen',
        'a shorter prefix-like label variant still reuses the stored answer above the reuse threshold'
    );
    assert.strictEqual(
        await learnedAnswers.findMatch('Favorite color', 'select', ['Red', 'Blue', 'Green']),
        null,
        'an unrelated label does not reuse the stored answer'
    );
    assert.strictEqual(
        await learnedAnswers.findMatch('Visa status', 'select', ['Red', 'Blue', 'Green']),
        null,
        'a similar label with a non-overlapping option set does not reuse the stored answer (guards against cross-field reuse)'
    );
    assert.strictEqual(
        await learnedAnswers.findMatch('Visa status', 'text', null),
        null,
        'a mismatched elementType does not reuse the stored answer'
    );

    learnedAnswers.saveAnswer('Notice period', 'text', null, '2 weeks');
    assert.strictEqual(await learnedAnswers.findMatch('Notice period', 'text', null), '2 weeks', 'free-text answers round-trip too');

    // Semantic tier: a real paraphrase the string scorer can't see (too different in length/
    // wording to hit the reuse threshold) should still resolve, via a claudeClient stub.
    const paraphrase = 'Do you need or require any kind of future sponsorship that the company can provide you?';
    learnedAnswers.saveAnswer('Do you need sponsorship?', 'radio-group', ['Yes', 'No'], 'No');

    const matchingClaudeClient = { matchSimilarQuestion: async () => 'Do you need sponsorship?' };
    assert.strictEqual(
        await learnedAnswers.findMatch(paraphrase, 'radio-group', ['Yes', 'No'], matchingClaudeClient, console),
        'No',
        'a semantic match (via claudeClient) reuses the stored answer for a differently-worded question'
    );

    const noMatchClaudeClient = { matchSimilarQuestion: async () => null };
    assert.strictEqual(
        await learnedAnswers.findMatch('What is your favorite programming language?', 'radio-group', ['Yes', 'No'], noMatchClaudeClient, console),
        null,
        'an unrelated question with no semantic match still misses'
    );
    assert.strictEqual(
        await learnedAnswers.findMatch(paraphrase, 'radio-group', ['Yes', 'No']),
        null,
        'without a claudeClient, the semantic tier is skipped and the miss stays a miss'
    );

    fs.rmSync(STORE_PATH, { force: true });
    if (backup !== null) fs.writeFileSync(STORE_PATH, backup, 'utf8');

    console.log('learnedAnswers: all checks passed');
})();
