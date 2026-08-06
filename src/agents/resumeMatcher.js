const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function normalize(input) {
    return String(input || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function isCompanyResume(fileName, normalizedCompany) {
    if (path.extname(fileName).toLowerCase() !== '.pdf') return false;

    const stem = normalize(path.basename(fileName, path.extname(fileName)));
    const expectedStem = `nitishkandi_${normalizedCompany}_resume`;
    if (!stem.startsWith(expectedStem)) return false;

    const suffix = stem.slice(expectedStem.length);
    return suffix === '' || /^_(?:\d+|copy|current|final|latest)$/.test(suffix);
}

class ResumeMatcher {
    constructor(logger, resumesDir = config.paths.resumesDir) {
        this.logger = logger;
        this.resumesDir = resumesDir;
    }

    findResumeForCompany(company) {
        const normalizedCompany = normalize(company);
        if (!normalizedCompany) {
            this.logger?.warn('Cannot match a resume without a company name.');
            return null;
        }

        if (!fs.existsSync(this.resumesDir) || !fs.statSync(this.resumesDir).isDirectory()) {
            throw new Error(`Resume directory not found: ${this.resumesDir}`);
        }

        const matches = fs.readdirSync(this.resumesDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && isCompanyResume(entry.name, normalizedCompany))
            .map((entry) => {
                const filePath = path.join(this.resumesDir, entry.name);
                return { filePath, fileName: entry.name, modifiedAt: fs.statSync(filePath).mtimeMs };
            })
            .sort((a, b) => b.modifiedAt - a.modifiedAt || a.fileName.localeCompare(b.fileName));

        if (!matches.length) {
            this.logger?.warn(`No exact company resume found for ${company}.`);
            return null;
        }

        const selected = matches[0];
        this.logger?.info(
            `Selected newest exact resume for ${company}: ${selected.fileName} (${matches.length} matching version${matches.length === 1 ? '' : 's'}).`
        );
        return selected.filePath;
    }
}

module.exports = { ResumeMatcher, normalize, isCompanyResume };
