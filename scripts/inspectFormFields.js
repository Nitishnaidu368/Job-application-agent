#!/usr/bin/env node
const { chromium } = require('playwright');
const { config } = require('../src/config');
const { logger } = require('../src/logger');
const { ApplicationFiller } = require('../src/agents/applicationFiller');

const companyArg = process.argv[2] || 'Bandwidth';

async function main() {
    const jobs = require('../output/manual-jobs.json');
    const job = jobs.find((j) => j.company.toLowerCase() === companyArg.toLowerCase());
    if (!job) {
        throw new Error(`No job found for company "${companyArg}" in output/manual-jobs.json`);
    }

    const applicationFiller = new ApplicationFiller(logger);
    const platform = applicationFiller.detectPlatform(job.applicationUrl);
    const filler = applicationFiller.getFiller(platform);

    const browser = await chromium.launch({ headless: config.playwright.headless });
    try {
        let page = await browser.newPage();
        page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
        page.setDefaultTimeout(config.playwright.actionTimeoutMs);

        await page.goto(job.applicationUrl, { waitUntil: 'domcontentloaded' });
        page = await applicationFiller.openApplicationForm(page);
        page.setDefaultNavigationTimeout(config.playwright.navTimeoutMs);
        page.setDefaultTimeout(config.playwright.actionTimeoutMs);

        await filler.fillForm(page, job, job.resumePath);

        const screenshotPath = `output/inspect-${companyArg.toLowerCase()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info(`Saved screenshot to ${screenshotPath}`);

        const fieldReport = await page.evaluate(() => {
            const labelFor = (el) => {
                if (el.id) {
                    const byFor = document.querySelector(`label[for="${el.id}"]`);
                    if (byFor) return byFor.innerText.trim();
                }
                const wrappingLabel = el.closest('label');
                if (wrappingLabel) return wrappingLabel.innerText.trim();
                const legend = el.closest('fieldset')?.querySelector('legend');
                if (legend) return legend.innerText.trim();
                return el.getAttribute('aria-label') || el.name || el.id || '(no label found)';
            };

            const selects = Array.from(document.querySelectorAll('select')).map((el) => ({
                label: labelFor(el),
                name: el.name,
                selectedValue: el.value,
                options: Array.from(el.options).map((o) => o.text).slice(0, 6)
            }));

            const radioGroups = {};
            document.querySelectorAll('input[type="radio"]').forEach((el) => {
                const key = el.name || '(unnamed)';
                if (!radioGroups[key]) radioGroups[key] = { label: labelFor(el), checked: null, optionCount: 0 };
                radioGroups[key].optionCount += 1;
                if (el.checked) radioGroups[key].checked = el.value;
            });

            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).map((el) => ({
                label: labelFor(el),
                checked: el.checked
            }));

            const textareas = Array.from(document.querySelectorAll('textarea')).map((el) => ({
                label: labelFor(el),
                value: el.value ? `${el.value.slice(0, 80)}...` : '(empty)'
            }));

            const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((el) => ({
                label: labelFor(el),
                hasFiles: el.files.length > 0
            }));

            return { selects, radioGroups, checkboxes, textareas, fileInputs };
        });

        logger.info(`Field report for ${job.company}:\n${JSON.stringify(fieldReport, null, 2)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    logger.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
});
