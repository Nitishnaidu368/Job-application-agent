# Quick Start Guide

Get your Job Application Agent up and running in 5 minutes.

## 1. Copy the Project

```bash
# The project is in:
cd /home/claude/job-application-agent
```

Or move it to your preferred location:

```bash
cp -r /home/claude/job-application-agent ~/path/to/your/workspace/
cd ~/path/to/your/workspace/job-application-agent
```

## 2. Set Up Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your LLM backend settings
nano .env
```

Use GroqCloud with Qwen 3.6 27B for the first version:

```env
LLM_PROVIDER=groq
LLM_MODEL=qwen/qwen3.6-27b
LLM_FALLBACK_MODEL=openai/gpt-oss-20b
LLM_API_URL=https://api.groq.com/openai/v1/chat/completions
LLM_API_KEY=
GROQ_API_KEY=
GROQ_MODEL=qwen/qwen3.6-27b
RESUMES_PATH=/Users/nitishkandi/Desktop/job/Zobnest_resumes
```

Save and exit.

## 3. Test the Setup

```bash
# Install dependencies (if not already done)
npm install

# Run the agent
npm start
```

**Expected output:**
- Browser opens to ZobNest dashboard
- Scrapes jobs from "Latest Jobs" section
- Matches resumes to jobs
- Fills applications and waits for you to review and submit each one
- Generates `output/summary.json` with results

## 4. Check Results

After the agent completes:

```bash
# View summary
cat output/summary.json

# View detailed results
cat output/applications.json

# View full logs
cat output/job-agent-YYYY-MM-DD.log
```

## Typical Runtime

- **5-10 jobs**: ~5-15 minutes (sequential processing)
- **20+ jobs**: ~30+ minutes (sequential, with form-filling time)

## Common Issues & Quick Fixes

### Issue: "LLM backend error" or fallback responses only
**Fix:**
```bash
# Make sure .env file is in the root directory
ls -la .env

# Verify the LLM settings are there:
cat .env | grep LLM_
```

### Issue: "Resume directory not found"
**Fix:**
Check path in `.env`:
```bash
ls -la /Users/nitishkandi/Desktop/job/Zobnest_resumes
```

Make sure resumes are named correctly:
```
nitishkandi_appian_resume.pdf
nitishkandi_top_golf_resume.pdf
nitishkandi_monogram_health_resume.pdf
```

### Issue: "No jobs found in ZobNest"
**Fix:**
- Make sure you're logged into ZobNest (agent opens browser, you can log in manually)
- Check that "Latest Jobs" section is visible on the dashboard
- Verify jobs are in "Not Applied" status

### Issue: Submission is not detected after you click Submit
**Fix:**
- Check logs for specific field errors
- Some forms may have unexpected field requirements
- Confirm the application site shows a success message; the agent will then continue to the next job

## Next Steps

Once confirmed working:

1. **Schedule daily runs** (see README.md for cron setup)
2. **Customize user profile** (edit `src/config.js` if needed)
3. **Monitor logs** (check `output/` folder after each run)
4. **Expand platform support** (add LinkedIn, custom websites, etc.)

## Getting Help

1. **Check logs:**
   ```bash
   cat output/job-agent-YYYY-MM-DD.log | tail -50
   ```

2. **Review results:**
   ```bash
   cat output/summary.json
   ```

3. **Enable debug logging:**
   Edit `.env`:
   ```env
   LOG_LEVEL=debug
   ```
   Re-run the agent.

---

**You're all set!** 🚀

The agent is now ready to fill applications and pause for your approval before every submission.
