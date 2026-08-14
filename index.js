const { Orchestrator } = require('./src/orchestrator');
const { config } = require('./src/config');
const { logger } = require('./src/logger');

async function main() {
    if (config.llm.provider === 'template-only' && !config.runtime.dryRun) {
        logger.warn('No LLM backend configured. Custom questions will use template and fallback responses only.');
    }

    const orchestrator = new Orchestrator();
    await orchestrator.run();
}

main().catch((error) => {
    logger.error(`Fatal error: ${error.message}`);
    logger.debug(error.stack || '');
    process.exit(1);
});
