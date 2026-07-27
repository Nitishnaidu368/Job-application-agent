const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { logger } = require('./logger');
const { ZobnestExtractor } = require('./agents/zobnestExtractor');
const { ApplicationFiller } = require('./agents/applicationFiller');

class Orchestrator {
    constructor() {
        this.extractor = new ZobnestExtractor(logger);
        this.applicationFiller = new ApplicationFiller(logger);
    }

    ensureOutputDir() {
        fs.mkdirSync(config.paths.outputDir, { recursive: true });
    }

    writeJson(fileName, payload) {
        const filePath = path.join(config.paths.outputDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        return filePath;
    }

    buildSummary(results) {
        const totals = results.reduce(
            (acc, item) => {
                acc.totalProcessed += 1;
                if (item.status === 'submitted') acc.submitted += 1;
                if (item.status === 'failed') acc.failed += 1;
                if (item.status === 'skipped') acc.skipped += 1;
                return acc;
            },
            { totalProcessed: 0, submitted: 0, failed: 0, skipped: 0 }
        );

        const successRate = totals.totalProcessed
            ? `${((totals.submitted / totals.totalProcessed) * 100).toFixed(2)}%`
            : '0.00%';

        return {
            timestamp: new Date().toISOString(),
            ...totals,
            successRate,
            details: results
        };
    }

    async extractJobs(runId) {
        if (config.runtime.dryRun) {
            logger.warn('DRY_RUN mode enabled. Using mock jobs instead of scraping ZobNest.');
            return [
                {
                    runId,
                    company: 'Acme Corp',
                    location: 'Remote',
                    applicationUrl: 'https://jobs.lever.co/acme/123'
                },
                {
                    runId,
                    company: 'Contoso Labs',
                    location: 'Boston, MA',
                    applicationUrl: 'https://jobs.ashbyhq.com/contoso/456'
                }
            ];
        }

        const jobs = await this.extractor.extract();
        return jobs.map((job) => ({ runId, ...job }));
    }

    async run() {
        this.ensureOutputDir();

        const runId = `run-${Date.now()}`;
        logger.info(`Starting run ${runId}`);

        const jobs = await this.extractJobs(runId);
        this.writeJson('jobs.json', jobs);

        logger.info(`Job extraction complete. ${jobs.length} jobs queued.`);

        const results = await this.applicationFiller.processJobs(jobs, runId);
        this.writeJson('applications.json', results);

        const summary = this.buildSummary(results);
        this.writeJson('summary.json', summary);

        logger.info(`Run complete. Submitted: ${summary.submitted}, Failed: ${summary.failed}, Skipped: ${summary.skipped}`);
    }
}

module.exports = { Orchestrator };
