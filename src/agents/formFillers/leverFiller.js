const { runFillEngine } = require('./fillEngineRunner');
const { extractResumeText } = require('../../clients/resumeText');
const learnedAnswers = require('./learnedAnswers');

class LeverFiller {
    constructor({ logger, claudeClient, userProfile }) {
        this.logger = logger;
        this.claudeClient = claudeClient;
        this.userProfile = userProfile;
    }

    async fillForm(page, job, resumePath) {
        // Tracks questions the user explicitly typed "skip" for during this job's terminal
        // prompts, so the verifyAndFixGaps retry pass below doesn't ask the same question
        // again a few seconds later.
        this.skippedLabels = new Set();

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

        const flagged = await this.fillRequiredGaps(page, job, resumePath);
        const retryFlagged = await this.verifyAndFixGaps(page, job, resumePath);
        return [...flagged, ...retryFlagged];
    }

    // Final check: confirm nothing required is still empty — whether from a field an ATS's own
    // late-async autofill disturbed, or a gap our own passes missed — and do one bounded retry
    // round (re-run structured fill + gap-fill once) rather than assuming the earlier passes
    // were the last word.
    async verifyAndFixGaps(page, job, resumePath) {
        let gaps = await page.evaluate(() => window.__jobAgentFillEngine.findRequiredEmptyFields());
        if (!gaps.length) {
            this.logger.info('Final verification: all required fields are filled.');
            return [];
        }

        this.logger.warn(`Final verification found ${gaps.length} required field(s) still empty (${gaps.map((g) => g.label).join(', ')}). Retrying once.`);

        await runFillEngine(page, this.userProfile, job.location);
        const flagged = await this.fillRequiredGaps(page, job, resumePath);

        gaps = await page.evaluate(() => window.__jobAgentFillEngine.findRequiredEmptyFields());
        if (gaps.length) {
            this.logger.warn(`After retry, ${gaps.length} required field(s) remain unfilled: ${gaps.map((g) => g.label).join(', ')}.`);
        } else {
            this.logger.info('Final verification: all required fields are filled after one retry.');
        }
        return flagged;
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

    // Applies a resolved value to a gap's field, routing click-groups through a real
    // Playwright click and everything else through the browser engine's catch-all setter.
    async applyGapValue(page, gap, value) {
        if (gap.elementType === 'click-group') {
            const applied = await this.clickGroupOption(page, gap, value);
            if (!applied) {
                this.logger.warn(`Could not click an option for field "${gap.label}" (click-group).`);
            }
            return;
        }

        const applied = await page.evaluate(
            ({ id, elementType, value }) => window.__jobAgentFillEngine.applyCatchAllValue(id, elementType, value),
            { id: gap.id, elementType: gap.elementType, value }
        );

        if (!applied) {
            this.logger.warn(`Could not apply an answer to field "${gap.label}" (${gap.elementType}).`);
        }
    }

    // Returns a "flagged" list of fields that need a human glance: either a field with no
    // confident answer anywhere (learned store, terminal prompt skipped, no confident LLM
    // match) — left unfilled rather than guessed — or one that was filled on a
    // low-confidence LLM match.
    async fillRequiredGaps(page, job, resumePath) {
        const gaps = await page.evaluate(() => window.__jobAgentFillEngine.findRequiredEmptyFields());
        if (!gaps.length) return [];

        this.logger.info(`Found ${gaps.length} unanswered field(s); resolving via learned answers/LLM/best-guess.`);

        const checkboxGaps = gaps.filter((g) => g.elementType === 'checkbox');
        const otherGaps = gaps.filter((g) => g.elementType !== 'checkbox');

        for (const gap of checkboxGaps) {
            await page.evaluate(
                ({ id, elementType }) => window.__jobAgentFillEngine.applyCatchAllValue(id, elementType, true),
                { id: gap.id, elementType: gap.elementType }
            );
        }

        const flagged = [];
        const remaining = [];

        // Learned-store pass: reuse a past answer for a question we've essentially seen
        // before (fuzzy label match + matching options for constrained fields), skipping
        // the LLM and the terminal prompt entirely.
        for (const gap of otherGaps) {
            const learned = learnedAnswers.findMatch(gap.label, gap.elementType, gap.options);
            if (learned === null) {
                remaining.push(gap);
                continue;
            }
            await this.applyGapValue(page, gap, learned);
        }

        // Single-line text questions get asked directly rather than have the LLM invent a
        // factual personal answer (notice period, salary expectation, etc). Long-form
        // textarea questions and constrained fields fall through to the LLM path below.
        const textGaps = remaining.filter((g) => g.elementType === 'text');
        const llmGaps = remaining.filter((g) => g.elementType !== 'text');

        for (const gap of textGaps) {
            if (this.skippedLabels.has(gap.label)) {
                flagged.push({ label: gap.label, options: null, required: gap.required, value: null, reason: 'skipped by user' });
                continue;
            }

            const answer = await learnedAnswers.promptForAnswer(gap.label, gap.elementType, gap.options);
            if (answer === null) {
                this.skippedLabels.add(gap.label);
                llmGaps.push(gap); // fall back to today's template/LLM-drafted path
                continue;
            }

            learnedAnswers.saveAnswer(gap.label, gap.elementType, gap.options, answer);
            this.logger.info(`Learned new answer for "${gap.label}": ${answer}`);
            await this.applyGapValue(page, gap, answer);
        }

        if (!llmGaps.length) return flagged;

        const resumeText = await extractResumeText(resumePath);
        const { answers, flagged: flaggedIds } = await this.claudeClient.generateBatchResponses({
            questions: llmGaps.map((g) => ({ id: g.id, question: g.label, options: g.options })),
            job,
            userProfile: this.userProfile,
            resumeText
        });
        const confidenceById = new Map(flaggedIds.map((f) => [f.id, f.confidence]));

        for (const gap of llmGaps) {
            const value = gap.options ? answers[gap.id] : (answers[gap.id] || this.claudeClient.fallbackResponse());

            if (value === null || value === undefined) {
                // No confident match among the real options — try asking directly (unless
                // the user already skipped this exact question this job) before giving up.
                if (!this.skippedLabels.has(gap.label)) {
                    const answer = await learnedAnswers.promptForAnswer(gap.label, gap.elementType, gap.options);
                    if (answer !== null) {
                        learnedAnswers.saveAnswer(gap.label, gap.elementType, gap.options, answer);
                        this.logger.info(`Learned new answer for "${gap.label}": ${answer}`);
                        await this.applyGapValue(page, gap, answer);
                        continue;
                    }
                    this.skippedLabels.add(gap.label);
                }
                flagged.push({ label: gap.label, options: gap.options, required: gap.required, value: null, reason: 'no confident match' });
                continue;
            }

            if (confidenceById.has(gap.id)) {
                flagged.push({ label: gap.label, options: gap.options, required: gap.required, value, reason: 'low-confidence match' });
            }

            await this.applyGapValue(page, gap, value);
        }

        return flagged;
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
