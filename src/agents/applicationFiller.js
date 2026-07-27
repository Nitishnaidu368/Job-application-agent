const { chromium } = require('playwright');
const { config } = require('../config');
const { ClaudeClient } = require('../clients/claudeClient');
const { ResumeMatcher } = require('./resumeMatcher');
const { LeverFiller } = require('./formFillers/leverFiller');
const { AshbyFiller } = require('./formFillers/ashbyFiller');
const { GreenhouseFiller } = require('./formFillers/greenhouseFiller');

class ApplicationFiller {
    constructor(logger) {
        this.logger = logger;
        this.resumeMatcher = new ResumeMatcher(logger);
        this.claudeClient = new ClaudeClient(logger);
    }

    detectPlatform(url) {
        const value = String(url || '').toLowerCase();
        if (value.includes('lever')) return 'lever';
        if (value.includes('ashby')) return 'ashby';
        if (value.includes('greenhouse')) return 'greenhouse';
        return 'unknown';
    }

    getFiller(platform) {
        const common = {
            logger: this.logger,
            claudeClient: this.claudeClient,
            userProfile: config.userProfile
        };

        if (platform === 'lever') return new LeverFiller(common);
        if (platform === 'ashby') return new AshbyFiller(common);
        if (platform === 'greenhouse') return new GreenhouseFiller(common);
        return null;
    }

    async applyToJob(job, runId) {
        const result = {
            runId,
            company: job.company,
            location: job.location,
            applicationUrl: job.applicationUrl,
            platform: this.detectPlatform(job.applicationUrl),
            status: 'skipped',
            error: null,
            resumePath: null,
            submittedAt: null
        };

        try {
            if (config.runtime.dryRun) {
                result.resumePath = `/dry-run/nitishkandi_${job.company.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_resume.pdf`;
                result.status = 'submitted';
                result.submittedAt = new Date().toISOString();
                return result;
            }

            const resumePath = this.resumeMatcher.findResumeForCompany(job.company);
            if (!resumePath) {
                result.status = 'skipped';
                result.error = `No resume found for ${job.company}`;
                return result;
            }
            result.resumePath = resumePath;

            const filler = this.getFiller(result.platform);
            if (!filler) {
                result.status = 'failed';
                result.error = `Unsupported platform: ${result.platform}`;
                return result;
            }

            const browser = await chromium.launch({ headless: config.playwright.headless });
            try {
                const page = await browser.newPage();
                page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
                page.setDefaultTimeout(config.playwright.actionTimeoutMs);

                await page.goto(job.applicationUrl, { waitUntil: 'domcontentloaded' });
                await filler.fillForm(page, job, resumePath);

                const submitButton = page.locator('button:has-text("Submit"), button:has-text("Apply"), input[type="submit"]').first();
                if (await submitButton.count()) {
                    await submitButton.click();
                    await page.waitForTimeout(2000);
                }

                result.status = 'submitted';
                result.submittedAt = new Date().toISOString();
            } finally {
                await browser.close();
            }
        } catch (error) {
            result.status = 'failed';
            result.error = error.message;
        }

        return result;
    }

    async processJobs(jobs, runId) {
        const results = [];
        for (const job of jobs) {
            this.logger.info(`Processing ${job.company} (${job.applicationUrl})`);
            const result = await this.applyToJob(job, runId);
            results.push(result);
            this.logger.info(`Result for ${job.company}: ${result.status}${result.error ? ` (${result.error})` : ''}`);
        }
        return results;
    }
}

module.exports = { ApplicationFiller };
