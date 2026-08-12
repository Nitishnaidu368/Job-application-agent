const { runFillEngine } = require('./fillEngineRunner');
const { extractResumeText } = require('../../clients/resumeText');

class LeverFiller {
    constructor({ logger, claudeClient, userProfile }) {
        this.logger = logger;
        this.claudeClient = claudeClient;
        this.userProfile = userProfile;
    }

    async fillForm(page, job, resumePath) {
        const summary = await runFillEngine(page, this.userProfile, job.location);

        const succeeded = summary.results.filter((r) => r.success).length;
        this.logger.info(`Fill engine (${summary.platform}): ${succeeded}/${summary.results.length} fields filled.`);
        summary.results
            .filter((r) => !r.success)
            .forEach((r) => this.logger.warn(`Could not fill "${r.label}" (${r.fieldType}) — method="${r.method}" value="${r.value}"`));

        await this.uploadFile(page, resumePath, {
            hasInput: summary.hasResumeInput,
            inputSelector: '[data-job-agent-resume-input="1"]',
            triggerSelector: '[data-job-agent-resume-trigger="1"]',
            label: 'Resume'
        });

        // Some ATSes (Ashby) run their own async "autofill from resume" widget after upload,
        // which can silently overwrite fields we already filled once it finishes. Give it a
        // moment before our own settle pass so we write last, not it.
        await page.waitForTimeout(3000);

        // The native file-chooser dialog (and other late interactions) can trigger a re-render
        // that reverts an earlier field back to empty. Re-running the fill pass is idempotent —
        // fields that already hold the right value are left alone — so this self-heals any
        // field that got reset after it was originally filled.
        const settleSummary = await runFillEngine(page, this.userProfile, job.location);
        const revived = settleSummary.results.filter((r) => r.success && r.method !== 'already-filled');
        if (revived.length) {
            this.logger.info(`Settle pass re-filled ${revived.length} field(s) that reverted after upload: ${revived.map((r) => r.label).join(', ')}`);
        }

        await this.fillRequiredGaps(page, job, resumePath);
        await this.verifyAndFixGaps(page, job, resumePath);
    }

    // Final check: confirm nothing required is still empty — whether from a field an ATS's own
    // late-async autofill disturbed, or a gap our own passes missed — and do one bounded retry
    // round (re-run structured fill + gap-fill once) rather than assuming the earlier passes
    // were the last word.
    async verifyAndFixGaps(page, job, resumePath) {
        let gaps = await page.evaluate(() => window.__jobAgentFillEngine.findRequiredEmptyFields());
        if (!gaps.length) {
            this.logger.info('Final verification: all required fields are filled.');
            return;
        }

        this.logger.warn(`Final verification found ${gaps.length} required field(s) still empty (${gaps.map((g) => g.label).join(', ')}). Retrying once.`);

        await runFillEngine(page, this.userProfile, job.location);
        await this.fillRequiredGaps(page, job, resumePath);

        gaps = await page.evaluate(() => window.__jobAgentFillEngine.findRequiredEmptyFields());
        if (gaps.length) {
            this.logger.warn(`After retry, ${gaps.length} required field(s) remain unfilled: ${gaps.map((g) => g.label).join(', ')}.`);
        } else {
            this.logger.info('Final verification: all required fields are filled after one retry.');
        }
    }

    async uploadFile(page, filePath, { hasInput, inputSelector, triggerSelector, label }) {
        if (!filePath || !hasInput) {
            this.logger.warn(`No ${label.toLowerCase()} upload field detected or no file provided.`);
            return;
        }

        const trigger = page.locator(triggerSelector).first();
        if (await trigger.count()) {
            const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
            await trigger.click();
            const chooser = await chooserPromise;
            if (chooser) {
                await chooser.setFiles(filePath);
                this.logger.info(`${label} uploaded via native file chooser.`);
                return;
            }
        }

        const fileInput = page.locator(inputSelector).first();
        if (await fileInput.count()) {
            await fileInput.setInputFiles(filePath);
            this.logger.info(`${label} uploaded via direct file input.`);
        } else {
            this.logger.warn(`No file input found for ${label.toLowerCase()} upload.`);
        }
    }

    async fillRequiredGaps(page, job, resumePath) {
        const gaps = await page.evaluate(() => window.__jobAgentFillEngine.findRequiredEmptyFields());
        if (!gaps.length) return;

        this.logger.info(`Found ${gaps.length} required field(s) still empty; answering via LLM/best-guess.`);

        const checkboxGaps = gaps.filter((g) => g.elementType === 'checkbox');
        const llmGaps = gaps.filter((g) => g.elementType !== 'checkbox');

        for (const gap of checkboxGaps) {
            await page.evaluate(
                ({ id, elementType }) => window.__jobAgentFillEngine.applyCatchAllValue(id, elementType, true),
                { id: gap.id, elementType: gap.elementType }
            );
        }

        if (!llmGaps.length) return;

        const resumeText = await extractResumeText(resumePath);
        const answers = await this.claudeClient.generateBatchResponses({
            questions: llmGaps.map((g) => ({ id: g.id, question: g.label, options: g.options })),
            job,
            userProfile: this.userProfile,
            resumeText
        });

        for (const gap of llmGaps) {
            const value = answers[gap.id] || (gap.options ? gap.options[0] : this.claudeClient.fallbackResponse());

            if (gap.elementType === 'click-group') {
                const applied = await this.clickGroupOption(page, gap, value);
                if (!applied) {
                    this.logger.warn(`Could not click an option for required field "${gap.label}" (click-group).`);
                }
                continue;
            }

            const applied = await page.evaluate(
                ({ id, elementType, value }) => window.__jobAgentFillEngine.applyCatchAllValue(id, elementType, value),
                { id: gap.id, elementType: gap.elementType, value }
            );

            if (!applied) {
                this.logger.warn(`Could not apply an answer to required field "${gap.label}" (${gap.elementType}).`);
            }
        }
    }

    // Real Playwright click (trusted OS-level event) instead of a JS-level el.click() inside
    // page.evaluate() — some UI libraries' click handlers ignore untrusted synthetic events for
    // state updates, which is why the target button's underlying value wasn't sticking.
    async clickGroupOption(page, gap, value) {
        const normalizedValue = String(value).toLowerCase().trim();
        let index = gap.options.findIndex((opt) => opt.toLowerCase().trim() === normalizedValue);
        if (index === -1) {
            index = gap.options.findIndex((opt) => opt.toLowerCase().trim().startsWith(normalizedValue));
        }
        if (index === -1) return false;

        const button = page.locator(`[data-job-agent-clickgroup-option="${gap.id}:${index}"]`).first();
        if (!(await button.count())) return false;

        await button.click();
        return true;
    }
}

module.exports = { LeverFiller };
