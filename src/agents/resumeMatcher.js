const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function normalize(input) {
    return String(input || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

class ResumeMatcher {
    constructor(logger) {
        this.logger = logger;
    }

    findResumeForCompany(company) {
        if (!fs.existsSync(config.paths.resumesDir)) {
            throw new Error(`Resume directory not found: ${config.paths.resumesDir}`);
        }

        const files = fs.readdirSync(config.paths.resumesDir);
        const normalizedCompany = normalize(company);

        const directMatch = files.find((file) => {
            const lower = file.toLowerCase();
            return lower.endsWith('.pdf') && lower.includes(`nitishkandi_${normalizedCompany}`);
        });

        if (directMatch) {
            return path.join(config.paths.resumesDir, directMatch);
        }

        const fuzzyMatch = files.find((file) => {
            const lower = file.toLowerCase();
            return lower.endsWith('.pdf') && lower.startsWith('nitishkandi_') && lower.includes(normalizedCompany.split('_')[0]);
        });

        if (fuzzyMatch) {
            return path.join(config.paths.resumesDir, fuzzyMatch);
        }

        return null;
    }
}

module.exports = { ResumeMatcher };
