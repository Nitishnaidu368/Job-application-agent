const axios = require('axios');
const { config } = require('../config');
const { bestOptionMatch } = require('./optionMatcher');

class ClaudeClient {
    constructor(logger) {
        this.logger = logger;
    }

    matchQuestionTemplate(question, userProfile) {
        const normalized = String(question || '').toLowerCase();

        if (normalized.includes('why') && normalized.includes('work')) {
            return 'I am excited about this role because it aligns with my experience in building cloud-native products and data systems, and I can contribute quickly with strong execution.';
        }

        if (normalized.includes('career goals')) {
            return 'My goal is to grow into a senior engineering role where I can design resilient cloud systems, mentor engineers, and ship measurable business impact.';
        }

        if (normalized.includes('salary') || normalized.includes('compensation')) {
            return null;
        }

        if (normalized.includes('tell us about yourself') || normalized.includes('cover letter')) {
            return `I am a software engineer with 3+ years of experience across full-stack and data engineering. I have delivered production systems at ${userProfile.experiences[0].company} and enjoy building reliable, user-focused products.`;
        }

        return null;
    }

    buildPrompt({ question, job, userProfile, resumeText }) {
        const lines = [
            'You are drafting a short, factual job application response.',
            `Candidate: ${userProfile.fullName}`,
            `Role context: ${job.company} - ${job.location || 'unspecified location'}`
        ];

        if (resumeText) {
            lines.push(
                'Candidate resume excerpt (use only real experience from this; do not invent details not present here):',
                resumeText
            );
        }

        lines.push(
            `Question: ${question}`,
            'Constraints: 2-4 sentences, no exaggeration, professional tone.'
        );

        return lines.join('\n');
    }

    buildBatchPrompt({ questions, job, userProfile, resumeText }) {
        const lines = [
            'You are drafting short, factual job application responses for several fields at once.',
            `Candidate: ${userProfile.fullName}`,
            `Role context: ${job.company} - ${job.location || 'unspecified location'}`
        ];

        if (resumeText) {
            lines.push(
                'Candidate resume excerpt (use only real experience from this; do not invent details not present here):',
                resumeText
            );
        }

        lines.push(
            'Fields needing answers (JSON array of {id, question, options}). "options" is the real, exact list of choices from a dropdown/radio field on the page, or null for a free-text field:',
            JSON.stringify(questions.map((q) => ({ id: q.id, question: q.question, options: q.options || null }))),
            'For each field: if "options" is a non-null array, your answer MUST be copied verbatim from that array — do not paraphrase, combine, or invent a choice not listed. If "options" is null, write a concise free-text answer (2-4 sentences for open-ended questions, a short phrase for simple fields like dates).',
            'Respond with ONLY a JSON array like [{"id": "...", "answer": "..."}] — one entry per field, no markdown fences, no extra commentary.'
        );

        return lines.join('\n');
    }

    parseBatchResponse(text) {
        const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            if (!Array.isArray(parsed)) return null;
            const map = {};
            parsed.forEach((item) => {
                if (item && item.id) map[item.id] = item.answer;
            });
            return map;
        } catch (error) {
            return null;
        }
    }

    fallbackResponse() {
        return 'I would be happy to discuss this in more detail during the interview process.';
    }

    stripReasoning(text) {
        // Reasoning models (e.g. Qwen thinking mode) can emit <think>...</think> before the
        // real answer; that must never end up typed into an actual application form.
        return String(text || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<think>[\s\S]*$/i, '')
            .trim();
    }

    async callAnthropic(prompt, { maxTokens = 250 } = {}) {
        const response = await axios.post(
            config.llm.apiUrl,
            {
                model: config.llm.model,
                max_tokens: maxTokens,
                messages: [{ role: 'user', content: prompt }]
            },
            {
                headers: {
                    'x-api-key': config.llm.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: config.llm.timeoutMs
            }
        );

        return response.data?.content?.[0]?.text || '';
    }

    async callOpenAICompatible(prompt, { maxTokens = 250 } = {}) {
        const headers = {
            'content-type': 'application/json'
        };

        if (config.llm.apiKey) {
            headers.authorization = `Bearer ${config.llm.apiKey}`;
        }

        const response = await axios.post(
            config.llm.apiUrl,
            {
                model: config.llm.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: config.llm.temperature,
                max_tokens: maxTokens,
                reasoning_effort: 'none'
            },
            {
                headers,
                timeout: config.llm.timeoutMs
            }
        );

        const choice = response.data?.choices?.[0];
        return choice?.message?.content || choice?.text || response.data?.message?.content || response.data?.content || '';
    }

    async callGroq(prompt, model = config.llm.model, { maxTokens = 250 } = {}) {
        const headers = {
            'content-type': 'application/json'
        };

        if (config.llm.apiKey) {
            headers.authorization = `Bearer ${config.llm.apiKey}`;
        }

        const response = await axios.post(
            config.llm.apiUrl,
            {
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: config.llm.temperature,
                max_tokens: maxTokens,
                reasoning_effort: 'none'
            },
            {
                headers,
                timeout: config.llm.timeoutMs
            }
        );

        const choice = response.data?.choices?.[0];
        return choice?.message?.content || choice?.text || response.data?.message?.content || response.data?.content || '';
    }

    dispatchCall(prompt, options) {
        return config.llm.provider === 'anthropic'
            ? this.callAnthropic(prompt, options)
            : config.llm.provider === 'groq'
                ? this.callGroq(prompt, config.llm.model, options)
                : this.callOpenAICompatible(prompt, options);
    }

    async callWithRetry(prompt, options) {
        try {
            return await this.dispatchCall(prompt, options);
        } catch (error) {
            if (error.response?.status === 429) {
                if (this.logger?.warn) {
                    this.logger.warn(`Rate limited by ${config.llm.provider}, retrying once in 3s...`);
                }
                await new Promise((resolve) => setTimeout(resolve, 3000));
                return this.dispatchCall(prompt, options);
            }
            throw error;
        }
    }

    async generateResponse({ question, job, userProfile, resumeText }) {
        const template = this.matchQuestionTemplate(question, userProfile);
        if (template) {
            return template;
        }

        if (config.llm.provider === 'template-only') {
            return this.fallbackResponse();
        }

        const prompt = this.buildPrompt({ question, job, userProfile, resumeText });

        try {
            const text = await this.callWithRetry(prompt);
            const cleaned = this.stripReasoning(text);
            return cleaned || this.fallbackResponse();
        } catch (error) {
            if (this.logger?.warn) {
                this.logger.warn(`LLM backend unavailable (${config.llm.provider}): ${error.message}`);
            }

            if (config.llm.provider === 'groq' && config.llm.fallbackModel && config.llm.fallbackModel !== config.llm.model) {
                try {
                    const fallbackText = this.stripReasoning(await this.callGroq(prompt, config.llm.fallbackModel));
                    return fallbackText || this.fallbackResponse();
                } catch (fallbackError) {
                    if (this.logger?.warn) {
                        this.logger.warn(`Groq fallback backend unavailable (${config.llm.fallbackModel}): ${fallbackError.message}`);
                    }
                }
            }

            return this.fallbackResponse();
        }
    }

    // Resolves a raw LLM answer for a constrained (options-bearing) field against the real
    // option list. Returns { value, confidence } where confidence is 'high' (score >= 60),
    // 'low' (30-59, applied but worth a human glance), or null (no reasonable match — caller
    // should leave the field unfilled rather than guess).
    resolveConstrainedAnswer(rawAnswer, options) {
        const match = bestOptionMatch(rawAnswer, options);
        if (!match) return { value: null, confidence: null };
        return { value: match.option, confidence: match.score >= 60 ? 'high' : 'low' };
    }

    // One call for every still-unanswered field on a form, instead of one call per field —
    // cuts a 10-15 call burst (which was tripping Groq's free-tier rate limit) down to ~1.
    // Returns { answers, flagged }: answers[q.id] is the resolved value (null if a
    // constrained field had no confident match), flagged lists the ids that need a human
    // glance (either unresolved or only a low-confidence match) instead of silently
    // defaulting to the first option in the list.
    async generateBatchResponses({ questions, job, userProfile, resumeText }) {
        const answers = {};
        const flagged = [];
        const remaining = [];

        questions.forEach((q) => {
            const template = q.options ? null : this.matchQuestionTemplate(q.question, userProfile);
            if (template !== null) answers[q.id] = template;
            else remaining.push(q);
        });

        if (!remaining.length) return { answers, flagged };

        if (config.llm.provider === 'template-only') {
            remaining.forEach((q) => {
                if (q.options) {
                    answers[q.id] = null;
                    flagged.push({ id: q.id, confidence: null });
                } else {
                    answers[q.id] = this.fallbackResponse();
                }
            });
            return { answers, flagged };
        }

        const applyResolved = (q, rawAnswer) => {
            if (!q.options) {
                answers[q.id] = rawAnswer || this.fallbackResponse();
                return;
            }
            const { value, confidence } = this.resolveConstrainedAnswer(rawAnswer, q.options);
            answers[q.id] = value;
            if (confidence !== 'high') flagged.push({ id: q.id, confidence });
        };

        const prompt = this.buildBatchPrompt({ questions: remaining, job, userProfile, resumeText });
        const maxTokens = Math.min(1500, 150 + remaining.length * 100);

        try {
            const text = await this.callWithRetry(prompt, { maxTokens });
            const parsed = this.parseBatchResponse(this.stripReasoning(text));
            if (!parsed) throw new Error('Batch response was not valid JSON.');

            remaining.forEach((q) => applyResolved(q, parsed[q.id]));
        } catch (error) {
            if (this.logger?.warn) {
                this.logger.warn(`Batch LLM call failed (${config.llm.provider}): ${error.message}. Falling back to per-question calls.`);
            }
            for (const q of remaining) {
                if (q.options) {
                    const rawAnswer = await this.generateSingleFromOptions({ question: q.question, options: q.options, job, userProfile, resumeText });
                    applyResolved(q, rawAnswer);
                } else {
                    answers[q.id] = await this.generateResponse({ question: q.question, job, userProfile, resumeText });
                }
            }
        }

        return { answers, flagged };
    }

    async generateSingleFromOptions({ question, options, job, userProfile, resumeText }) {
        const prompt = this.buildBatchPrompt({ questions: [{ id: 'q', question, options }], job, userProfile, resumeText });
        try {
            const text = await this.callWithRetry(prompt, { maxTokens: 250 });
            const parsed = this.parseBatchResponse(this.stripReasoning(text));
            return parsed && parsed.q;
        } catch (error) {
            if (this.logger?.warn) {
                this.logger.warn(`Single-option LLM call failed (${config.llm.provider}): ${error.message}.`);
            }
            return null;
        }
    }
}

module.exports = { ClaudeClient };
