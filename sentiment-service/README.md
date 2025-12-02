# Sentiment Analysis Service

Python FastAPI service for sentiment analysis using Keras BERT model.

## Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Ensure model directory exists:**
   - The model should be located at `../bert-keras-bert_large_en-v3/` relative to this directory
   - Or set `BERT_MODEL_PATH` environment variable to point to the model directory

3. **Run the service:**
   ```bash
   python main.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

## API Endpoints

### POST /analyze

Analyze sentiment for a list of posts.

**Request:**
```json
{
  "posts": [
    {
      "_id": "post_id",
      "content": {
        "text": "This is a great product!"
      },
      "platform": "twitter"
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "_id": "post_id",
      "sentiment": "positive",
      "sentimentScore": 0.85,
      "sentimentConfidence": 0.92,
      "sentimentAnalyzedAt": "2024-01-01T00:00:00Z",
      "sentimentSource": "keras_bert"
    }
  ]
}
```

### GET /health

Health check endpoint to verify service is running and model is loaded.

## Environment Variables

- `PORT`: Port to run the service on (default: 8000)
- `BERT_MODEL_PATH`: Path to the BERT model directory (default: ../bert-keras-bert_large_en-v3)

## Notes

- The model is large (~1.2GB) and requires sufficient RAM
- Model loading happens on startup
- Service must be running before Node.js backend can use it

