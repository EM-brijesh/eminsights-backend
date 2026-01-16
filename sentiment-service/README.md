# Sentiment Analysis Service

Python FastAPI service for sentiment analysis using LLM APIs.

**Recommended Provider:** DeepSeek (ultra-low cost, high quality)

## Quick Start with DeepSeek

See [DEEPSEEK_SETUP.md](DEEPSEEK_SETUP.md) for detailed setup instructions.

**TL;DR:**
1. Get API key from https://platform.deepseek.com/
2. Create `.env` file:
   ```env
   LLM_PROVIDER=deepseek
   DEEPSEEK_API_KEY=your_key_here
   DEEPSEEK_MODEL=deepseek-chat
   ```
3. Run: `python main.py`

## Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure LLM API credentials:**
   
   Set environment variables for your chosen LLM provider:
   
   **For DeepSeek (RECOMMENDED - Ultra-Low Cost):**
   ```bash
   export LLM_PROVIDER=deepseek
   export DEEPSEEK_API_KEY=your_api_key_here
   export DEEPSEEK_MODEL=deepseek-chat  # Optional, defaults to deepseek-chat
   ```
   
   **For Anthropic:**
   ```bash
   export LLM_PROVIDER=anthropic
   export ANTHROPIC_API_KEY=your_api_key_here
   export ANTHROPIC_MODEL=claude-3-haiku-20240307  # Optional
   ```
   
   **For Google Gemini:**
   ```bash
   export LLM_PROVIDER=google
   export GOOGLE_API_KEY=your_api_key_here
   export GOOGLE_MODEL=gemini-pro  # Optional
   ```
   
   **Generic (any provider):**
   ```bash
   export LLM_API_KEY=your_api_key_here
   export LLM_MODEL_NAME=model_name
   export LLM_BASE_URL=https://api.provider.com/v1  # Optional
   ```

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
      "sentimentSource": "llm_openai"
    }
  ]
}
```

### GET /health

Health check endpoint to verify service is running and model is loaded.

**Response:**
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

## Environment Variables

### Required
- `LLM_API_KEY` or provider-specific key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)

### Optional
- `LLM_PROVIDER`: Provider name (`openai`, `anthropic`, `google`) - defaults to `openai`
- `LLM_MODEL_NAME` or provider-specific model (`OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GOOGLE_MODEL`)
- `LLM_BASE_URL` or provider-specific base URL (`OPENAI_API_BASE`, `ANTHROPIC_API_BASE`, `GOOGLE_API_BASE`)
- `PORT`: Port to run the service on (default: 8000)

## Notes

- The service uses async HTTP requests to call LLM APIs
- Model configuration happens on startup
- Service must be running before Node.js backend can use it
- API keys are read from environment variables (never hardcoded)
- Errors are handled gracefully with fallback to neutral sentiment

## Supported Providers

- **DeepSeek**: DeepSeek-V3 (deepseek-chat) and DeepSeek-R1 (deepseek-reasoner) - Ultra-low cost, OpenAI-compatible
- **OpenAI**: GPT-3.5, GPT-4, and other OpenAI models
- **Anthropic**: Claude models (Claude 3 Haiku, Sonnet, Opus)
- **Google**: Gemini Pro and other Gemini models
- **Custom**: Any provider with OpenAI-compatible API via `LLM_BASE_URL`
