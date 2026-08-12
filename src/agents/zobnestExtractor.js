const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config } = require('../config');

const SUPPORTED_PLATFORM = /(lever|ashby|greenhouse)/i;

class ZobnestExtractor {
    constructor(logger) {
        this.logger = logger;
    }

    hasLoginCredentials() {
        return Boolean(config.zobnest.username && config.zobnest.password);
    }

    async signIn(page) {
        if (!this.hasLoginCredentials()) {
            throw new Error('ZobNest login required. Set ZOBNEST_USERNAME and ZOBNEST_PASSWORD in .env, then retry the run.');
        }

        this.logger.info('Signing in to ZobNest with configured credentials.');
        await page.goto(config.zobnest.loginUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        await page.locator('input[name="username"], input[placeholder*="username" i]').first().fill(config.zobnest.username);
        await page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]').first().fill(config.zobnest.password);

        const submitButton = page.locator('button[type="submit"], button:has-text("Sign In"), input[type="submit"]').first();
        await Promise.all([
            page.waitForLoadState('domcontentloaded').catch(() => { }),
            submitButton.click()
        ]);

        await page.waitForTimeout(2000);
    }

    async openDashboardPage() {
        if (config.playwright.userDataDir) {
            const context = await chromium.launchPersistentContext(config.playwright.userDataDir, {
                headless: config.playwright.headless,
                ...(config.playwright.executablePath ? { executablePath: config.playwright.executablePath } : {})
            });
            const page = context.pages()[0] || (await context.newPage());
            return { page, close: () => context.close() };
        }

        const launchOptions = { headless: config.playwright.headless };
        if (config.playwright.executablePath) {
            launchOptions.executablePath = config.playwright.executablePath;
        }

        const browser = await chromium.launch(launchOptions);
        const context = await browser.newContext();
        const page = await context.newPage();
        return { page, close: () => browser.close() };
    }

    async isLoginRequired(page) {
        return page.evaluate(() => {
            const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
            return /client login required|login required/i.test(bodyText);
        });
    }

    async downloadResume(page, href, runId) {
        const absoluteUrl = new URL(href, config.zobnest.dashboardUrl).toString();
        const response = await page.context().request.get(absoluteUrl);

        if (!response.ok()) {
            this.logger.warn(`Resume download failed for run ${runId}: HTTP ${response.status()}`);
            return null;
        }

        fs.mkdirSync(config.paths.resumesDir, { recursive: true });
        const targetPath = path.join(config.paths.resumesDir, `zobnest_run_${runId}_resume.pdf`);
        fs.writeFileSync(targetPath, await response.body());
        return targetPath;
    }

    async extractRows(page) {
        const rows = page.locator('tr.job-row');
        const count = await rows.count();
        const jobs = [];

        for (let i = 0; i < count; i += 1) {
            const row = rows.nth(i);
            const runId = await row.getAttribute('data-run-id');

            const companyLink = row.locator('td.col-company a').first();
            const applicationUrl = (await companyLink.getAttribute('href')) || '';
            const company = (await companyLink.innerText()).trim();
            const location = (await row.locator('td.col-location').innerText()).trim();
            const status = (await row.locator('td.col-status').innerText()).trim();

            if (!SUPPORTED_PLATFORM.test(applicationUrl)) {
                this.logger.debug(`Skipping run ${runId} (${company}): unsupported platform.`);
                continue;
            }

            if (!/completed/i.test(status)) {
                this.logger.debug(`Skipping run ${runId} (${company}): resume status is "${status}".`);
                continue;
            }

            const pdfLink = row.locator('td.col-file a[href$="/pdf"]').first();
            const href = (await pdfLink.count()) ? await pdfLink.getAttribute('href') : null;
            const resumePath = href ? await this.downloadResume(page, href, runId) : null;

            if (!resumePath) {
                this.logger.warn(`No resume downloaded for run ${runId} (${company}); this job will be skipped when applying.`);
            }

            jobs.push({
                zobnestRunId: runId,
                company: company || 'Unknown Company',
                location: location || 'Unknown',
                applicationUrl,
                resumePath
            });
        }

        return jobs;
    }

    async extract() {
        this.logger.info(`Opening ZobNest dashboard: ${config.zobnest.dashboardUrl}`);
        const session = await this.openDashboardPage();

        try {
            const { page } = session;
            page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
            page.setDefaultTimeout(config.playwright.actionTimeoutMs);

            await page.goto(config.zobnest.dashboardUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            if (await this.isLoginRequired(page)) {
                await this.signIn(page);
                await page.goto(config.zobnest.dashboardUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(2000);

                if (await this.isLoginRequired(page)) {
                    throw new Error('ZobNest login failed. Verify ZOBNEST_USERNAME and ZOBNEST_PASSWORD in .env.');
                }
            }

            const jobs = await this.extractRows(page);
            this.logger.info(`Extracted ${jobs.length} applicable jobs from dashboard (supported platform + completed resume).`);
            return jobs;
        } finally {
            await session.close();
        }
    }
}

module.exports = { ZobnestExtractor };
