const { Orchestrator } = require('./src/orchestrator');
const { config } = require('./src/config');
const { logger } = require('./src/logger');

async function main() {
    if (!config.anthropic.apiKey && !config.runtime.dryRun) {
        logger.error('ANTHROPIC_API_KEY is missing. Copy .env.example to .env and add your key, or run npm run dry-run.');
        process.exit(1);
    }

    const orchestrator = new Orchestrator();
    await orchestrator.run();
}

main().catch((error) => {
    logger.error(`Fatal error: ${error.message}`);
    logger.debug(error.stack || '');
    process.exit(1);
});
