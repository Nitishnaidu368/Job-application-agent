const { resolveAddress } = require('./addressBook');

/**
 * Maps config.userProfile (this project's shape) into the profile shape
 * browserFillEngine.js expects (personal/eeo/workExperience/education/customAnswers),
 * mirroring job-autofill-extension's UserProfile contract.
 */
function buildBrowserProfile(userProfile, jobLocation) {
    const [firstName = '', ...rest] = (userProfile.fullName || '').split(' ');
    const lastName = rest.join(' ');
    const address = resolveAddress(jobLocation) || {};

    const customAnswers = [
        { question: 'Start date year', answer: userProfile.startYear || '' },
        { question: 'How did you hear about us', answer: userProfile.applicationSource || '' }
    ];
    if (userProfile.startDate) {
        customAnswers.push({ question: 'When can you start?', answer: userProfile.startDate });
    }
    if (typeof userProfile.willingToTravelPercent === 'number') {
        customAnswers.push({
            question: 'How much are you willing to travel?',
            answer: `Up to ${userProfile.willingToTravelPercent}%`
        });
    }

    return {
        personal: {
            firstName: firstName || userProfile.preferredName || '',
            lastName: lastName || '',
            email: userProfile.email || '',
            phone: userProfile.phone || '',
            city: address.city || '',
            state: address.state || '',
            zipCode: address.zipCode || '',
            country: address.country || '',
            streetAddress: userProfile.streetAddress || '',
            location: [address.city, address.state].filter(Boolean).join(', '),
            linkedIn: userProfile.linkedin || '',
            github: userProfile.github || '',
            portfolio: userProfile.portfolio || '',
            website: userProfile.portfolio || ''
        },
        workExperience: (userProfile.experiences || []).map((exp) => ({
            company: exp.company,
            title: exp.role,
            current: exp.end === 'Present'
        })),
        education: (userProfile.education || []).map((edu) => ({
            school: edu.institution,
            degree: edu.degree,
            field: edu.field
        })),
        eeo: {
            gender: userProfile.eeo?.gender || '',
            pronouns: '',
            race: userProfile.eeo?.race || '',
            ethnicity: userProfile.eeo?.ethnicity || '',
            veteranStatus: userProfile.eeo?.veteranStatus || '',
            disabilityStatus: userProfile.eeo?.disabilityStatus || '',
            authorizedToWork: !!userProfile.workAuthorizationUS,
            requireSponsorship: !!userProfile.requiresVisaSponsorship,
            willingToRelocate: userProfile.willingToRelocate
        },
        customAnswers
    };
}

module.exports = { buildBrowserProfile };
