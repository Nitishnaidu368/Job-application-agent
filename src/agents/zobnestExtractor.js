const { chromium } = require('playwright');
const { config } = require('../config');

class ZobnestExtractor {
    constructor(logger) {
        this.logger = logger;
    }

    async extract() {
        this.logger.info(`Opening ZobNest dashboard: ${config.zobnest.dashboardUrl}`);
        const browser = await chromium.launch({ headless: config.playwright.headless });

        try {
            const page = await browser.newPage();
            page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
            page.setDefaultTimeout(config.playwright.actionTimeoutMs);

            await page.goto(config.zobnest.dashboardUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            const jobs = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                const candidates = anchors
                    .map((a) => {
                        const url = a.href || '';
                        const text = (a.textContent || '').trim();
                        if (!url) return null;

                        const looksLikeApplyUrl = /(lever|ashby|greenhouse|boards\.)/i.test(url);
                        if (!looksLikeApplyUrl) return null;

                        const row = a.closest('tr');
                        let company = '';
                        let location = '';

                        if (row) {
                            const cells = Array.from(row.querySelectorAll('td')).map((td) => (td.textContent || '').trim()).filter(Boolean);
                            company = cells[0] || '';
                            location = cells[1] || '';
                        }

                        return {
                            company: company || text || 'Unknown Company',
                            location: location || 'Unknown',
                            applicationUrl: url
                        };
                    })
                    .filter(Boolean);

                const unique = [];
                const seen = new Set();
                for (const job of candidates) {
                    if (!seen.has(job.applicationUrl)) {
                        seen.add(job.applicationUrl);
                        unique.push(job);
                    }
                }

                return unique;
            });

            this.logger.info(`Extracted ${jobs.length} potential jobs from dashboard.`);
            return jobs;
        } finally {
            await browser.close();
        }
    }
}

module.exports = { ZobnestExtractor };
