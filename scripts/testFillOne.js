#!/usr/bin/env node
const { ApplicationFiller } = require('../src/agents/applicationFiller');
const { logger } = require('../src/logger');

const companyArg = process.argv[2] || 'Bandwidth';

async function main() {
    const jobs = require('../output/manual-jobs.json');
    const job = jobs.find((j) => j.company.toLowerCase() === companyArg.toLowerCase());
    if (!job) {
        throw new Error(`No job found for company "${companyArg}" in output/manual-jobs.json`);
    }

    const filler = new ApplicationFiller(logger);
    const result = await filler.applyToJob(job, `manual-${Date.now()}`);
    logger.info(`Result: ${JSON.stringify(result, null, 2)}`);
}

main().catch((error) => {
    logger.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
});
