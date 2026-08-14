require('dotenv').config();

const path = require('path');

const llmProvider = (() => {
    const explicitProvider = (process.env.LLM_PROVIDER || '').toLowerCase();
    if (explicitProvider) return explicitProvider;
    if (process.env.GROQ_API_KEY || process.env.GROQ_MODEL) return 'groq';
    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_MODEL) return 'anthropic';
    if (process.env.LLM_API_URL || process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) return 'openai-compatible';
    return 'template-only';
})();

const config = {
    llm: {
        provider: llmProvider,
        model: process.env.LLM_MODEL || process.env.GROQ_MODEL || process.env.ANTHROPIC_MODEL || 'qwen/qwen3.6-27b',
        fallbackModel: process.env.LLM_FALLBACK_MODEL || 'openai/gpt-oss-20b',
        apiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        apiUrl:
            process.env.LLM_API_URL ||
            process.env.GROQ_API_URL ||
            process.env.OPENAI_BASE_URL ||
            process.env.ANTHROPIC_API_URL ||
            (llmProvider === 'groq'
                ? 'https://api.groq.com/openai/v1/chat/completions'
                : llmProvider === 'anthropic'
                    ? 'https://api.anthropic.com/v1/messages'
                    : 'http://localhost:11434/v1/chat/completions'),
        timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000),
        temperature: Number(process.env.LLM_TEMPERATURE || 0.2)
    },
    paths: {
        resumesDir: process.env.RESUMES_PATH || '/Users/nitishkandi/Desktop/job/Zobnest_resumes',
        resumeSourceDir: process.env.RESUME_SOURCE_DIR || '',
        outputDir: process.env.OUTPUT_DIR || path.join(process.cwd(), 'output')
    },
    zobnest: {
        dashboardUrl: process.env.ZOBNEST_URL || 'https://www.zobnest.in/client/dashboard',
        loginUrl: process.env.ZOBNEST_LOGIN_URL || 'https://www.zobnest.in/login',
        username: process.env.ZOBNEST_USERNAME || '',
        password: process.env.ZOBNEST_PASSWORD || ''
    },
    playwright: {
        headless: String(process.env.HEADLESS || 'false').toLowerCase() === 'true',
        userDataDir: process.env.PLAYWRIGHT_USER_DATA_DIR || '',
        executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '',
        navTimeoutMs: 45000,
        actionTimeoutMs: 20000
    },
    runtime: {
        dryRun: String(process.env.DRY_RUN || 'false').toLowerCase() === 'true',
        logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase()
    },
    userProfile: {
        fullName: 'Nitish Naidu Kandi',
        preferredName: 'Nitish Kandi',
        email: 'kandinitishnaidu@gmail.com',
        phone: '+1-716-907-8300',
        // Street line only — city/state/zip/country are resolved per job location via
        // addressBook.js instead, since those should follow where the job actually is.
        streetAddress: '',
        linkedin: 'https://www.linkedin.com/in/nitishk12/',
        github: 'https://github.com/Nitishnaidu368',
        portfolio: 'https://nitish-portifolio.vercel.app/',
        workAuthorizationUS: true,
        requiresVisaSponsorship: false,
        willingToRelocate: true,
        willingToTravelPercent: 75,
        startDate: 'Immediately available',
        startYear: '2026',
        applicationSource: 'LinkedIn',
        eeo: {
            gender: 'Male',
            race: 'Asian',
            ethnicity: 'No',
            veteranStatus: 'I am not a protected veteran',
            disabilityStatus: 'No, I do not have a disability and have not had one in the past'
        },
        skills: [
            'Java',
            'Python',
            'JavaScript',
            'TypeScript',
            'React',
            'Node.js',
            'AWS',
            'Docker',
            'Kubernetes',
            'Terraform',
            'dbt',
            'Redshift',
            'REST APIs',
            'Microservices'
        ],
        experiences: [
            {
                company: 'Accenture',
                role: 'Software Engineer II / Data Engineer',
                start: 'Nov 2024',
                end: 'Present'
            },
            {
                company: 'Pandora Finance',
                role: 'Software Engineer',
                start: 'Jan 2022',
                end: 'Aug 2024'
            },
            {
                company: 'Logicprog Technologies',
                role: 'Associate Software Engineer',
                start: 'Jan 2021',
                end: 'Dec 2021'
            }
        ],
        education: [
            {
                institution: 'University at Buffalo, SUNY',
                degree: 'Master of Science',
                field: 'Data Science and Applications',
                start: 'Aug 2024',
                end: 'Dec 2025'
            },
            {
                institution: 'Vellore Institute of Technology',
                degree: 'Bachelor of Technology',
                field: 'Computer Science and Engineering',
                start: 'Jul 2018',
                end: 'Jun 2021'
            }
        ]
    }
};

module.exports = { config };
