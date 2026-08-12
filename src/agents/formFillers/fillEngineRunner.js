const fs = require('fs');
const path = require('path');
const { buildBrowserProfile } = require('./profileAdapter');

const ENGINE_SCRIPT_PATH = path.join(__dirname, 'browserFillEngine.js');
const ENGINE_SOURCE = fs.readFileSync(ENGINE_SCRIPT_PATH, 'utf8');

async function runFillEngine(page, userProfile, jobLocation) {
    // page.addScriptTag() injects a literal <script> tag, which some ATS pages (Ashby) block
    // via a strict Content-Security-Policy. page.evaluate() executes via CDP instead of a DOM
    // <script> tag, so it isn't subject to the page's script-src CSP the same way.
    await page.evaluate(ENGINE_SOURCE);
    const profile = buildBrowserProfile(userProfile, jobLocation);
    return page.evaluate((p) => window.__jobAgentFillEngine.fillApplication(p), profile);
}

module.exports = { runFillEngine };
