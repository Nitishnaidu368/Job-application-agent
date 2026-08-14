#!/usr/bin/env node
const { chromium } = require('playwright');
const { config } = require('../src/config');
const { logger } = require('../src/logger');
const { ApplicationFiller } = require('../src/agents/applicationFiller');
const { runFillEngine } = require('../src/agents/formFillers/fillEngineRunner');

const TARGET_COMPANIES = (process.argv[2] || 'FieldAI,Fivetran,Nextdoor,Commvault,BJAK').split(',');

async function auditJob(applicationFiller, job) {
    const browser = await chromium.launch({ headless: config.playwright.headless });
    try {
        let page = await browser.newPage();
        page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
        page.setDefaultTimeout(config.playwright.actionTimeoutMs);
        await page.goto(job.applicationUrl, { waitUntil: 'domcontentloaded' });
        page = await applicationFiller.openApplicationForm(page);
        return await runFillEngine(page, config.userProfile, job.location);
    } finally {
        await browser.close();
    }
}

async function main() {
    const jobs = require('../output/manual-jobs.json').filter((j) => TARGET_COMPANIES.includes(j.company));
    if (!jobs.length) {
        console.error(`No jobs matching [${TARGET_COMPANIES.join(', ')}] found in output/manual-jobs.json`);
        process.exit(1);
    }

    const applicationFiller = new ApplicationFiller(logger);
    const gaps = new Map();

    const failures = [];

    for (const job of jobs) {
        logger.info(`Auditing ${job.company}...`);
        try {
            const summary = await auditJob(applicationFiller, job);
            summary.results
                .filter((r) => !r.success)
                .forEach((r) => {
                    if (!gaps.has(r.fieldType)) gaps.set(r.fieldType, { label: r.label, companies: new Set() });
                    gaps.get(r.fieldType).companies.add(job.company);
                });
        } catch (error) {
            logger.warn(`Skipping ${job.company}: ${error.message}`);
            failures.push({ company: job.company, error: error.message });
        }
    }

    if (failures.length) {
        console.log('\nJobs that could not be audited:\n');
        failures.forEach(({ company, error }) => console.log(`- ${company}: ${error}`));
    }

    console.log('\nUnfilled fields across audited applications:\n');
    for (const [fieldType, { label, companies }] of gaps) {
        console.log(`- ${fieldType} ("${label}") — seen on: ${[...companies].join(', ')}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
