#!/usr/bin/env node
const { Orchestrator } = require('../src/orchestrator');

async function main() {
    const orchestrator = new Orchestrator();
    orchestrator.ensureOutputDir();
    const jobs = await orchestrator.extractJobs(`manual-${Date.now()}`);
    const filePath = orchestrator.writeJson('manual-jobs.json', jobs);
    console.log(`Extracted ${jobs.length} jobs. Saved to ${filePath}`);
    console.log(JSON.stringify(jobs, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
