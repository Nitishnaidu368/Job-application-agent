const { chromium } = require('playwright');
const { config } = require('../config');

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

    async extract() {
        this.logger.info(`Opening ZobNest dashboard: ${config.zobnest.dashboardUrl}`);
        const session = await this.openDashboardPage();

        try {
            const { page } = session;
            page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
            page.setDefaultTimeout(config.playwright.actionTimeoutMs);

            await page.goto(config.zobnest.dashboardUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            let payload = await page.evaluate(() => {
                const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
                const bodyText = normalizeText(document.body?.innerText || '');

                if (/client login required/i.test(bodyText) || /login required/i.test(bodyText)) {
                    return { loginRequired: true, jobs: [] };
                }

                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'));
                const heading = headings.find((node) => /latest jobs/i.test(normalizeText(node.textContent)));
                const sectionRoot = heading?.closest('section, article, div, main, table') || heading?.parentElement || document.body;

                const candidateElements = Array.from(
                    sectionRoot.querySelectorAll('a[href], button, [role="button"], [data-href], [data-url], [onclick]')
                );

                const jobs = [];
                const seen = new Set();

                for (const element of candidateElements) {
                    const href = element.href || element.getAttribute('data-href') || element.getAttribute('data-url') || '';
                    const text = normalizeText(element.textContent || element.innerText || '');
                    const container = element.closest('tr, li, article, section, div, .card, .job, .job-card, .table-row');
                    const containerText = normalizeText(container?.innerText || text);
                    const applicationUrl = href && /^https?:\/\//i.test(href) ? href : '';
                    const looksLikeApplicationLink = /(lever|ashby|greenhouse|boards\.|jobs\.)/i.test(applicationUrl);
                    const looksLikeJobCard = /apply|view job|open role|job details|latest jobs/i.test(containerText) || /apply|view job|open role|job details/i.test(text);

                    if (!applicationUrl || (!looksLikeApplicationLink && !looksLikeJobCard)) {
                        continue;
                    }

                    const cells = container ? Array.from(container.querySelectorAll('td, .cell, [data-label]')) : [];
                    const company = normalizeText(
                        cells[0]?.textContent ||
                        container?.querySelector('[data-company]')?.textContent ||
                        container?.querySelector('.company')?.textContent ||
                        containerText.split(/\s{2,}|\n/)[0] ||
                        text
                    );
                    const location = normalizeText(
                        cells[1]?.textContent ||
                        container?.querySelector('[data-location]')?.textContent ||
                        container?.querySelector('.location')?.textContent ||
                        containerText.split(/\s{2,}|\n/)[1] ||
                        'Unknown'
                    );

                    if (seen.has(applicationUrl)) continue;
                    seen.add(applicationUrl);
                    jobs.push({
                        company: company || 'Unknown Company',
                        location: location || 'Unknown',
                        applicationUrl
                    });
                }

                return { loginRequired: false, jobs };
            });

            if (payload.loginRequired) {
                await this.signIn(page);
                await page.goto(config.zobnest.dashboardUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(2000);
                payload = await page.evaluate(() => {
                    const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
                    const bodyText = normalizeText(document.body?.innerText || '');

                    if (/client login required/i.test(bodyText) || /login required/i.test(bodyText)) {
                        return { loginRequired: true, jobs: [] };
                    }

                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'));
                    const heading = headings.find((node) => /latest jobs/i.test(normalizeText(node.textContent)));
                    const sectionRoot = heading?.closest('section, article, div, main, table') || heading?.parentElement || document.body;

                    const candidateElements = Array.from(
                        sectionRoot.querySelectorAll('a[href], button, [role="button"], [data-href], [data-url], [onclick]')
                    );

                    const jobs = [];
                    const seen = new Set();

                    for (const element of candidateElements) {
                        const href = element.href || element.getAttribute('data-href') || element.getAttribute('data-url') || '';
                        const text = normalizeText(element.textContent || element.innerText || '');
                        const container = element.closest('tr, li, article, section, div, .card, .job, .job-card, .table-row');
                        const containerText = normalizeText(container?.innerText || text);
                        const applicationUrl = href && /^https?:\/\//i.test(href) ? href : '';
                        const looksLikeApplicationLink = /(lever|ashby|greenhouse|boards\.|jobs\.)/i.test(applicationUrl);
                        const looksLikeJobCard = /apply|view job|open role|job details|latest jobs/i.test(containerText) || /apply|view job|open role|job details/i.test(text);

                        if (!applicationUrl || (!looksLikeApplicationLink && !looksLikeJobCard)) {
                            continue;
                        }

                        const cells = container ? Array.from(container.querySelectorAll('td, .cell, [data-label]')) : [];
                        const company = normalizeText(
                            cells[0]?.textContent ||
                            container?.querySelector('[data-company]')?.textContent ||
                            container?.querySelector('.company')?.textContent ||
                            containerText.split(/\s{2,}|\n/)[0] ||
                            text
                        );
                        const location = normalizeText(
                            cells[1]?.textContent ||
                            container?.querySelector('[data-location]')?.textContent ||
                            container?.querySelector('.location')?.textContent ||
                            containerText.split(/\s{2,}|\n/)[1] ||
                            'Unknown'
                        );

                        if (seen.has(applicationUrl)) continue;
                        seen.add(applicationUrl);
                        jobs.push({
                            company: company || 'Unknown Company',
                            location: location || 'Unknown',
                            applicationUrl
                        });
                    }

                    return { loginRequired: false, jobs };
                });

                if (payload.loginRequired) {
                    throw new Error('ZobNest login failed. Verify ZOBNEST_USERNAME and ZOBNEST_PASSWORD in .env.');
                }
            }

            const jobs = payload.jobs;

            this.logger.info(`Extracted ${jobs.length} potential jobs from dashboard.`);
            return jobs;
        } finally {
            await session.close();
        }
    }
}

module.exports = { ZobnestExtractor };
