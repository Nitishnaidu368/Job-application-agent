class LeverFiller {
    constructor({ logger, claudeClient, userProfile }) {
        this.logger = logger;
        this.claudeClient = claudeClient;
        this.userProfile = userProfile;
    }

    async fillForm(page, job, resumePath) {
        await this.fillStandardFields(page);
        await this.uploadResume(page, resumePath);
        await this.fillCustomQuestions(page, job);
    }

    async fillStandardFields(page) {
        await this.fillByLabel(page, /name|full name/i, this.userProfile.fullName);
        await this.fillByLabel(page, /email/i, this.userProfile.email);
        await this.fillByLabel(page, /phone/i, this.userProfile.phone);
        await this.fillByLabel(page, /linkedin/i, this.userProfile.linkedin);
        await this.fillByLabel(page, /github/i, this.userProfile.github);
        await this.fillByLabel(page, /portfolio|website/i, this.userProfile.portfolio);
    }

    async uploadResume(page, resumePath) {
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count()) {
            await fileInput.setInputFiles(resumePath);
            this.logger.info('Resume uploaded via file input.');
        } else {
            this.logger.warn('No file input found for resume upload.');
        }
    }

    async fillCustomQuestions(page, job) {
        const textareas = page.locator('textarea');
        const count = await textareas.count();

        for (let i = 0; i < count; i += 1) {
            const area = textareas.nth(i);
            const value = await area.inputValue();
            if (value && value.trim()) continue;

            const question = (await area.getAttribute('aria-label')) || `Custom question ${i + 1}`;
            const response = await this.claudeClient.generateResponse({
                question,
                job,
                userProfile: this.userProfile
            });
            await area.fill(response);
        }
    }

    async fillByLabel(page, labelRegex, value) {
        const input = page.getByLabel(labelRegex).first();
        if (await input.count()) {
            await input.fill(value);
            return;
        }

        const placeholderInput = page.getByPlaceholder(labelRegex).first();
        if (await placeholderInput.count()) {
            await placeholderInput.fill(value);
        }
    }
}

module.exports = { LeverFiller };
