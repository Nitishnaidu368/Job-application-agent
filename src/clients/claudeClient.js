const axios = require('axios');
const { config } = require('../config');

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

    buildPrompt({ question, job, userProfile }) {
        return [
            'You are drafting a short, factual job application response.',
            `Candidate: ${userProfile.fullName}`,
            `Role context: ${job.company} - ${job.location || 'unspecified location'}`,
            `Question: ${question}`,
            'Constraints: 2-4 sentences, no exaggeration, professional tone.'
        ].join('\n');
    }

    fallbackResponse() {
        return 'I would be happy to discuss this in more detail during the interview process.';
    }

    async callAnthropic(prompt) {
        const response = await axios.post(
            config.llm.apiUrl,
            {
                model: config.llm.model,
                max_tokens: 250,
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

    async callOpenAICompatible(prompt) {
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
                max_tokens: 250
            },
            {
                headers,
                timeout: config.llm.timeoutMs
            }
        );

        const choice = response.data?.choices?.[0];
        return choice?.message?.content || choice?.text || response.data?.message?.content || response.data?.content || '';
    }

    async callGroq(prompt, model = config.llm.model) {
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
                max_tokens: 250
            },
            {
                headers,
                timeout: config.llm.timeoutMs
            }
        );

        const choice = response.data?.choices?.[0];
        return choice?.message?.content || choice?.text || response.data?.message?.content || response.data?.content || '';
    }

    async generateResponse({ question, job, userProfile }) {
        const template = this.matchQuestionTemplate(question, userProfile);
        if (template) {
            return template;
        }

        if (config.llm.provider === 'template-only') {
            return this.fallbackResponse();
        }

        const prompt = this.buildPrompt({ question, job, userProfile });

        try {
            const text = config.llm.provider === 'anthropic'
                ? await this.callAnthropic(prompt)
                : config.llm.provider === 'groq'
                    ? await this.callGroq(prompt)
                    : await this.callOpenAICompatible(prompt);

            return text || this.fallbackResponse();
        } catch (error) {
            if (this.logger?.warn) {
                this.logger.warn(`LLM backend unavailable (${config.llm.provider}): ${error.message}`);
            }

            if (config.llm.provider === 'groq' && config.llm.fallbackModel && config.llm.fallbackModel !== config.llm.model) {
                try {
                    const fallbackText = await this.callGroq(prompt, config.llm.fallbackModel);
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
}

module.exports = { ClaudeClient };
