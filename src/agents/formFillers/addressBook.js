const KNOWN_ADDRESSES = [
    { city: 'Arlington', state: 'VA', zipCode: '22209' },
    { city: 'Atlanta', state: 'GA', zipCode: '30309' },
    { city: 'Austin', state: 'TX', zipCode: '78701' },
    { city: 'Bellevue', state: 'WA', zipCode: '98004' },
    { city: 'Bethesda', state: 'MD', zipCode: '20814' },
    { city: 'Birmingham', state: 'AL', zipCode: '35205' },
    { city: 'Boston', state: 'MA', zipCode: '02115' },
    { city: 'Cambridge', state: 'MA', zipCode: '02141' },
    { city: 'Carmel', state: 'IN', zipCode: '46032' },
    { city: 'Carrollton', state: 'TX', zipCode: '75006' },
    { city: 'Charlestown', state: 'MA', zipCode: '02129' },
    { city: 'Chicago', state: 'IL', zipCode: '60622' },
    { city: 'Charlotte', state: 'NC', zipCode: '28277' },
    { city: 'Columbia', state: 'MD', zipCode: '21044' },
    { city: 'Dayton', state: 'OH', zipCode: '45402' },
    { city: 'Denver', state: 'CO', zipCode: '80210' },
    { city: 'Florham Park', state: 'NJ', zipCode: '07932' },
    { city: 'Fremont', state: 'CA', zipCode: '94538' },
    { city: 'Glassboro', state: 'NJ', zipCode: '08028' },
    { city: 'Houston', state: 'TX', zipCode: '77002' },
    { city: 'Irving', state: 'TX', zipCode: '75039' },
    { city: 'Indianapolis', state: 'IN', zipCode: '46240' },
    { city: 'Jersey City', state: 'NJ', zipCode: '07302' },
    { city: 'Lake Forest', state: 'IL', zipCode: '60045' },
    { city: 'Las Vegas', state: 'NV', zipCode: '89109' },
    { city: 'Lehi', state: 'UT', zipCode: '84043' },
    { city: 'Los Angeles', state: 'CA', zipCode: '90064' },
    { city: 'Madison', state: 'WI', zipCode: '53703' },
    { city: 'Malvern', state: 'PA', zipCode: '19355' },
    { city: 'Merrimack', state: 'NH', zipCode: '03054' },
    { city: 'Miami', state: 'FL', zipCode: '33142' },
    { city: 'Minneapolis', state: 'MN', zipCode: '55403' },
    { city: 'Mountain View', state: 'CA', zipCode: '94043' },
    { city: 'New York', state: 'NY', zipCode: '10018' },
    { city: 'North Little Rock', state: 'AR', zipCode: '72114' },
    { city: 'North Sioux City', state: 'SD', zipCode: '57049' },
    { city: 'Omaha', state: 'NE', zipCode: '68105' },
    { city: 'Palo Alto', state: 'CA', zipCode: '94306' },
    { city: 'Philadelphia', state: 'PA', zipCode: '19102' },
    { city: 'Phoenix', state: 'AZ', zipCode: '85004' },
    { city: 'Pittsburgh', state: 'PA', zipCode: '15236' },
    { city: 'Portland', state: 'OR', zipCode: '97209' },
    { city: 'Provo', state: 'UT', zipCode: '84602' },
    { city: 'Raleigh', state: 'NC', zipCode: '27612' },
    { city: 'Redlands', state: 'CA', zipCode: '92373' },
    { city: 'Reston', state: 'VA', zipCode: '20190' },
    { city: 'Richmond', state: 'VA', zipCode: '23230' },
    { city: 'Rockville', state: 'MD', zipCode: '20850' },
    { city: 'Salt Lake City', state: 'UT', zipCode: '84101' },
    { city: 'San Antonio', state: 'TX', zipCode: '78205' },
    { city: 'San Francisco', state: 'CA', zipCode: '94105' },
    { city: 'San Jose', state: 'CA', zipCode: '95113' },
    { city: 'Santa Clara', state: 'CA', zipCode: '95051' },
    { city: 'Scottsdale', state: 'AZ', zipCode: '85255' },
    { city: 'Scottsdale', state: 'AZ', zipCode: '85251' },
    { city: 'Seattle', state: 'WA', zipCode: '98119' },
    { city: 'Somerville', state: 'MA', zipCode: '02145' },
    { city: 'Sunnyvale', state: 'CA', zipCode: '' },
    { city: 'Toronto', state: 'ON', zipCode: 'M5X 1A9' },
    { city: 'Vista', state: 'CA', zipCode: '92083' },
    { city: 'Wayzata', state: 'MN', zipCode: '55391' },
    { city: 'Whippany', state: 'NJ', zipCode: '07981' },
    { city: 'Wilmington', state: 'NC', zipCode: '28401' },
    { city: 'Woodland Hills', state: 'CA', zipCode: '91367' },
    { city: 'Cary', state: 'NC', zipCode: '27519' }
];

// One representative 3-digit USPS zip prefix per state, used only to generate a
// plausible-looking zip when the job's city isn't in KNOWN_ADDRESSES — the user
// asked to always use the job's actual city/state rather than an unrelated one,
// fabricating a zip when a real one isn't on hand.
const STATE_ZIP_PREFIXES = {
    AL: '350', AK: '995', AZ: '850', AR: '716', CA: '900', CO: '800', CT: '060',
    DE: '197', DC: '200', FL: '320', GA: '300', HI: '967', ID: '832', IL: '606',
    IN: '460', IA: '500', KS: '660', KY: '400', LA: '700', ME: '040', MD: '206',
    MA: '021', MI: '480', MN: '550', MS: '390', MO: '630', MT: '590', NE: '680',
    NV: '889', NH: '030', NJ: '070', NM: '870', NY: '100', NC: '270', ND: '580',
    OH: '430', OK: '730', OR: '970', PA: '150', RI: '028', SC: '290', SD: '570',
    TN: '370', TX: '750', UT: '840', VT: '050', VA: '220', WA: '980', WV: '250',
    WI: '530', WY: '820'
};

function parseJobLocation(location) {
    const match = /^([^,]+),\s*([A-Za-z]{2})\b/.exec(String(location || '').trim());
    if (!match) return null;
    return { city: match[1].trim(), state: match[2].toUpperCase() };
}

function generateZip(state) {
    const prefix = STATE_ZIP_PREFIXES[state];
    if (!prefix) return '';
    const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    return `${prefix}${suffix}`;
}

function resolveAddress(jobLocation) {
    const parsed = parseJobLocation(jobLocation);
    if (!parsed) return null;

    const exact = KNOWN_ADDRESSES.find(
        (a) => a.city.toLowerCase() === parsed.city.toLowerCase() && a.state === parsed.state
    );
    if (exact) return exact;

    return { city: parsed.city, state: parsed.state, zipCode: generateZip(parsed.state) };
}

module.exports = { KNOWN_ADDRESSES, resolveAddress };
