const assert = require('assert');
const { isSubmissionComplete } = require('../src/agents/applicationFiller');

const reviewState = {
    currentUrl: 'https://jobs.example.com/apply',
    reviewUrl: 'https://jobs.example.com/apply',
    bodyText: 'Review your application',
    formFieldCount: 4,
    formWasPresent: true
};

assert.strictEqual(isSubmissionComplete(reviewState), false, 'does not continue before manual submission');
assert.strictEqual(
    isSubmissionComplete({ ...reviewState, currentUrl: 'https://jobs.example.com/confirmation' }),
    true,
    'detects a redirect after manual submission'
);
assert.strictEqual(
    isSubmissionComplete({ ...reviewState, bodyText: 'Thank you. Your application has been received.' }),
    true,
    'detects an inline submission confirmation'
);
assert.strictEqual(
    isSubmissionComplete({ ...reviewState, formFieldCount: 0 }),
    true,
    'detects replacement of the application form'
);

console.log('applicationFiller: all checks passed');
