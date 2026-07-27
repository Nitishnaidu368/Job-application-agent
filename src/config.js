require('dotenv').config();

const path = require('path');

const config = {
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        apiUrl: 'https://api.anthropic.com/v1/messages'
    },
    paths: {
        resumesDir: process.env.RESUMES_PATH || '/Users/nitishkandi/Desktop/job/Zobnest_resumes',
        outputDir: process.env.OUTPUT_DIR || path.join(process.cwd(), 'output')
    },
    zobnest: {
        dashboardUrl: process.env.ZOBNEST_URL || 'https://www.zobnest.in/client/dashboard'
    },
    playwright: {
        headless: String(process.env.HEADLESS || 'false').toLowerCase() === 'true',
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
        linkedin: 'https://www.linkedin.com/in/nitishk12/',
        github: 'https://github.com/Nitishnaidu368',
        portfolio: 'https://nitish-portifolio.vercel.app/',
        workAuthorizationUS: true,
        requiresVisaSponsorship: false,
        willingToRelocate: true,
        willingToTravelPercent: 75,
        startDate: 'Immediately available',
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
                degree: 'MS Data Science & Applications',
                start: 'Aug 2024',
                end: 'Dec 2025'
            },
            {
                institution: 'Vellore Institute of Technology',
                degree: 'BTech Computer Science & Engineering',
                start: 'Jul 2018',
                end: 'Jun 2021'
            }
        ]
    }
};

module.exports = { config };
