# Quick Start Guide - Python Sentiment Service (LLM-based)

## The Error You're Seeing

If you see `"Python service is not responding"` in your Node.js logs, it means the Python FastAPI service is not running.

## Quick Fix

### Step 1: Open a New Terminal

Keep your Node.js backend running, and open a **new terminal window**.

### Step 2: Navigate to Sentiment Service Directory

```bash
cd sentiment-service
```

### Step 3: Install Python Dependencies (First Time Only)

```bash
pip install -r requirements.txt
```

**Note:** If you get errors, you might need:
- Python 3.8 or higher
- pip updated: `python -m pip install --upgrade pip`

### Step 4: Configure LLM API Key

Set your LLM provider API key as an environment variable:

**For OpenAI (default):**
```bash
# Windows PowerShell
$env:OPENAI_API_KEY="your-api-key-here"

# Windows CMD
set OPENAI_API_KEY=your-api-key-here

# Linux/Mac
export OPENAI_API_KEY=your-api-key-here
```

**For Anthropic:**
```bash
export ANTHROPIC_API_KEY=your-api-key-here
export LLM_PROVIDER=anthropic
```

**For Google Gemini:**
```bash
export GOOGLE_API_KEY=your-api-key-here
export LLM_PROVIDER=google
```

### Step 5: Start the Python Service

```bash
python main.py
```

You should see output like:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     🚀 Initializing LLM-based sentiment analyzer...
INFO:     Provider: openai
INFO:     Model: gpt-3.5-turbo
INFO:     ✅ LLM sentiment analyzer loaded successfully!
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 6: Verify It's Working

In another terminal, test the health endpoint:
```bash
curl http://localhost:8000/health
```

Or open in browser: http://localhost:8000/health

You should see:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_type": "llm",
  "provider": "openai",
  "model_name": "gpt-3.5-turbo",
  "api_configured": true
}
```

## Troubleshooting

### "Module not found" errors
- Make sure you installed requirements: `pip install -r requirements.txt`
- Check Python version: `python --version` (should be 3.8+)

### "API key not found" error
- Make sure you set `LLM_API_KEY` or provider-specific key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)
- Verify the environment variable is set: `echo $OPENAI_API_KEY` (Linux/Mac) or `echo %OPENAI_API_KEY%` (Windows)

### "Port already in use" error
- Another process is using port 8000
- Change port: `set PORT=8001` (Windows) or `export PORT=8001` (Linux/Mac)
- Update `.env` in backend root: `SENTIMENT_SERVICE_URL=http://localhost:8001`

### Service starts but Node.js still can't connect
- Check `SENTIMENT_SERVICE_URL` in `.env` matches the Python service URL
- Verify firewall isn't blocking localhost connections
- Try accessing http://localhost:8000/health in browser

### LLM API errors
- Verify your API key is valid and has credits/quota
- Check the provider's API status page
- Review service logs for detailed error messages
- Ensure you have internet connectivity

## Running Both Services

You need **two terminals running simultaneously**:

**Terminal 1 - Python Service:**
```bash
cd sentiment-service
export OPENAI_API_KEY=your-key-here  # or set in .env
python main.py
```

**Terminal 2 - Node.js Backend:**
```bash
cd ..
npm run dev
```

Both must be running for sentiment analysis to work!

## Environment Variables Summary

Create a `.env` file in the `sentiment-service` directory (optional):

```env
# LLM Provider Configuration
LLM_PROVIDER=openai
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-3.5-turbo

# Service Configuration
PORT=8000
```

Or set them in your shell environment before starting the service.
