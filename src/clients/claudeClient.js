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

    async generateResponse({ question, job, userProfile }) {
        const template = this.matchQuestionTemplate(question, userProfile);
        if (template) {
            return template;
        }

        if (!config.anthropic.apiKey) {
            return 'I would be happy to discuss this in more detail during the interview process.';
        }

        const prompt = [
            'You are drafting a short, factual job application response.',
            `Candidate: ${userProfile.fullName}`,
            `Role context: ${job.company} - ${job.location || 'unspecified location'}`,
            `Question: ${question}`,
            'Constraints: 2-4 sentences, no exaggeration, professional tone.'
        ].join('\n');

        const response = await axios.post(
            config.anthropic.apiUrl,
            {
                model: config.anthropic.model,
                max_tokens: 250,
                messages: [{ role: 'user', content: prompt }]
            },
            {
                headers: {
                    'x-api-key': config.anthropic.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: 30000
            }
        );

        const text = response.data?.content?.[0]?.text;
        return text || 'I would be happy to discuss this in more detail during the interview process.';
    }
}

module.exports = { ClaudeClient };
