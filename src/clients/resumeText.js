const fs = require('fs');
const pdfParse = require('pdf-parse');

const cache = new Map();
const MAX_CHARS = 4000;

async function extractResumeText(resumePath) {
    if (!resumePath || !fs.existsSync(resumePath)) return '';
    if (cache.has(resumePath)) return cache.get(resumePath);

    try {
        const data = await pdfParse(fs.readFileSync(resumePath));
        const text = (data.text || '').trim().slice(0, MAX_CHARS);
        cache.set(resumePath, text);
        return text;
    } catch (error) {
        cache.set(resumePath, '');
        return '';
    }
}

module.exports = { extractResumeText };
