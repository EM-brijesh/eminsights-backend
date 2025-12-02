# Quick Start Guide - Python Sentiment Service

## The Error You're Seeing

If you see `"Python service is not responding"` in your Node.js logs, it means the Python FastAPI service is not running.

## Quick Fix

### Step 1: Open a New Terminal

Keep your Node.js backend running, and open a **new terminal window**.

### Step 2: Navigate to Sentiment Service Directory

```bash
cd C:\Users\PAWAN\Downloads\latestemsocial\eminsights-backend\sentiment-service
```

### Step 3: Install Python Dependencies (First Time Only)

```bash
pip install -r requirements.txt
```

**Note:** If you get errors, you might need:
- Python 3.8 or higher
- pip updated: `python -m pip install --upgrade pip`

### Step 4: Start the Python Service

```bash
python main.py
```

You should see output like:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 5: Verify It's Working

In another terminal, test the health endpoint:
```bash
curl http://localhost:8000/health
```

Or open in browser: http://localhost:8000/health

You should see:
```json
{"status":"healthy","model_loaded":true}
```

## Troubleshooting

### "Module not found" errors
- Make sure you installed requirements: `pip install -r requirements.txt`
- Check Python version: `python --version` (should be 3.8+)

### "Model not found" errors
- Verify model directory exists: `eminsights-backend/bert-keras-bert_large_en-v3/`
- Check that it contains: `model.weights.h5`, `config.json`, `tokenizer.json`

### "Port already in use" error
- Another process is using port 8000
- Change port: `set PORT=8001` (Windows) or `export PORT=8001` (Linux/Mac)
- Update `.env`: `SENTIMENT_SERVICE_URL=http://localhost:8001`

### Service starts but Node.js still can't connect
- Check `SENTIMENT_SERVICE_URL` in `.env` matches the Python service URL
- Verify firewall isn't blocking localhost connections
- Try accessing http://localhost:8000/health in browser

## Running Both Services

You need **two terminals running simultaneously**:

**Terminal 1 - Python Service:**
```bash
cd eminsights-backend/sentiment-service
python main.py
```

**Terminal 2 - Node.js Backend:**
```bash
cd eminsights-backend
npm run dev
```

Both must be running for sentiment analysis to work!

