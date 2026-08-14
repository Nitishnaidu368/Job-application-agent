// Shared fuzzy-match scorer: mirrors selectBestOption() in browserFillEngine.js so a
// candidate answer/label can be scored against a list of real strings (dropdown options,
// or previously-seen question labels) consistently everywhere it's needed.
function bestOptionMatch(answer, options) {
    const normalizedValue = String(answer || '').toLowerCase().trim();
    if (!normalizedValue || !Array.isArray(options) || !options.length) return null;

    let best = null;
    for (const option of options) {
        const normalizedText = String(option).toLowerCase().trim();
        if (!normalizedText) continue;

        let score = 0;
        if (normalizedText === normalizedValue) score = 100;
        else if (normalizedText.startsWith(normalizedValue)) score = 80;
        else if (normalizedText.includes(normalizedValue)) score = 60;
        else if (normalizedValue.includes(normalizedText)) score = 40;
        else {
            const valueWords = normalizedValue.split(/\s+/);
            const textWords = normalizedText.split(/\s+/);
            const matched = valueWords.filter((w) => textWords.some((tw) => tw.includes(w) || w.includes(tw)));
            if (matched.length > 0) score = (matched.length / valueWords.length) * 30;
        }

        if (score > 0 && (!best || score > best.score)) best = { option, score };
    }

    return best && best.score >= 30 ? best : null;
}

module.exports = { bestOptionMatch };
