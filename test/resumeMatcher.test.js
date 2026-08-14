const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ResumeMatcher } = require('../src/agents/resumeMatcher');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-matcher-'));

function addPdf(fileName, modifiedAt) {
    const filePath = path.join(testDir, fileName);
    fs.writeFileSync(filePath, '%PDF-1.4\n');
    fs.utimesSync(filePath, modifiedAt, modifiedAt);
    return filePath;
}

try {
    const oldChime = addPdf('nitishkandi_Chime_resume (1).pdf', new Date('2026-01-01T00:00:00Z'));
    const currentChime = addPdf('nitishkandi_Chime_resume (4).pdf', new Date('2026-04-01T00:00:00Z'));
    addPdf('nitishkandi_Chime_resume (2).pdf', new Date('2026-02-01T00:00:00Z'));
    addPdf('nitishkandi_Waystar_Inc_resume.pdf', new Date('2026-05-01T00:00:00Z'));
    addPdf('nitishkandi_The_Other_Company_resume.pdf', new Date('2026-06-01T00:00:00Z'));
    fs.mkdirSync(path.join(testDir, 'nitishkandi_Chime_resume (99).pdf'));

    const messages = [];
    const logger = {
        info: (message) => messages.push(message),
        warn: (message) => messages.push(message)
    };
    const matcher = new ResumeMatcher(logger, testDir);

    assert.strictEqual(matcher.findResumeForCompany('Chime'), currentChime, 'selects the newest exact company resume');
    assert.notStrictEqual(matcher.findResumeForCompany('Chime'), oldChime, 'does not select the first directory entry');
    assert.strictEqual(matcher.findResumeForCompany('Waystar'), null, 'does not treat a longer company name as an exact match');
    assert.strictEqual(matcher.findResumeForCompany('The Trade Desk'), null, 'does not fall back to a generic first-word match');
    assert.strictEqual(matcher.findResumeForCompany(''), null, 'rejects an empty company name');
    assert(messages.some((message) => message.includes('3 matching versions')), 'logs the selection and version count');

    console.log('resumeMatcher: all checks passed');
} finally {
    fs.rmSync(testDir, { recursive: true, force: true });
}
