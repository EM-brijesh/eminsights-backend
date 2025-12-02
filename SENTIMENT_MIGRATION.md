# Sentiment Analysis Migration: Gemini to Keras BERT

## Overview
Sentiment analysis has been migrated from Google Gemini API to a local Keras BERT model served via Python FastAPI.

## Changes Made

### 1. Python FastAPI Service
- **Location:** `eminsights-backend/sentiment-service/`
- **Files:**
  - `main.py` - FastAPI application with `/analyze` endpoint
  - `model_loader.py` - Keras BERT model loading and inference
  - `requirements.txt` - Python dependencies
  - `README.md` - Setup instructions

### 2. Node.js Service Updates
- **File:** `eminsights-backend/services/sentiment.service.js`
  - Commented out all Gemini-related code
  - Removed rate limiter (no longer needed)
  - Replaced with HTTP calls to Python FastAPI service
  - Updated batch processing to use Python service

### 3. Controller Updates
- **File:** `eminsights-backend/controllers/sentiment.controller.js`
  - Removed 15 posts per request limit (now 100)
  - Updated to handle new return format

### 4. Backfill Job Updates
- **File:** `eminsights-backend/jobs/sentimentBackfill.js`
  - Increased default concurrency from 1 to 10
  - Increased batch size from 25 to 50

### 5. Server Updates
- **File:** `eminsights-backend/server.js`
  - Removed Gemini API key diagnostics
  - Added Python service URL diagnostics

## Environment Variables

### Required Changes in `.env`

**Remove or comment out:**
```env
# GEMINI_API_KEY=your_key_here
# GEMINI_MODEL=gemini-2.0-flash
```

**Add:**
```env
SENTIMENT_SERVICE_URL=http://localhost:8000
```

**Optional (for Python service):**
```env
BERT_MODEL_PATH=../bert-keras-bert_large_en-v3
PORT=8000
```

## Setup Instructions

### 1. Install Python Dependencies
```bash
cd eminsights-backend/sentiment-service
pip install -r requirements.txt
```

### 2. Verify Model Location
Ensure the BERT model is located at:
- `eminsights-backend/bert-keras-bert_large_en-v3/` (relative to backend root)
- Or set `BERT_MODEL_PATH` environment variable

### 3. Start Python Service
```bash
cd eminsights-backend/sentiment-service
python main.py
```

Or using uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 4. Start Node.js Backend
```bash
cd eminsights-backend
npm run dev
```

## API Compatibility

The Node.js API endpoints remain unchanged:
- `POST /api/sentiment/analyze` - Same request/response format
- `POST /api/sentiment/save` - Unchanged
- `POST /api/sentiment/check` - Unchanged
- `GET /api/sentiment/summary` - Unchanged

## Benefits

1. **No API Rate Limits** - Process as many posts as needed
2. **No API Costs** - Free to use once model is loaded
3. **Faster Processing** - Can process batches concurrently
4. **Privacy** - Data stays local, not sent to external APIs
5. **Reliability** - No dependency on external API availability

## Troubleshooting

### Python Service Not Responding
- Check if service is running: `curl http://localhost:8000/health`
- Verify model path is correct
- Check Python service logs for errors

### Model Loading Errors
- Ensure model directory exists and contains:
  - `model.weights.h5`
  - `config.json`
  - `tokenizer.json`
  - `assets/tokenizer/vocabulary.txt`
- Check Python version (requires Python 3.8+)
- Verify all dependencies are installed

### Node.js Connection Errors
- Verify `SENTIMENT_SERVICE_URL` in `.env` matches Python service URL
- Check Python service is running before starting Node.js backend
- Review network connectivity between services

## Performance Notes

- Model is large (~1.2GB) - ensure sufficient RAM
- First request may be slower (model warm-up)
- Batch processing is more efficient than single requests
- No rate limits, but be mindful of system resources

