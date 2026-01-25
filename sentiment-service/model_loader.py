"""
LLM-based Sentiment Analysis Model Loader
Supports multiple LLM providers (OpenAI, Anthropic, Google Gemini, DeepSeek)
Optimized for production use with retry logic and connection pooling
"""
import os
import json
import logging
import asyncio
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, Field, ValidationError
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

# Sentiment response model
class SentimentResponse(BaseModel):
    """Structured response from LLM for sentiment analysis"""
    sentiment: Literal["positive", "neutral", "negative"] = Field(
        description="Sentiment classification"
    )
    sentimentScore: float = Field(
        ge=0.0, le=1.0,
        description="Sentiment score from 0.0 (negative) to 1.0 (positive)"
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Confidence level of the sentiment classification"
    )

class SentimentModelLoader:
    """Load and manage LLM-based sentiment analyzer with connection pooling and retry logic"""
    
    # Class-level constants
    DEFAULT_TIMEOUT = 60.0
    MAX_RETRIES = 3
    MAX_CONNECTIONS = 100
    MAX_KEEPALIVE = 20
    
    def __init__(self, model_path: str = None):
        """
        Initialize LLM sentiment analyzer
        
        Args:
            model_path: Not used for LLM (kept for compatibility)
        """
        self.api_key: Optional[str] = None
        self.api_base: Optional[str] = None
        self.model_name: Optional[str] = None
        self.provider: Optional[str] = None
        self.is_loaded = False
        self.client: Optional[httpx.AsyncClient] = None
        
    def _load_config(self):
        """Load configuration from environment variables"""
        # Determine provider (default to openai)
        self.provider = os.getenv("LLM_PROVIDER", "openai").lower()
        
        if self.provider == "openai":
            self.api_key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
            self.api_base = os.getenv("OPENAI_API_BASE") or os.getenv("LLM_BASE_URL") or "https://api.openai.com/v1"
            self.model_name = os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL_NAME") or "gpt-3.5-turbo"
        elif self.provider == "anthropic":
            self.api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("LLM_API_KEY")
            self.api_base = os.getenv("ANTHROPIC_API_BASE") or os.getenv("LLM_BASE_URL") or "https://api.anthropic.com/v1"
            self.model_name = os.getenv("ANTHROPIC_MODEL") or os.getenv("LLM_MODEL_NAME") or "claude-3-haiku-20240307"
        elif self.provider == "google":
            self.api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("LLM_API_KEY")
            # Use v1beta for access to newer models like Gemini 2.5
            self.api_base = os.getenv("GOOGLE_API_BASE") or os.getenv("LLM_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta"
            self.model_name = os.getenv("GOOGLE_MODEL") or os.getenv("LLM_MODEL_NAME") or "gemini-2.5-flash-lite"
        elif self.provider == "deepseek":
            # DeepSeek configuration - OpenAI-compatible API
            self.api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("LLM_API_KEY")
            self.api_base = os.getenv("DEEPSEEK_API_BASE") or os.getenv("LLM_BASE_URL") or "https://api.deepseek.com/v1"
            self.model_name = os.getenv("DEEPSEEK_MODEL") or os.getenv("LLM_MODEL_NAME") or "deepseek-chat"
        else:
            # Generic provider - use LLM_ prefixed env vars
            self.api_key = os.getenv("LLM_API_KEY")
            self.api_base = os.getenv("LLM_BASE_URL")
            self.model_name = os.getenv("LLM_MODEL_NAME")
        
        if not self.api_key:
            raise ValueError(
                f"API key not found. Please set LLM_API_KEY or provider-specific key "
                f"(e.g., OPENAI_API_KEY for provider='openai', DEEPSEEK_API_KEY for provider='deepseek')"
            )
        
        if not self.model_name:
            raise ValueError(
                f"Model name not found. Please set LLM_MODEL_NAME or provider-specific model "
                f"(e.g., OPENAI_MODEL for provider='openai', DEEPSEEK_MODEL for provider='deepseek')"
            )
    
    def load_model(self):
        """Load the LLM sentiment analyzer with optimized connection settings"""
        try:
            logger.info("Loading LLM-based sentiment analyzer...")
            self._load_config()
            
            logger.info(f"Provider: {self.provider}")
            logger.info(f"Model: {self.model_name}")
            logger.info(f"API Base: {self.api_base}")
            
            # Create HTTP client with connection pooling and optimized limits
            # Note: HTTP/2 disabled for Python 3.13 compatibility
            limits = httpx.Limits(
                max_connections=self.MAX_CONNECTIONS,
                max_keepalive_connections=self.MAX_KEEPALIVE,
                keepalive_expiry=30.0  # Close idle connections after 30s
            )
            
            self.client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.DEFAULT_TIMEOUT, connect=10.0),
                limits=limits,
                headers={"Content-Type": "application/json"},
                http2=False,  # Disabled for Python 3.13 compatibility
                follow_redirects=True,
            )
            
            self.is_loaded = True
            logger.info("LLM sentiment analyzer loaded successfully!")
            
        except Exception as e:
            logger.error(f"Error loading LLM analyzer: {e}", exc_info=True)
            raise
    
    def _build_sentiment_prompt(self, text: str) -> str:
        """Build the prompt for sentiment analysis optimized for social media content"""
        return f"""Analyze the sentiment of the social media text delimited by triple backticks.
Respond ONLY with a raw JSON object. Do not include markdown formatting, explanations, or any text outside the JSON.

### Text to analyze: 
```{text}```

### Instructions:
1. **Linguistic Context:** Interpret emojis (e.g., 💀 can mean 'dead' or 'funny'), slang, and code-mixed language (e.g., Hindi-English).
2. **Emotional Intensity:** ALL CAPS and multiple punctuation (!!!) should shift the sentimentScore further toward 0.0 or 1.0.
3. **Sarcasm/Irony:** If the text uses positive words to convey a negative critique, classify as "negative".
4. **Mixed Sentiment:** If both positive and negative elements exist, the `sentimentScore` should reflect the dominant emotion, but `confidence` should be lowered.

### Response Schema:
{{
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": float (0.0 to 1.0),
  "confidence": float (0.0 to 1.0),
  "reasoning": "A 1-sentence explanation of the detected tone"
}}

JSON Response:"""
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True
    )
    async def _call_openai(self, text: str) -> Dict:
        """Call OpenAI API for sentiment analysis with retry logic"""
        prompt = self._build_sentiment_prompt(text)
        
        response = await self.client.post(
            f"{self.api_base}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model_name,
                "messages": [
                    {"role": "system", "content": "You are a sentiment analysis expert. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            }
        )
        
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True
    )
    async def _call_anthropic(self, text: str) -> Dict:
        """Call Anthropic API for sentiment analysis with retry logic"""
        prompt = self._build_sentiment_prompt(text)
        
        response = await self.client.post(
            f"{self.api_base}/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": self.model_name,
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            }
        )
        
        response.raise_for_status()
        data = response.json()
        content = data["content"][0]["text"]
        return json.loads(content)
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True
    )
    async def _call_google(self, text: str) -> Dict:
        """Call Google Gemini API for sentiment analysis with retry logic"""
        prompt = self._build_sentiment_prompt(text)
        
        # Ensure model name has 'models/' prefix
        model_id = self.model_name
        if not model_id.startswith("models/"):
            model_id = f"models/{model_id}"
        
        response = await self.client.post(
            f"{self.api_base}/{model_id}:generateContent?key={self.api_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "responseMimeType": "application/json",
                }
            }
        )
        
        response.raise_for_status()
        data = response.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(content)
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True
    )
    async def _call_deepseek(self, text: str) -> Dict:
        """Call DeepSeek API for sentiment analysis with retry logic (OpenAI-compatible)"""
        prompt = self._build_sentiment_prompt(text)
        
        response = await self.client.post(
            f"{self.api_base}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model_name,
                "messages": [
                    {"role": "system", "content": "You are a sentiment analysis expert. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            }
        )
        
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    
    async def _analyze_text(self, text: str) -> Dict:
        """Analyze a single text using the configured LLM provider"""
        try:
            # Log the text being analyzed (truncated for readability)
            text_preview = text[:100] + "..." if len(text) > 100 else text
            logger.debug(f"Analyzing text: '{text_preview}'")
            
            # Route to appropriate provider
            provider_methods = {
                "openai": self._call_openai,
                "anthropic": self._call_anthropic,
                "google": self._call_google,
                "deepseek": self._call_deepseek,
            }
            
            if self.provider not in provider_methods:
                raise ValueError(f"Unsupported provider: {self.provider}")
            
            result = await provider_methods[self.provider](text)
            
            # Validate response with pydantic
            validated = SentimentResponse(**result)
            
            # Log detailed sentiment analysis results (for debugging, not shown to users)
            logger.info(f"📊 SENTIMENT ANALYSIS RESULT:")
            logger.info(f"   Text: '{text_preview}'")
            logger.info(f"   Sentiment: {validated.sentiment.upper()}")
            logger.info(f"   Score: {validated.sentimentScore:.3f} (0=negative, 0.5=neutral, 1=positive)")
            logger.info(f"   Confidence: {validated.confidence:.3f}")
            
            return {
                'sentiment': validated.sentiment,
                'sentimentScore': round(validated.sentimentScore, 3),
                'sentimentConfidence': round(validated.confidence, 3),
            }
            
        except (json.JSONDecodeError, ValidationError, KeyError) as e:
            logger.error(f"❌ Error parsing LLM response: {e}", exc_info=True)
            logger.debug(f"Raw response: {result if 'result' in locals() else 'N/A'}")
            logger.warning(f"⚠️  Falling back to neutral sentiment for text: '{text[:50]}...'")
            return self._get_neutral_fallback()
            
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ HTTP error from LLM API ({self.provider}): {e.response.status_code}")
            logger.error(f"   Response: {e.response.text[:200]}")
            logger.warning(f"⚠️  Falling back to neutral sentiment")
            return self._get_neutral_fallback()
            
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            logger.error(f"❌ Network error during LLM analysis: {e}")
            logger.warning(f"⚠️  Falling back to neutral sentiment")
            return self._get_neutral_fallback()
            
        except Exception as e:
            logger.error(f"❌ Unexpected error during LLM analysis: {e}", exc_info=True)
            logger.warning(f"⚠️  Falling back to neutral sentiment")
            return self._get_neutral_fallback()
    
    @staticmethod
    def _get_neutral_fallback() -> Dict:
        """Return neutral sentiment fallback"""
        return {
            'sentiment': 'neutral',
            'sentimentScore': 0.5,
            'sentimentConfidence': 0.0,
        }
    
    def predict_sentiment(self, texts: List[str]) -> List[Dict]:
        """
        Predict sentiment for a list of texts using LLM
        
        Args:
            texts: List of text strings to analyze
            
        Returns:
            List of dictionaries with sentiment predictions
        """
        if not self.is_loaded:
            raise RuntimeError("Model not loaded. Call load_model() first.")
        
        if not texts:
            return []
        
        # Handle empty texts synchronously
        results = []
        texts_to_analyze = []
        indices_to_analyze = []
        
        for i, text in enumerate(texts):
            if not text or not text.strip():
                results.append(self._get_neutral_fallback())
            else:
                texts_to_analyze.append(text.strip())
                indices_to_analyze.append(i)
                results.append(None)  # Placeholder
        
        # Run async analysis for non-empty texts
        if texts_to_analyze:
            try:
                # Check if we're in an async context (FastAPI)
                try:
                    loop = asyncio.get_running_loop()
                    # We're in FastAPI's event loop, use thread pool
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                        future = executor.submit(
                            self._run_analysis_sync, texts_to_analyze
                        )
                        analyzed_results = future.result(timeout=300)  # 5 min timeout
                except RuntimeError:
                    # No running loop, we can use asyncio.run()
                    analyzed_results = asyncio.run(
                        self._analyze_batch(texts_to_analyze)
                    )
                
                # Fill in results
                for idx, result in zip(indices_to_analyze, analyzed_results):
                    results[idx] = result
                    
            except Exception as e:
                logger.error(f"Error during batch prediction: {e}", exc_info=True)
                # Fill remaining with neutral
                for idx in indices_to_analyze:
                    if results[idx] is None:
                        results[idx] = self._get_neutral_fallback()
        
        return results
    
    def _run_analysis_sync(self, texts: List[str]) -> List[Dict]:
        """
        Helper method to run async analysis in a synchronous context
        Used when called from FastAPI's running event loop
        """
        return asyncio.run(self._analyze_batch(texts))
    
    async def _analyze_batch(self, texts: List[str]) -> List[Dict]:
        """Analyze a batch of texts concurrently with semaphore for rate limiting"""
        # Limit concurrent API calls to avoid rate limiting
        semaphore = asyncio.Semaphore(10)  # Max 10 concurrent requests
        
        async def analyze_with_semaphore(text: str) -> Dict:
            async with semaphore:
                return await self._analyze_text(text)
        
        tasks = [analyze_with_semaphore(text) for text in texts]
        return await asyncio.gather(*tasks, return_exceptions=False)
    
    async def close(self):
        """Close the HTTP client and cleanup resources"""
        if self.client:
            await self.client.aclose()
            self.client = None
            logger.info("HTTP client closed successfully")
