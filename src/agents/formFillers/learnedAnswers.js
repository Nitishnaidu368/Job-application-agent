const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { bestOptionMatch } = require('../../clients/optionMatcher');

const STORE_PATH = path.join(__dirname, '..', '..', '..', 'data', 'learnedAnswers.json');
// Reusing a stored answer silently (no LLM call, no prompt) needs a higher bar than a
// merely-plausible match — same bar as a "confident" LLM answer, so a weaker label
// resemblance falls through to asking again instead of risking a wrong silent reuse.
const REUSE_THRESHOLD = 60;

let store = null;

function load() {
    if (store) return store;
    try {
        store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch (error) {
        store = [];
    }
    return store;
}

function persist() {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function optionsOverlap(a, b) {
    if (!a || !b) return !a && !b; // both null (free-text fields) counts as matching
    const normalize = (list) => new Set(list.map((o) => String(o).toLowerCase().trim()));
    const setA = normalize(a);
    const setB = normalize(b);
    for (const value of setA) {
        if (setB.has(value)) return true;
    }
    return false;
}

// Finds a previously learned answer for a question that's essentially the same one,
// even if the wording differs across companies' forms. Requires the elementType to match
// (a stored "text" answer shouldn't answer a "select"), and for constrained fields, the
// stored option set must overlap with the current field's real options too — guards
// against reusing an answer from a superficially similar-sounding but different dropdown.
function findMatch(label, elementType, options) {
    const candidates = load().filter((entry) => entry.elementType === elementType);
    if (!candidates.length) return null;

    const match = bestOptionMatch(label, candidates.map((entry) => entry.label));
    if (!match || match.score < REUSE_THRESHOLD) return null;

    const entry = candidates.find((e) => e.label === match.option);
    if (!entry) return null;
    if (!optionsOverlap(entry.options, options)) return null;

    return entry.answer;
}

function saveAnswer(label, elementType, options, answer) {
    const entries = load();
    const existing = entries.find((e) => e.label === label && e.elementType === elementType);
    if (existing) {
        existing.answer = answer;
        existing.options = options || null;
        existing.learnedAt = new Date().toISOString();
    } else {
        entries.push({ label, elementType, options: options || null, answer, learnedAt: new Date().toISOString() });
    }
    persist();
}

// Prompts in the terminal for an answer to a question that has no confident match
// anywhere (learned store, LLM). Returns null if the user types "skip", which preserves
// today's behavior of leaving the field blank and flagging it for later review.
async function promptForAnswer(label, elementType, options) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

    try {
        const optionsLine = options ? `\nOptions: ${options.join(' | ')}` : '';
        console.log(`\nNEW QUESTION: "${label}"${optionsLine}`);

        for (;;) {
            const raw = (await ask('Your answer (or "skip"): ')).trim();
            if (!raw) continue;
            if (raw.toLowerCase() === 'skip') return null;

            if (!options) return raw;

            const match = bestOptionMatch(raw, options);
            if (match) return match.option;

            console.log(`That doesn't match any listed option. Options: ${options.join(' | ')}`);
        }
    } finally {
        rl.close();
    }
}

module.exports = { findMatch, saveAnswer, promptForAnswer };
