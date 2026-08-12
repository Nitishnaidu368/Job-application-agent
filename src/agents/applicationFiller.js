const { chromium } = require('playwright');
const { config } = require('../config');
const { ClaudeClient } = require('../clients/claudeClient');
const { LeverFiller } = require('./formFillers/leverFiller');
const { AshbyFiller } = require('./formFillers/ashbyFiller');
const { GreenhouseFiller } = require('./formFillers/greenhouseFiller');

const APPLICATION_FORM_SELECTOR = [
    'input[type="file"]',
    'input[type="email"]',
    'textarea',
    'form[action*="apply" i]',
    'form[id*="application" i]'
].join(', ');

const SUBMISSION_CONFIRMATION = /thank you|application (?:has been )?(?:received|submitted)|successfully submitted|submission received/i;

function isSubmissionComplete({ currentUrl, reviewUrl, bodyText, formFieldCount, formWasPresent }) {
    return currentUrl !== reviewUrl ||
        SUBMISSION_CONFIRMATION.test(bodyText) ||
        (formWasPresent && formFieldCount === 0);
}

class ApplicationFiller {
    constructor(logger) {
        this.logger = logger;
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

    async hasApplicationForm(page) {
        return (await page.locator(APPLICATION_FORM_SELECTOR).count()) > 0;
    }

    async openApplicationForm(page) {
        if (await this.hasApplicationForm(page)) return page;

        const applyName = /^(apply|apply now|apply for this job|apply to this job)$/i;
        const applyControl = page.getByRole('link', { name: applyName })
            .or(page.getByRole('button', { name: applyName }))
            .first();

        // .count() checks the DOM synchronously with no retry, but client-rendered SPAs (e.g.
        // Ashby) haven't painted the Apply control yet at domcontentloaded — waitFor actually
        // waits for it to appear instead of racing the page's own JS render.
        try {
            await applyControl.waitFor({ state: 'visible', timeout: config.playwright.actionTimeoutMs });
        } catch (error) {
            throw new Error('Application form and Apply control were not found on the job page.');
        }

        this.logger.info('Opening the application form.');
        const newPagePromise = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null);
        await applyControl.click();
        const newPage = await newPagePromise;
        const formPage = newPage || page;

        await formPage.waitForLoadState('domcontentloaded').catch(() => { });
        await formPage.locator(APPLICATION_FORM_SELECTOR).first().waitFor({
            state: 'attached',
            timeout: config.playwright.actionTimeoutMs
        });
        return formPage;
    }

    async waitForManualSubmission(page) {
        const reviewUrl = page.url();
        const formWasPresent = await this.hasApplicationForm(page);

        this.logger.info('Application filled. Review it in the browser and click Submit yourself.');

        try {
            await page.waitForFunction(
                ({ formSelector, reviewUrl, formWasPresent, pattern, flags }) => {
                    const bodyText = document.body?.innerText || '';
                    const formFieldCount = document.querySelectorAll(formSelector).length;
                    return window.location.href !== reviewUrl ||
                        new RegExp(pattern, flags).test(bodyText) ||
                        (formWasPresent && formFieldCount === 0);
                },
                {
                    formSelector: APPLICATION_FORM_SELECTOR,
                    reviewUrl,
                    formWasPresent,
                    pattern: SUBMISSION_CONFIRMATION.source,
                    flags: SUBMISSION_CONFIRMATION.flags
                },
                { polling: 1000, timeout: 0 }
            );
        } catch (error) {
            throw new Error('Application page was closed before submission was confirmed.');
        }

        this.logger.info('Manual submission detected. Continuing to the next job.');
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
                result.status = 'ready_for_review';
                return result;
            }

            const resumePath = job.resumePath;
            if (!resumePath) {
                result.status = 'skipped';
                result.error = `No resume downloaded for ${job.company}`;
                return result;
            }
            result.resumePath = resumePath;

            const filler = this.getFiller(result.platform);
            if (!filler) {
                result.status = 'failed';
                result.error = `Unsupported platform: ${result.platform}`;
                return result;
            }

            const launchOptions = { headless: config.playwright.headless };
            if (config.playwright.executablePath) {
                launchOptions.executablePath = config.playwright.executablePath;
            }

            const browser = await chromium.launch(launchOptions);
            try {
                let page = await browser.newPage();
                page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
                page.setDefaultTimeout(config.playwright.actionTimeoutMs);

                await page.goto(job.applicationUrl, { waitUntil: 'domcontentloaded' });
                page = await this.openApplicationForm(page);
                page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
                page.setDefaultTimeout(config.playwright.actionTimeoutMs);
                await filler.fillForm(page, job, resumePath);

                await this.waitForManualSubmission(page);

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

module.exports = { ApplicationFiller, isSubmissionComplete };
