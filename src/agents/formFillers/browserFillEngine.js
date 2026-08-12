/**
 * In-page form fill engine, injected into the application page via page.addScriptTag().
 * Ported from https://github.com/SunnyDavid144/job-autofill-extension (field-patterns.ts,
 * detectors/*.ts, autofill/combobox.ts, autofill/engine.ts), adapted from a browser-extension
 * content script into a plain injectable script, and extended with a "relocate" field type
 * and file-input tagging so the Node/Playwright side can drive real file uploads.
 *
 * Exposes window.__jobAgentFillEngine = { fillApplication(profile, options) }
 */
(function () {
    if (window.__jobAgentFillEngine) return; // don't redefine on repeated addScriptTag calls

    // ---------------------------------------------------------------------
    // field-patterns.ts
    // ---------------------------------------------------------------------
    const FIELD_PATTERNS = [
        { type: 'firstName', patterns: [/first[\s_-]?name/i, /given[\s_-]?name/i, /fname/i, /^first$/i] },
        { type: 'lastName', patterns: [/last[\s_-]?name/i, /sur[\s_-]?name/i, /family[\s_-]?name/i, /lname/i, /^last$/i] },
        { type: 'fullName', patterns: [/full[\s_-]?name/i, /^name$/i, /your[\s_-]?name/i, /candidate[\s_-]?name/i] },
        { type: 'email', patterns: [/e[\s_-]?mail/i, /email[\s_-]?address/i, /^email$/i] },
        { type: 'phone', patterns: [/phone/i, /telephone/i, /mobile/i, /cell/i, /contact[\s_-]?number/i] },
        { type: 'location', patterns: [/^location$/i, /current[\s_-]?location/i, /where[\s_-]?are[\s_-]?you[\s_-]?located/i] },
        { type: 'city', patterns: [/^city$/i, /city[\s_-]?name/i, /location\s*\(city\)/i] },
        { type: 'state', patterns: [/^state$/i, /province/i, /state[\s_-]?province/i, /region/i] },
        { type: 'zipCode', patterns: [/zip/i, /postal/i, /post[\s_-]?code/i] },
        { type: 'country', patterns: [/^country$/i, /country[\s_-]?name/i] },
        { type: 'address', patterns: [/street[\s_-]?address/i, /^address$/i, /mailing[\s_-]?address/i] },
        { type: 'linkedIn', patterns: [/linkedin/i, /linked[\s_-]?in/i] },
        { type: 'github', patterns: [/github/i, /git[\s_-]?hub/i] },
        { type: 'portfolio', patterns: [/portfolio/i, /personal[\s_-]?site/i, /work[\s_-]?samples/i] },
        { type: 'website', patterns: [/website/i, /web[\s_-]?site/i, /url/i, /personal[\s_-]?url/i, /blog/i] },
        // More specific phrase patterns (howDidYouHear, salary, startDate, yearsExperience below)
        // are checked before these broad single-word patterns — identifyFieldType returns on the
        // first match, and bare /position/i or /role/i would otherwise swallow phrases like
        // "how did you hear about this position?".
        { type: 'currentCompany', patterns: [/current[\s_-]?company/i, /company[\s_-]?name/i, /employer/i, /organization/i] },
        { type: 'currentTitle', patterns: [/current[\s_-]?title/i, /job[\s_-]?title/i, /^position$/i, /^role$/i] },
        { type: 'school', patterns: [/school/i, /university/i, /college/i, /institution/i, /alma[\s_-]?mater/i] },
        { type: 'degree', patterns: [/degree/i, /qualification/i, /^degree[\s_-]?type$/i] },
        { type: 'fieldOfStudy', patterns: [/field[\s_-]?of[\s_-]?study/i, /major/i, /discipline/i, /concentration/i] },
        { type: 'gpa', patterns: [/gpa/i, /grade[\s_-]?point/i, /cumulative/i] },
        { type: 'gender', patterns: [/gender/i, /sex$/i] },
        { type: 'pronouns', patterns: [/pronoun/i, /what[\s_-]?pronouns/i, /preferred[\s_-]?pronouns/i] },
        { type: 'race', patterns: [/^race$/i, /identify your race/i, /race\/ethnicity/i] },
        { type: 'ethnicity', patterns: [/hispanic/i, /latino/i, /ethnicity/i, /ethnic/i] },
        { type: 'veteranStatus', patterns: [/veteran/i, /military/i, /armed[\s_-]?forces/i] },
        { type: 'disabilityStatus', patterns: [/disability/i, /disabled/i, /handicap/i] },
        { type: 'authorizedToWork', patterns: [/authorized[\s_-]?to[\s_-]?work/i, /work[\s_-]?authorization/i, /legally[\s_-]?authorized/i, /eligible[\s_-]?to[\s_-]?work/i] },
        { type: 'requireSponsorship', patterns: [/sponsorship/i, /visa[\s_-]?sponsor/i, /require[\s_-]?sponsor/i, /immigration[\s_-]?sponsor/i] },
        { type: 'relocate', patterns: [/willing[\s_-]?to[\s_-]?relocate/i, /open[\s_-]?to[\s_-]?relocat/i, /^relocat/i] },
        { type: 'resume', patterns: [/resume/i, /cv$/i, /curriculum[\s_-]?vitae/i] },
        { type: 'coverLetter', patterns: [/cover[\s_-]?letter/i] },
        { type: 'salary', patterns: [/salary/i, /compensation/i, /pay[\s_-]?expectation/i, /desired[\s_-]?pay/i] },
        { type: 'startDate', patterns: [/start[\s_-]?date/i, /available[\s_-]?date/i, /earliest[\s_-]?start/i, /when[\s_-]?can[\s_-]?you[\s_-]?start/i] },
        { type: 'howDidYouHear', patterns: [/how[\s_-]?did[\s_-]?you[\s_-]?hear/i, /referred[\s_-]?by/i, /where[\s_-]?did[\s_-]?you[\s_-]?find/i] },
        { type: 'yearsExperience', patterns: [/years[\s_-]?of[\s_-]?experience/i, /experience[\s_-]?years/i, /how[\s_-]?many[\s_-]?years/i] }
    ];

    function identifyFieldType(text) {
        const normalized = String(text || '').toLowerCase().trim();
        for (const { type, patterns } of FIELD_PATTERNS) {
            for (const pattern of patterns) {
                if (pattern.test(normalized)) return { type, confidence: 0.9 };
            }
        }
        return { type: 'unknown', confidence: 0 };
    }

    function getFieldContext(element) {
        const parts = [];
        const input = element;
        if (input.name) parts.push(input.name);
        if (input.id) parts.push(input.id);
        if (input.placeholder) parts.push(input.placeholder);
        if (input.getAttribute('aria-label')) parts.push(input.getAttribute('aria-label'));

        if (input.id) {
            const label = document.querySelector(`label[for="${cssEscape(input.id)}"]`);
            if (label) parts.push(label.textContent || '');
        }

        const parentLabel = element.closest('label');
        if (parentLabel) parts.push(parentLabel.textContent || '');

        const parent = element.parentElement;
        if (parent) {
            const prevSibling = element.previousElementSibling;
            if (prevSibling && ['LABEL', 'SPAN', 'P'].includes(prevSibling.tagName)) {
                parts.push(prevSibling.textContent || '');
            }
            const containerLabel = parent.querySelector('label, .label, [class*="label"]');
            if (containerLabel && containerLabel !== element) parts.push(containerLabel.textContent || '');
        }

        ['data-qa', 'data-test', 'data-testid', 'data-field', 'data-automation'].forEach((attr) => {
            const val = element.getAttribute(attr);
            if (val) parts.push(val);
        });

        return parts.join(' ');
    }

    function cssEscape(value) {
        return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    }

    function getLabelFor(el) {
        if (el.id) {
            const label = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
            if (label) return (label.textContent || '').trim();
        }
        const parentLabel = el.closest('label');
        if (parentLabel && el.type !== 'radio') return (parentLabel.textContent || '').trim();
        const container = el.closest('[class*="field"], [class*="Field"], [class*="form-group"]');
        if (container) {
            const label = container.querySelector('label, [class*="label"]');
            if (label) return (label.textContent || '').trim();
        }
        return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
    }

    function isVisible(el) {
        if (!el.offsetParent && el.style.position !== 'fixed') return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    // ---------------------------------------------------------------------
    // detectors/greenhouse.ts, lever.ts, ashby.ts, generic.ts
    // ---------------------------------------------------------------------
    function detectGreenhouse() {
        const url = window.location.href;
        const canDetect = url.includes('greenhouse.io') ||
            !!document.querySelector('#application_form, #grnhse_app, [id*="greenhouse"], [class*="greenhouse"]') ||
            !!document.querySelector('#first_name, #last_name');
        if (!canDetect) return null;

        const fields = [];
        const form = document.querySelector('#application_form, #grnhse_app, form');
        const knownMappings = {
            first_name: 'firstName', last_name: 'lastName', email: 'email', phone: 'phone',
            location: 'city', linkedin_url: 'linkedIn', github_url: 'github',
            portfolio_url: 'portfolio', website_url: 'website',
            current_company: 'currentCompany', current_title: 'currentTitle'
        };

        for (const [id, fieldType] of Object.entries(knownMappings)) {
            const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`) || document.querySelector(`[name*="${id}"]`);
            if (el) fields.push({ element: el, fieldType, platform: 'greenhouse', label: getLabelFor(el) || id.replace(/_/g, ' ') });
        }

        collectRemaining(fields, form, 'greenhouse');
        collectFileInputs(fields, document, 'greenhouse');

        return { platform: 'greenhouse', fields, isApplicationPage: fields.length >= 2 };
    }

    function detectLever() {
        const canDetect = window.location.href.includes('jobs.lever.co') ||
            !!document.querySelector('.posting-page') ||
            !!document.querySelector('[data-qa="application-form"]');
        if (!canDetect) return null;

        const fields = [];
        const form = document.querySelector('.application-form, form.postings-form, form');
        const leverMappings = {
            name: 'fullName', email: 'email', phone: 'phone', org: 'currentCompany',
            'urls[LinkedIn]': 'linkedIn', 'urls[GitHub]': 'github', 'urls[Portfolio]': 'portfolio',
            'urls[Twitter]': 'website', 'urls[Other]': 'website'
        };

        for (const [name, fieldType] of Object.entries(leverMappings)) {
            const el = document.querySelector(`[name="${name}"]`);
            if (el) fields.push({ element: el, fieldType, platform: 'lever', label: getLabelFor(el) || name });
        }

        collectRemaining(fields, form || document, 'lever');
        collectFileInputs(fields, document, 'lever');

        return { platform: 'lever', fields, isApplicationPage: fields.length >= 2 };
    }

    function detectAshby() {
        const canDetect = window.location.href.includes('ashbyhq.com') ||
            !!document.querySelector('[class*="ashby"]') ||
            !!document.querySelector('form[class*="application"]');
        if (!canDetect) return null;

        const fields = [];
        const form = document.querySelector('form');
        const searchRoot = form || document;

        searchRoot.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea').forEach((el) => {
            if (['radio', 'checkbox', 'hidden'].includes(el.type)) return;
            if (!isVisible(el)) return;
            const label = getLabelFor(el);
            const { type, confidence } = identifyFieldType(`${label} ${getFieldContext(el)}`);
            if (type !== 'unknown' && confidence > 0.5) fields.push({ element: el, fieldType: type, platform: 'ashby', label: label || type });
        });

        searchRoot.querySelectorAll('select').forEach((el) => {
            const label = getLabelFor(el);
            const { type, confidence } = identifyFieldType(`${label} ${getFieldContext(el)}`);
            if (type !== 'unknown' && confidence > 0.5) fields.push({ element: el, fieldType: type, platform: 'ashby', label: label || type });
        });

        collectFileInputs(fields, searchRoot, 'ashby');

        return { platform: 'ashby', fields, isApplicationPage: fields.length >= 2 };
    }

    function detectGeneric() {
        const url = window.location.href.toLowerCase();
        const looksLikeApplyUrl = url.includes('/apply') || url.includes('/application') || url.includes('/careers/') || url.includes('/jobs/');
        const pageText = document.body.innerText.toLowerCase();
        const keywordHits = ['apply', 'application', 'submit your', 'personal information', 'upload resume', 'cover letter'].filter((k) => pageText.includes(k)).length;
        if (!looksLikeApplyUrl && keywordHits < 2) return null;

        const fields = [];
        const forms = Array.from(document.querySelectorAll('form'));
        const form = forms.reduce((best, current) => {
            if (!best) return current;
            const bestCount = best.querySelectorAll('input, select, textarea').length;
            const currentCount = current.querySelectorAll('input, select, textarea').length;
            return currentCount > bestCount ? current : best;
        }, null) || document;

        collectRemaining(fields, form, 'generic');
        collectFileInputs(fields, form, 'generic');

        return { platform: 'generic', fields, isApplicationPage: fields.length >= 2 };
    }

    function collectRemaining(fields, root, platform) {
        const matched = new Set(fields.map((f) => f.element));
        (root || document).querySelectorAll('input, select, textarea').forEach((el) => {
            if (matched.has(el)) return;
            if (['hidden', 'submit', 'file', 'button', 'radio', 'checkbox'].includes(el.type)) return;
            if (!isVisible(el)) return;
            const context = getFieldContext(el);
            const label = getLabelFor(el);
            const { type, confidence } = identifyFieldType(`${label} ${context}`);
            if (type !== 'unknown' && confidence > 0.5) {
                fields.push({ element: el, fieldType: type, platform, label: label || context.substring(0, 40) });
            }
        });
    }

    function collectFileInputs(fields, root, platform) {
        const matched = new Set(fields.map((f) => f.element));
        (root || document).querySelectorAll('input[type="file"]').forEach((el) => {
            if (matched.has(el)) return;
            const context = (getFieldContext(el) + ' ' + getLabelFor(el)).toLowerCase();
            const isCover = context.includes('cover');
            fields.push({ element: el, fieldType: isCover ? 'coverLetter' : 'resume', platform, label: isCover ? 'Cover Letter' : 'Resume' });
        });
    }

    function detectFields() {
        const attempts = [detectGreenhouse, detectLever, detectAshby];
        for (const attempt of attempts) {
            const result = attempt();
            if (result && result.isApplicationPage) return result;
        }
        return detectGeneric() || { platform: 'unknown', fields: [], isApplicationPage: false };
    }

    // ---------------------------------------------------------------------
    // autofill/combobox.ts
    // ---------------------------------------------------------------------
    function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

    function setNativeValue(input, value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(input, value);
        else input.value = value;
    }

    // Search within the trigger's own dropdown container, not the whole document — a page-wide
    // querySelector can match an unrelated-but-already-present element (e.g. a hidden phone
    // country-code picker's markup, which is always in the DOM) instead of the menu we just opened.
    function scopeRootFor(trigger) {
        return trigger.closest('.field-wrapper') ||
            trigger.closest('[class*="field"]') ||
            trigger.closest('[class*="question"]') ||
            document;
    }

    function waitForElement(selector, timeout, root) {
        const searchRoot = root || document;
        return new Promise((resolve) => {
            const existing = searchRoot.querySelector(selector);
            if (existing && isVisible(existing)) { resolve(existing); return; }
            const observer = new MutationObserver(() => {
                const el = searchRoot.querySelector(selector);
                if (el && isVisible(el)) { observer.disconnect(); resolve(el); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
        });
    }

    function isCustomCombobox(element) {
        const role = element.getAttribute('role');
        const ariaHasPopup = element.getAttribute('aria-haspopup');
        const ariaExpanded = element.getAttribute('aria-expanded');
        const hasListbox = element.getAttribute('aria-controls') || element.getAttribute('aria-owns');
        if (role === 'combobox') return true;
        if (ariaHasPopup === 'listbox' || ariaHasPopup === 'true') return true;
        if (ariaExpanded !== null) return true;
        if (hasListbox) return true;
        const parent = element.closest('[role="combobox"], [class*="combobox"], [class*="dropdown"], [class*="select"]');
        return !!(parent && parent !== element);
    }

    async function simulateTyping(input, value, clearFirst) {
        if (clearFirst) {
            input.focus();
            setNativeValue(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(50);
        }
        for (let i = 0; i < value.length; i++) {
            const char = value[i];
            input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            setNativeValue(input, value.substring(0, i + 1));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            if (i < Math.min(value.length - 1, 5)) await delay(30);
        }
        await delay(100);
    }

    async function selectBestOption(container, value, optionSelector) {
        const normalizedValue = value.toLowerCase().trim();
        const selectors = optionSelector || '[role="option"], [role="menuitem"], li, [class*="option"]';
        const options = Array.from(container.querySelectorAll(selectors));
        if (options.length === 0) return null;

        let bestMatch = null;
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            const normalizedText = text.toLowerCase();
            if (!text) continue;

            let score = 0;
            if (normalizedText === normalizedValue) score = 100;
            else if (normalizedText.startsWith(normalizedValue)) score = 80;
            else if (normalizedText.includes(normalizedValue)) score = 60;
            else if (normalizedValue.includes(normalizedText)) score = 40;
            else {
                const valueWords = normalizedValue.split(/\s+/);
                const textWords = normalizedText.split(/\s+/);
                const matched = valueWords.filter((w) => textWords.some((tw) => tw.includes(w) || w.includes(tw)));
                if (matched.length > 0) score = (matched.length / valueWords.length) * 30;
            }

            if (score > 0 && (!bestMatch || score > bestMatch.score)) bestMatch = { element: opt, score, text };
        }

        if (bestMatch && bestMatch.score >= 30) {
            const el = bestMatch.element;
            el.scrollIntoView({ block: 'nearest' });
            await delay(50);
            el.click();
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            await delay(100);
            return bestMatch.text;
        }
        return null;
    }

    async function tryTypeAndSelect(trigger, value, opts) {
        trigger.focus();
        trigger.click();
        trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        const scopeRoot = scopeRootFor(trigger);
        const dropdown = await waitForElement(
            opts.dropdownSelector || '[role="listbox"], [role="menu"], [class*="dropdown"], [class*="options"], [class*="listbox"]',
            opts.timeout,
            scopeRoot
        );
        if (!dropdown) return { success: false, method: 'failed' };

        if (trigger.tagName === 'INPUT') {
            await simulateTyping(trigger, value, opts.clearFirst);
            await delay(300);
        }

        const selected = await selectBestOption(dropdown, value, opts.optionSelector);
        return selected ? { success: true, method: 'type-and-select', selectedText: selected } : { success: false, method: 'failed' };
    }

    async function tryScanAndSelect(trigger, value, opts) {
        trigger.focus();
        trigger.click();
        await delay(200);

        const scopeRoot = scopeRootFor(trigger);
        const dropdown = scopeRoot.querySelector(opts.dropdownSelector || '[role="listbox"], [role="menu"], [class*="dropdown"], [class*="options"], [class*="listbox"]');
        if (!dropdown) return { success: false, method: 'failed' };

        let selected = await selectBestOption(dropdown, value, opts.optionSelector);
        if (selected) return { success: true, method: 'direct-select', selectedText: selected };

        const scrollable = dropdown.querySelector('[class*="scroll"], [style*="overflow"]') || dropdown;
        for (let i = 0; i < 5; i++) {
            scrollable.scrollTop += 200;
            await delay(150);
            selected = await selectBestOption(dropdown, value, opts.optionSelector);
            if (selected) return { success: true, method: 'direct-select', selectedText: selected };
        }
        return { success: false, method: 'failed' };
    }

    async function fillCombobox(options) {
        const { trigger, value, timeout = 2500, dropdownSelector, optionSelector, clearFirst = true } = options;

        const typeAndSelect = await tryTypeAndSelect(trigger, value, { timeout, dropdownSelector, optionSelector, clearFirst });
        if (typeAndSelect.success) return typeAndSelect;

        const scanAndSelect = await tryScanAndSelect(trigger, value, { timeout, dropdownSelector, optionSelector });
        if (scanAndSelect.success) return scanAndSelect;

        if (trigger.tagName === 'INPUT') {
            await simulateTyping(trigger, value, clearFirst);
            trigger.dispatchEvent(new Event('blur', { bubbles: true }));
            return { success: true, method: 'type-only', selectedText: value };
        }
        return { success: false, method: 'failed' };
    }

    // ---------------------------------------------------------------------
    // autofill/engine.ts
    // ---------------------------------------------------------------------
    function getValueForField(fieldType, profile) {
        const { personal, eeo, workExperience, education } = profile;
        switch (fieldType) {
            case 'firstName': return personal.firstName || null;
            case 'lastName': return personal.lastName || null;
            case 'fullName': return personal.firstName && personal.lastName ? `${personal.firstName} ${personal.lastName}` : null;
            case 'email': return personal.email || null;
            case 'phone': return personal.phone || null;
            case 'location': return [personal.city, personal.state, personal.country].filter(Boolean).join(', ') || null;
            case 'city': return personal.city || null;
            case 'state': return personal.state || null;
            case 'zipCode': return personal.zipCode || null;
            case 'country': return personal.country || null;
            case 'address': return personal.location || null;
            case 'linkedIn': return personal.linkedIn || null;
            case 'github': return personal.github || null;
            case 'portfolio': return personal.portfolio || null;
            case 'website': return personal.website || personal.portfolio || null;
            case 'currentCompany': {
                const current = workExperience.find((w) => w.current) || workExperience[0];
                return current?.company || null;
            }
            case 'currentTitle': {
                const current = workExperience.find((w) => w.current) || workExperience[0];
                return current?.title || null;
            }
            case 'school': return education[0]?.school || null;
            case 'degree': return education[0]?.degree || null;
            case 'fieldOfStudy': return education[0]?.field || null;
            case 'gpa': return education[0]?.gpa || null;
            case 'gender': return eeo.gender || null;
            case 'pronouns': return eeo.pronouns || null;
            case 'race': return eeo.race || null;
            case 'ethnicity': return eeo.ethnicity || null;
            case 'veteranStatus': return eeo.veteranStatus || null;
            case 'disabilityStatus': return eeo.disabilityStatus || null;
            case 'authorizedToWork': return eeo.authorizedToWork ? 'Yes' : 'No';
            case 'requireSponsorship': return eeo.requireSponsorship ? 'Yes' : 'No';
            case 'relocate': return typeof eeo.willingToRelocate === 'boolean' ? (eeo.willingToRelocate ? 'Yes' : 'No') : null;
            default: return null;
        }
    }

    function matchCustomAnswer(field, customAnswers) {
        if (!customAnswers || customAnswers.length === 0) return null;
        const fieldLabel = (field.label || '').toLowerCase().trim();
        if (!fieldLabel || fieldLabel.length < 3) return null;

        let bestMatch = null;
        for (const qa of customAnswers) {
            if (!qa.question || !qa.answer) continue;
            const keywords = qa.question.toLowerCase().trim().split(/\s+/);
            const normalizedQuestion = qa.question.toLowerCase().trim();
            let score = 0;

            if (fieldLabel === normalizedQuestion) score = 100;
            else if (fieldLabel.includes(normalizedQuestion)) score = 90;
            else if (normalizedQuestion.includes(fieldLabel)) score = 80;
            else {
                const fieldWords = fieldLabel.split(/\s+/);
                const matched = keywords.filter((kw) => kw.length >= 3 && fieldWords.some((fw) => fw.includes(kw) || kw.includes(fw)));
                if (matched.length > 0) score = (matched.length / keywords.length) * 60;
            }

            if (score > 0 && (!bestMatch || score > bestMatch.score)) bestMatch = { answer: qa.answer, score };
        }
        return bestMatch && bestMatch.score >= 40 ? bestMatch.answer : null;
    }

    // Frameworks like React override the native `value` setter on a controlled <select> to
    // intercept writes for their own state tracking. Assigning `select.value =` directly hits
    // that override and the visible widget never updates, even though the raw DOM briefly
    // changed. Going through the original native prototype setter first (same trick setTextValue
    // already uses for inputs) bypasses the override so the framework's change listener actually
    // observes the mutation.
    function setNativeSelectValue(select, value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(select, value); else select.value = value;
    }

    function setSelectValue(select, value) {
        const normalizedValue = value.toLowerCase().trim();
        const options = Array.from(select.options);
        const scored = options
            .filter((opt) => opt.value !== '' || opt.text.trim() !== '')
            .map((opt) => {
                const text = opt.text.toLowerCase().trim();
                const val = opt.value.toLowerCase().trim();
                let score = 0;
                if (val === normalizedValue) score = 100;
                else if (text === normalizedValue) score = 95;
                else if (val.startsWith(normalizedValue)) score = 80;
                else if (text.startsWith(normalizedValue)) score = 75;
                else if (text.includes(normalizedValue) || normalizedValue.includes(text)) score = 60;
                else {
                    const overlap = normalizedValue.split(/\s+/).filter((w) => text.split(/\s+/).includes(w)).length;
                    if (overlap > 0) score = overlap * 20;
                }
                return { option: opt, score };
            })
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
            setNativeSelectValue(select, scored[0].option.value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }

        if (value === 'Yes' || value === 'No') {
            const boolOption = options.find((opt) => {
                const t = opt.text.toLowerCase().trim();
                return t === value.toLowerCase() || t === (value === 'Yes' ? 'true' : 'false');
            });
            if (boolOption) {
                setNativeSelectValue(select, boolOption.value);
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        }
        return false;
    }

    function setCheckboxRadioValue(input, value) {
        const shouldCheck = ['yes', 'true', '1'].includes(String(value).toLowerCase());
        if (input.type === 'radio') {
            const name = input.name;
            if (!name) {
                input.checked = shouldCheck;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            const radios = document.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`);
            const normalizedValue = String(value).toLowerCase().trim();
            for (const radio of radios) {
                const label = document.querySelector(`label[for="${cssEscape(radio.id)}"]`);
                const labelText = (label?.textContent || '').toLowerCase().trim();
                const parentText = (radio.parentElement?.textContent || '').toLowerCase().trim();
                if (radio.value.toLowerCase().trim() === normalizedValue || labelText === normalizedValue ||
                    labelText.includes(normalizedValue) || parentText === normalizedValue || parentText.includes(normalizedValue)) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                    radio.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }
            }
            return false;
        }
        input.checked = shouldCheck;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function getRadioOptionText(radio) {
        const parentLabel = radio.closest('label');
        if (parentLabel) {
            const clone = parentLabel.cloneNode(true);
            clone.querySelectorAll('input').forEach((i) => i.remove());
            return (clone.textContent || '').trim();
        }
        if (radio.id) {
            const label = document.querySelector(`label[for="${cssEscape(radio.id)}"]`);
            if (label) return (label.textContent || '').trim();
        }
        const next = radio.nextElementSibling;
        if (next) return (next.textContent || '').trim();
        return radio.value || '';
    }

    function getRadioLabel(radio) {
        const parentLabel = radio.closest('label');
        if (parentLabel) return parentLabel;
        if (radio.id) {
            const label = document.querySelector(`label[for="${cssEscape(radio.id)}"]`);
            if (label) return label;
        }
        return radio.parentElement;
    }

    async function fillRadioGroup(radio, value) {
        const name = radio.name;
        if (!name) return false;
        const normalizedValue = String(value).toLowerCase().trim().replace(/\s+/g, ' ');
        if (!normalizedValue) return false;

        const allRadios = document.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`);
        if (allRadios.length < 2) return false;

        let bestRadio = null;
        let bestScore = 0;
        for (const r of allRadios) {
            const optionText = getRadioOptionText(r).toLowerCase().trim().replace(/\s+/g, ' ');
            const radioValue = (r.value || '').toLowerCase().trim();
            let score = 0;

            if (optionText === normalizedValue || radioValue === normalizedValue) score = 100;
            else if (normalizedValue === 'yes' && /^yes\b/i.test(optionText)) score = 95;
            else if (normalizedValue === 'no' && /^no\b/i.test(optionText)) score = 95;
            else if (optionText.startsWith(normalizedValue)) score = 85;
            else if (normalizedValue.startsWith(optionText) && optionText.length > 4) score = 80;

            if (score > bestScore) { bestScore = score; bestRadio = r; }
        }

        if (bestRadio && bestScore >= 60) {
            const label = getRadioLabel(bestRadio);
            (label || bestRadio).click();
            await delay(100);
            bestRadio.dispatchEvent(new Event('change', { bubbles: true }));
            bestRadio.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }
        return false;
    }

    // Only field types that are plausibly rendered as clickable button/radio groups
    // (Yes/No toggles, EEO self-identification) should pay the cost of the option-group
    // search below — running it for plain text fields (name/email/etc.) risks false-
    // positive matches against unrelated nearby labels and swallows the real text-input path.
    const CLICKABLE_GROUP_FIELD_TYPES = new Set([
        'gender', 'pronouns', 'race', 'ethnicity', 'veteranStatus', 'disabilityStatus',
        'authorizedToWork', 'requireSponsorship', 'relocate'
    ]);

    function findOptionGroupContainer(element) {
        let parent = element.parentElement;
        for (let i = 0; i < 8 && parent; i++) {
            const options = parent.querySelectorAll('input[type="radio"], [role="radio"], label, [class*="option"], [class*="choice"]');
            if (options.length >= 2) return parent;
            parent = parent.parentElement;
        }
        return null;
    }

    async function tryClickableOptionGroup(element, value, fieldType) {
        if (!CLICKABLE_GROUP_FIELD_TYPES.has(fieldType)) return { attempted: false, success: false };
        const container = element.closest('[role="radiogroup"], [class*="radio"], [class*="button-group"], [class*="ButtonGroup"], [class*="toggle"]') ||
            findOptionGroupContainer(element);
        if (!container) return { attempted: false, success: false };

        const options = Array.from(container.querySelectorAll('label, [role="radio"], [role="option"], button, [class*="option"], [class*="choice"], [class*="radio"], [data-value], input[type="radio"]'));
        if (options.length < 2) return { attempted: false, success: false };

        const normalizedValue = String(value).toLowerCase().trim().replace(/\s+/g, ' ');
        if (!normalizedValue) return { attempted: true, success: false };

        let bestMatch = null;
        let bestScore = 0;
        for (const option of options) {
            const rawText = (option.textContent || '').trim();
            const text = rawText.toLowerCase().replace(/\s+/g, ' ');
            const dataValue = (option.getAttribute('data-value') || option.getAttribute('value') || '').toLowerCase().trim();
            if (!text || text.length > 150) continue;

            let score = 0;
            if (text === normalizedValue || dataValue === normalizedValue) score = 100;
            else if (normalizedValue === 'yes' && /^yes\b/.test(text)) score = 95;
            else if (normalizedValue === 'no' && /^no\b/.test(text)) score = 95;
            else if (text.startsWith(normalizedValue) && (text.length === normalizedValue.length || [' ', '(', ','].includes(text[normalizedValue.length]))) score = 85;
            else if (normalizedValue.startsWith(text) && text.length > 3) score = 80;

            if (score > bestScore) { bestScore = score; bestMatch = option; }
        }

        if (bestMatch && bestScore >= 60) {
            bestMatch.click();
            const innerInput = bestMatch.querySelector('input[type="radio"], input[type="checkbox"]');
            if (innerInput && !innerInput.checked) {
                innerInput.checked = true;
                innerInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await delay(100);
            return { attempted: true, success: true };
        }
        return { attempted: true, success: false };
    }

    function setTextValue(el, value) {
        const input = el;
        input.focus();
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        const setter = el.tagName === 'TEXTAREA' ? nativeTextAreaSetter : nativeInputSetter;

        if (setter) setter.call(input, value); else input.value = value;

        input.dispatchEvent(new Event('focus', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: value }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        return input.value === value;
    }

    async function setTextValueWithEvents(el, value) {
        const input = el;
        input.focus();
        input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        await delay(30);

        const setter = Object.getOwnPropertyDescriptor(
            el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (setter) setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(20);

        for (let i = 0; i < value.length; i++) {
            const char = value[i];
            input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
            if (setter) setter.call(input, value.substring(0, i + 1));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            if (i < 3) await delay(10);
        }

        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        await delay(30);
        return input.value === value;
    }

    function isFieldDisabled(element) {
        const el = element;
        if (el.disabled || el.readOnly) return true;
        if (el.getAttribute('aria-disabled') === 'true') return true;
        const style = window.getComputedStyle(element);
        return style.pointerEvents === 'none' && style.opacity === '0';
    }

    function fieldAlreadyHasValue(element, value) {
        const el = element;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            if (el.type === 'radio' || el.type === 'checkbox') return false;
            return el.value === value;
        }
        if (el.tagName === 'SELECT') {
            const selectedText = el.options[el.selectedIndex]?.text || '';
            return el.value === value || selectedText.toLowerCase().includes(value.toLowerCase());
        }
        return false;
    }

    function verifyFieldValue(element, expectedValue) {
        const el = element;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value === expectedValue;
        if (el.tagName === 'SELECT') {
            const selectedText = el.options[el.selectedIndex]?.text?.toLowerCase() || '';
            const selectedValue = el.value.toLowerCase();
            const expected = expectedValue.toLowerCase();
            return selectedValue === expected || selectedText.includes(expected) || expected.includes(selectedText);
        }
        return true;
    }

    function getFieldPriority(field) {
        const el = field.element;
        const isCombo = field.isCombobox || isCustomCombobox(el);
        if (isCombo) return 3;
        if (el.tagName === 'SELECT') return 2;
        if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return 2;
        return 1;
    }

    async function fillSingleField(field, value) {
        const element = field.element;
        const isCombobox = field.isCombobox || isCustomCombobox(element);

        try {
            if (element.tagName === 'INPUT' && element.type === 'radio') {
                const success = await fillRadioGroup(element, value);
                return { success, method: 'radio-group-click' };
            }

            const clickableResult = await tryClickableOptionGroup(element, value, field.fieldType);
            if (clickableResult.attempted) return { success: clickableResult.success, method: 'click-option' };

            if (isCombobox) {
                const result = await fillCombobox({ trigger: element, value, timeout: 2500, clearFirst: true });
                return { success: result.success, method: `combobox-${result.method}` };
            }

            if (element.tagName === 'SELECT') {
                return { success: setSelectValue(element, value), method: 'native-select' };
            }

            if (element.tagName === 'INPUT' && (element.type === 'checkbox' || element.type === 'radio')) {
                const success = setCheckboxRadioValue(element, value);
                return { success, method: 'checkbox-radio' };
            }

            if (element.getAttribute('contenteditable') === 'true') {
                element.textContent = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, method: 'contenteditable' };
            }

            const success = setTextValue(element, value);
            await delay(60);
            const actual = element.value;
            if (actual !== value && success) {
                const retry = await setTextValueWithEvents(element, value);
                return { success: retry, method: 'text-input-retry' };
            }
            return { success, method: 'text-input' };
        } catch (err) {
            return { success: false, method: 'error' };
        }
    }

    async function fillFields(fields, profile, options) {
        const opts = Object.assign({ delayBetweenFields: 150, maxRetries: 2 }, options || {});
        const results = [];

        const seen = new Set();
        const deduped = fields.filter((f) => {
            if (seen.has(f.element)) return false;
            seen.add(f.element);
            return true;
        });

        const sorted = [...deduped].sort((a, b) => getFieldPriority(a) - getFieldPriority(b));

        for (let i = 0; i < sorted.length; i++) {
            const field = sorted[i];
            if (isFieldDisabled(field.element)) continue;

            let value = getValueForField(field.fieldType, profile);
            if (value === null || value === undefined) value = matchCustomAnswer(field, profile.customAnswers);
            if (value === null || value === undefined) {
                results.push({ field, success: false, value: null, method: 'no-value' });
                continue;
            }

            if (fieldAlreadyHasValue(field.element, value)) {
                results.push({ field, success: true, value, method: 'already-filled' });
                continue;
            }

            const stringValue = String(value);
            let success = false;
            let method = 'direct';
            const isClickBased = field.element.tagName === 'INPUT' && field.element.type === 'radio';
            const maxAttempts = isClickBased ? 0 : (opts.maxRetries || 0);

            for (let attempt = 0; attempt <= maxAttempts; attempt++) {
                if (attempt > 0) await delay(200 * attempt);
                const fillResult = await fillSingleField(field, stringValue);
                success = fillResult.success;
                method = fillResult.method;
                if (success) break;
            }

            if (success && !method.includes('radio') && !method.includes('click') && !method.includes('combobox')) {
                if (field.element.tagName === 'INPUT' || field.element.tagName === 'TEXTAREA') {
                    if (field.element.type !== 'radio' && field.element.type !== 'checkbox') {
                        if (!verifyFieldValue(field.element, stringValue)) {
                            success = false;
                            method = `${method}-unverified`;
                        }
                    }
                }
            }

            results.push({ field, success, value: stringValue, method });

            if (i < sorted.length - 1 && opts.delayBetweenFields) await delay(opts.delayBetweenFields);
        }

        return results;
    }

    // ---------------------------------------------------------------------
    // File input tagging — real uploads are driven from Node/Playwright
    // (browser JS has no filesystem access), so we just locate and tag
    // the file input(s) and any dedicated "Attach"-style trigger button.
    // ---------------------------------------------------------------------
    function findUploadTrigger(fileInput) {
        const container = fileInput.closest('[class*="file-upload"], [class*="upload"], .field-wrapper') || fileInput.parentElement;
        if (!container) return null;
        return Array.from(container.querySelectorAll('button')).find((b) => /attach|upload|browse|choose file/i.test(b.textContent || '')) || null;
    }

    function tagFileInputs(fields) {
        let hasResumeInput = false;
        let hasCoverLetterInput = false;

        fields.forEach((field) => {
            if (field.fieldType === 'resume') {
                field.element.setAttribute('data-job-agent-resume-input', '1');
                hasResumeInput = true;
                const trigger = findUploadTrigger(field.element);
                if (trigger) trigger.setAttribute('data-job-agent-resume-trigger', '1');
            } else if (field.fieldType === 'coverLetter') {
                field.element.setAttribute('data-job-agent-cover-input', '1');
                hasCoverLetterInput = true;
                const trigger = findUploadTrigger(field.element);
                if (trigger) trigger.setAttribute('data-job-agent-cover-trigger', '1');
            }
        });

        return { hasResumeInput, hasCoverLetterInput };
    }

    // ---------------------------------------------------------------------
    // Required-field gap pass — catches fields the structured detectors above
    // don't recognize as any known fieldType at all (e.g. a plain "Describe a
    // project you've deployed" text input), plus known fields the structured
    // pass still left empty. Only elements that are actually required (HTML
    // required/aria-required, or a "*" in the visible label) are collected,
    // since the goal is guaranteeing submission isn't blocked — not guessing
    // at optional fields nobody asked about.
    // ---------------------------------------------------------------------
    const CATCHALL_ID_ATTR = 'data-job-agent-catchall-id';
    const CLICKGROUP_OPTION_ATTR = 'data-job-agent-clickgroup-option';

    function isRequiredField(element) {
        if (element.required) return true;
        if (element.getAttribute('aria-required') === 'true') return true;
        const context = `${getLabelFor(element)} ${getFieldContext(element)}`;
        return /\*/.test(context);
    }

    function isEmptyValue(element) {
        if (element.tagName === 'SELECT') {
            const selected = element.options[element.selectedIndex];
            if (!selected || !element.value) return true;
            return element.selectedIndex === 0 && /^\s*(select|choose|--|please)/i.test(selected.text || '');
        }
        return !String(element.value || '').trim();
    }

    // Some ATSes (Ashby) render a Yes/No question as two <button> elements with a native
    // checkbox elsewhere in the DOM purely for form serialization — the checkbox has no click
    // handler of its own, so the only way to actually answer the question is to click the real
    // button. Walk up from the checkbox looking for a nearby cluster of 2+ short-text buttons.
    function findClickableButtonGroup(element) {
        let parent = element.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
            const buttons = Array.from(parent.querySelectorAll('button')).filter((b) => {
                const text = (b.textContent || '').trim();
                return text && text.length <= 30;
            });
            if (buttons.length >= 2) return buttons;
            parent = parent.parentElement;
        }
        return null;
    }

    function findRequiredEmptyFields() {
        const seenGroups = new Set();
        const gaps = [];
        let counter = 0;

        const candidates = Array.from(document.querySelectorAll('input, select, textarea')).filter((el) =>
            isVisible(el) &&
            !isFieldDisabled(el) &&
            !['hidden', 'submit', 'button', 'file'].includes(el.type) &&
            el.name !== 'g-recaptcha-response' &&
            !/recaptcha/i.test(el.className || '')
        );

        for (const el of candidates) {
            if (el.type === 'radio' || el.type === 'checkbox') {
                const groupKey = el.name || el;
                if (seenGroups.has(groupKey)) continue;
                seenGroups.add(groupKey);

                const group = el.name
                    ? Array.from(document.querySelectorAll(`input[type="${el.type}"][name="${cssEscape(el.name)}"]`))
                    : [el];
                if (!group.some(isRequiredField)) continue;

                if (el.type === 'checkbox') {
                    const buttonGroup = findClickableButtonGroup(el);
                    if (buttonGroup) {
                        // For this widget the backing checkbox isn't a reliable proxy for
                        // whether the question's been answered (it can be decoupled from the
                        // visible buttons) — check the button's own "selected" signal instead.
                        const alreadyAnswered = buttonGroup.some((b) =>
                            /\bactive\b|\bselected\b/i.test(b.className) ||
                            b.getAttribute('aria-pressed') === 'true' ||
                            b.getAttribute('aria-checked') === 'true' ||
                            b.getAttribute('aria-selected') === 'true'
                        );
                        if (alreadyAnswered) continue;

                        const id = `catchall-${counter++}`;
                        el.setAttribute(CATCHALL_ID_ATTR, id);
                        // Tag each option button so Node/Playwright can target a real, trusted
                        // click on it directly — a JS-level el.click() inside page.evaluate()
                        // produces an untrusted synthetic event that some UI libraries' click
                        // handlers silently ignore for state updates.
                        buttonGroup.forEach((b, index) => b.setAttribute(CLICKGROUP_OPTION_ATTR, `${id}:${index}`));
                        gaps.push({
                            id,
                            label: getLabelFor(el) || getFieldContext(el),
                            elementType: 'click-group',
                            options: buttonGroup.map((b) => (b.textContent || '').trim())
                        });
                        continue;
                    }
                }

                if (group.some((g) => g.checked)) continue;

                const id = `catchall-${counter++}`;
                group.forEach((g) => g.setAttribute(CATCHALL_ID_ATTR, id));
                const options = el.type === 'radio' ? group.map(getRadioOptionText).filter(Boolean) : null;
                gaps.push({ id, label: getLabelFor(el) || getFieldContext(el), elementType: el.type === 'radio' ? 'radio-group' : 'checkbox', options });
                continue;
            }

            if (!isRequiredField(el) || !isEmptyValue(el)) continue;

            const id = `catchall-${counter++}`;
            el.setAttribute(CATCHALL_ID_ATTR, id);
            const isSelect = el.tagName === 'SELECT';
            const options = isSelect
                ? Array.from(el.options)
                    .map((opt) => opt.text.trim())
                    .filter((text) => text && !/^(select|choose|--|please)/i.test(text))
                : null;
            gaps.push({
                id,
                label: getLabelFor(el) || getFieldContext(el),
                elementType: isSelect ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
                options
            });
        }

        return gaps;
    }

    async function applyCatchAllValue(id, elementType, value) {
        const el = document.querySelector(`[${CATCHALL_ID_ATTR}="${id}"]`);
        if (!el) return false;

        // 'click-group' is applied from Node via a real Playwright click (see fillRequiredGaps),
        // not here — a JS-level click inside page.evaluate() is untrusted and some UI libraries
        // ignore it for state updates.

        if (elementType === 'checkbox') {
            // A real click (not a direct .checked assignment) is what properly notifies a
            // framework's controlled-component state — same reasoning as the native-setter fix
            // for <select>, but click is the more natural equivalent for a checkbox since that's
            // exactly the interaction a real user performs.
            if (!el.checked) el.click();
            if (!el.checked) {
                el.checked = true;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
        }
        if (elementType === 'radio-group') return fillRadioGroup(el, value);
        if (elementType === 'select') return setSelectValue(el, value);

        // A "text" gap can actually be a custom combobox in disguise (same widget family as
        // the structured location/sponsorship fields) — plain setTextValue won't register as a
        // real selection for those, so route through the same click-open-select mechanism the
        // structured pass already uses successfully.
        if (isCustomCombobox(el)) {
            const result = await fillCombobox({ trigger: el, value, timeout: 2500, clearFirst: true });
            if (result.success) return true;
        }
        return setTextValue(el, value);
    }

    // ---------------------------------------------------------------------
    // Public entry point
    // ---------------------------------------------------------------------
    async function fillApplication(profile, options) {
        const detection = detectFields();
        const { hasResumeInput, hasCoverLetterInput } = tagFileInputs(detection.fields);

        const fillableFields = detection.fields.filter((f) => f.fieldType !== 'resume' && f.fieldType !== 'coverLetter');
        const results = await fillFields(fillableFields, profile, options);

        return {
            platform: detection.platform,
            hasResumeInput,
            hasCoverLetterInput,
            results: results.map((r) => ({
                label: r.field.label,
                fieldType: r.field.fieldType,
                success: r.success,
                method: r.method,
                value: r.value
            }))
        };
    }

    window.__jobAgentFillEngine = {
        fillApplication,
        findRequiredEmptyFields,
        applyCatchAllValue,
        __debug: { detectFields, getValueForField }
    };
})();
