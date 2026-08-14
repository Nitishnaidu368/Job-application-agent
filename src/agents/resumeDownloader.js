const fs = require('fs');
const path = require('path');

class ResumeDownloader {
    constructor(logger) {
        this.logger = logger;
    }

    ensureDirectory(dirPath) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    syncResumes(sourceDir, targetDir) {
        if (!sourceDir) {
            return { copied: 0, skipped: 0 };
        }

        if (!fs.existsSync(sourceDir)) {
            throw new Error(`Resume source directory not found: ${sourceDir}`);
        }

        this.ensureDirectory(targetDir);

        const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
        let copied = 0;
        let skipped = 0;

        for (const entry of entries) {
            if (!entry.isFile()) continue;

            const sourcePath = path.join(sourceDir, entry.name);
            const targetPath = path.join(targetDir, entry.name);
            const isPdf = entry.name.toLowerCase().endsWith('.pdf');

            if (!isPdf) {
                skipped += 1;
                continue;
            }

            fs.copyFileSync(sourcePath, targetPath);
            copied += 1;
        }

        if (this.logger?.info) {
            this.logger.info(`Resume sync complete. Copied ${copied} PDF files from ${sourceDir} to ${targetDir}.`);
        }

        return { copied, skipped };
    }
}

module.exports = { ResumeDownloader };