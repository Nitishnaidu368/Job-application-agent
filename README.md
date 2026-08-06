# Job Application Agent - Nitish Kandi

An autonomous AI agent that scrapes job listings from ZobNest and automatically fills out applications on Lever, Ashby, and Greenhouse platforms.

## Architecture

```
┌─────────────────────────────────────────────┐
│      Job Application Automation Pipeline    │
├─────────────────────────────────────────────┤
│                                             │
│  1. ZobNest Extractor                      │
│     └─ Scrapes job listings                │
│     └─ Outputs: jobs.json                  │
│                                             │
│  2. Resume Matcher                         │
│     └─ Finds correct resume per job        │
│     └─ Format: nitishkandi_[company].pdf   │
│                                             │
│  3. Application Filler (Playwright)        │
│     └─ Detects platform (Lever/Ashby/GH)  │
│     └─ Fills standard fields                │
│     └─ Generates custom responses (OSS LLM) │
│     └─ Uploads resume & auto-submits       │
│                                             │
│  4. Results Logger                         │
│     └─ Outputs: applications.json          │
│     └─ Tracks: company, status, errors     │
│                                             │
└─────────────────────────────────────────────┘
```

## Setup

### 1. Prerequisites

- Node.js 16+ installed
- LLM backend for custom responses
- Job resumes saved in: `/Users/nitishkandi/Desktop/job/Zobnest_resumes`
  - Filename format: `nitishkandi_[company]_resume.pdf`

### 2. Install Dependencies

```bash
cd job-application-agent
npm install
```

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in your details:

```bash
cp .env.example .env
```

Edit `.env`:

```env
LLM_PROVIDER=groq
LLM_MODEL=qwen/qwen3.6-27b
LLM_FALLBACK_MODEL=openai/gpt-oss-20b
LLM_API_URL=https://api.groq.com/openai/v1/chat/completions
LLM_API_KEY=
GROQ_API_KEY=
GROQ_MODEL=qwen/qwen3.6-27b
RESUMES_PATH=/Users/nitishkandi/Desktop/job/Zobnest_resumes
OUTPUT_DIR=./output
ZOBNEST_URL=https://www.zobnest.in/client/dashboard
LOG_LEVEL=info
```

### 4. Run the Agent

```bash
npm start
```

Or with dev logging:

```bash
npm run dev
```

## How It Works

### Step 1: Extract Jobs from ZobNest
- Opens ZobNest dashboard
- Scrapes "Latest Jobs" table
- Extracts: company, location, application URL
- Saves to `output/jobs.json`

### Step 2: Match Resumes
- Reads extracted jobs
- Finds matching resume file for each company
- Validates file exists on disk

### Step 3: Fill & Submit Applications
For each job:
1. Navigate to application URL
2. Detect platform (Lever/Ashby/Greenhouse)
3. Fill standard fields (name, email, phone, links)
4. Upload matched resume
5. Generate custom question responses using the configured LLM backend
6. Auto-submit form
7. Log result

### Step 4: Generate Report
- Saves detailed results to `output/applications.json`
- Generates summary with success metrics

## Output Files

```
output/
├── job-agent-YYYY-MM-DD.log    # Detailed logs
├── jobs.json                    # Extracted jobs from ZobNest
├── applications.json            # Application results
└── summary.json                 # High-level summary
```

## Configuration Details

### User Profile (src/config.js)

All your personal info is stored in `src/config.js`:
- Contact info (email, phone, LinkedIn, GitHub)
- Employment history
- Education
- Skills (strong & moderate)
- Work preferences

Update this file to match your actual info.

### Custom Question Templates (src/clients/claudeClient.js)

Standard answers for common questions:
- Company motivation
- Experience / STAR format
- Career goals
- Tech stack
- Salary (flagged for manual review)

The agent tries to match questions against templates first; if no match, it uses the configured LLM backend to generate a response.

## Platform Support

### Lever
- ✅ Standard fields (name, email, phone, links)
- ✅ Resume upload
- ✅ Custom questions
- ✅ Auto-submit

### Ashby
- ✅ Standard fields
- ✅ Resume upload
- ✅ Custom questions
- ✅ Auto-submit

### Greenhouse
- ✅ First/last name
- ✅ Email, phone, links
- ✅ Resume upload
- ✅ Preferences (remote, relocation)
- ✅ Custom questions
- ✅ Auto-submit

## Troubleshooting

### "No resume found for company X"
- Check resume filename matches format: `nitishkandi_[company]_resume.pdf`
- Verify file exists in `RESUMES_PATH`
- Check company name spelling (case-insensitive matching)

### "Application form not detected"
- Platform may be different from Lever/Ashby/Greenhouse
- Check logs for platform detection logic
- May need to add custom platform handler

### "LLM backend error"
- Verify `LLM_PROVIDER`, `LLM_MODEL`, and `LLM_API_URL` are set correctly in `.env`
- If using a local model server, make sure it is running and reachable
- Review error details in logs

### "Form validation errors"
- Check if all required fields are being filled
- Some forms may have field-specific requirements
- Review logs for "Validation error" messages

## Advanced Usage

### Running on a Schedule (macOS/Linux)

Create a cron job to run daily:

```bash
crontab -e
```

Add:

```cron
0 9 * * * cd /path/to/job-application-agent && npm start >> /tmp/job-agent.log 2>&1
```

This runs at 9 AM every day.

### Adjusting Logging Level

In `.env`, change `LOG_LEVEL`:

```env
LOG_LEVEL=debug  # Verbose logging
LOG_LEVEL=info   # Standard logging
LOG_LEVEL=error  # Only errors
```

### Custom Form Fillers

To add support for a new job board:

1. Create `src/agents/formFillers/[platform]Filler.js`
2. Implement `fillForm()`, `fillStandardFields()`, `uploadResume()`, `fillCustomQuestions()`, `submit()`
3. Add platform detection in `applicationFiller.js`

Example:

```javascript
class CustomPlatformFiller {
  async fillForm(job, resumePath) {
    // Your implementation
  }
  async submit() {
    // Your implementation
  }
}
```

## Safety & Guardrails

The agent includes built-in safeguards:

- ✅ Pre-submission form verification
- ✅ Resume file validation before upload
- ✅ Platform detection before filling
- ✅ Comprehensive logging of all actions
- ✅ Error handling with graceful degradation
- ✅ No data stored beyond session

## Performance Optimization

### Current (MVP)
- Sequential job processing (~5-10 min per application)
- Full screenshot/inspection for debugging
- Headless mode disabled (visible browser)

### Future Optimizations
- Parallel processing (multiple browsers)
- Headless mode enabled
- Reduced timeouts with smart waits
- Response caching for repeated questions
- Batch API calls for custom answer generation

## Support & Customization

Need to customize the agent for your needs?

1. **User profile**: Edit `src/config.js` → `userProfile`
2. **Question templates**: Edit `src/clients/claudeClient.js` → `matchQuestionTemplate()`
3. **Form field detection**: Edit form filler classes (Lever, Ashby, Greenhouse)
4. **Platform detection**: Edit `applicationFiller.js` → `detectPlatform()`

## License

Private project for personal use.

---

**Built with:**
- Playwright (browser automation)
- Configured LLM backend (AI responses)
- Node.js (runtime)

**Last updated:** July 2026
