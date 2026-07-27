const fs = require('fs');
const path = require('path');
const { config } = require('./config');

const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};

class Logger {
    constructor() {
        this.level = config.runtime.logLevel in LEVELS ? config.runtime.logLevel : 'info';
        fs.mkdirSync(config.paths.outputDir, { recursive: true });
        const dateStamp = new Date().toISOString().slice(0, 10);
        this.logPath = path.join(config.paths.outputDir, `job-agent-${dateStamp}.log`);
    }

    write(level, message) {
        if (LEVELS[level] < LEVELS[this.level]) {
            return;
        }

        const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
        if (level === 'error') {
            console.error(line);
        } else {
            console.log(line);
        }

        fs.appendFileSync(this.logPath, `${line}\n`, 'utf8');
    }

    debug(message) {
        this.write('debug', message);
    }

    info(message) {
        this.write('info', message);
    }

    warn(message) {
        this.write('warn', message);
    }

    error(message) {
        this.write('error', message);
    }
}

const logger = new Logger();

module.exports = { logger };
