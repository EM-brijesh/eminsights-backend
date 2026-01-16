"""
FastAPI service for sentiment analysis using LLM APIs
Supports OpenAI, Anthropic, Google Gemini, and other providers
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Optional, Any
from datetime import datetime
import os
import logging
from pathlib import Path
from model_loader import SentimentModelLoader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Load .env from sentiment-service directory
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        logger.info(f"✅ Loaded .env file from: {env_path}")
    else:
        # Try loading from parent directory (backend root)
        parent_env = Path(__file__).parent.parent / '.env'
        if parent_env.exists():
            load_dotenv(parent_env)
            logger.info(f"✅ Loaded .env file from: {parent_env}")
        else:
            logger.warning("⚠️  No .env file found. Using system environment variables.")
except ImportError:
    logger.warning("⚠️  python-dotenv not installed. Install it to load .env files: pip install python-dotenv")

# Initialize FastAPI app
app = FastAPI(title="Sentiment Analysis API", version="1.0.0")

# Enable CORS for Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model loader
model_loader: Optional[SentimentModelLoader] = None

# Pydantic models for request/response
class PostContent(BaseModel):
    text: Optional[str] = None
    description: Optional[str] = None
    title: Optional[str] = None

class Post(BaseModel):
    model_config = ConfigDict(extra='allow')  # Allow additional fields
    
    _id: Optional[str] = None
    id: Optional[str] = None
    content: Optional[PostContent] = None
    text: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    platform: Optional[str] = None
    keyword: Optional[str] = None
    brandName: Optional[str] = None

class AnalyzeRequest(BaseModel):
    posts: List[Post]

class SentimentResult(BaseModel):
    model_config = ConfigDict(extra='allow')  # Preserve original post fields
    
    _id: Optional[str] = None
    id: Optional[str] = None
    sentiment: str
    sentimentScore: float
    sentimentConfidence: float
    sentimentAnalyzedAt: str
    sentimentSource: str = "llm"

class AnalyzeResponse(BaseModel):
    results: List[SentimentResult]

def extract_text_from_post(post: Dict) -> str:
    """Extract text content from post object"""
    # Try different fields in order of preference
    if post.get('content'):
        if isinstance(post['content'], dict):
            text = (
                post['content'].get('text') or
                post['content'].get('description') or
                post['content'].get('title') or
                ''
            )
        else:
            text = str(post['content'])
    else:
        text = (
            post.get('text') or
            post.get('summary') or
            post.get('title') or
            ''
        )
    
    return text.strip()

@app.on_event("startup")
async def startup_event():
    """Load LLM model on startup"""
    global model_loader
    
    try:
        logger.info("🚀 Initializing LLM-based sentiment analyzer...")
        
        model_loader = SentimentModelLoader()
        model_loader.load_model()
        
        logger.info("✅ LLM sentiment analyzer loaded successfully!")
        logger.info(f"   Provider: {model_loader.provider}")
        logger.info(f"   Model: {model_loader.model_name}")
        
    except Exception as e:
        logger.error(f"❌ Failed to load LLM model: {e}", exc_info=True)
        logger.error("   Make sure LLM_API_KEY and LLM_MODEL_NAME are set")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    global model_loader
    if model_loader:
        try:
            await model_loader.close()
            logger.info("✅ LLM client closed")
        except Exception as e:
            logger.warning(f"Error closing LLM client: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    health_status = {
        "status": "healthy" if model_loader and model_loader.is_loaded else "not_ready",
        "model_loaded": model_loader.is_loaded if model_loader else False,
        "model_type": "llm"
    }
    
    if model_loader and model_loader.is_loaded:
        health_status["provider"] = model_loader.provider
        health_status["model_name"] = model_loader.model_name
        # Check if API key is configured (without exposing it)
        health_status["api_configured"] = bool(model_loader.api_key)
    else:
        health_status["api_configured"] = False
    
    return health_status

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_sentiment(request: AnalyzeRequest):
    """
    Analyze sentiment for a list of posts
    
    Args:
        request: AnalyzeRequest containing list of posts
        
    Returns:
        AnalyzeResponse with sentiment results
    """
    logger.info(f"🔵 SENTIMENT ANALYSIS REQUEST")
    logger.info(f"   Posts: {len(request.posts)}")
    
    if not model_loader or not model_loader.is_loaded:
        logger.error("❌ Model not loaded!")
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Service is not ready."
        )
    
    if not request.posts:
        logger.warning("⚠️  Empty posts array")
        return AnalyzeResponse(results=[])
    
    try:
        # Extract texts from posts
        texts = []
        post_metadata = []
        
        for i, post in enumerate(request.posts):
            # Convert Pydantic model to dict
            if hasattr(post, 'model_dump'):
                post_dict = post.model_dump()
            elif hasattr(post, 'dict'):
                post_dict = post.dict()
            else:
                post_dict = post if isinstance(post, dict) else {}
            
            text = extract_text_from_post(post_dict)
            
            if not text:
                logger.warning(f"   Post {i+1}: No text")
                texts.append("")
            else:
                logger.info(f"   Post {i+1}: '{text[:50]}...'")
                texts.append(text)
            
            post_metadata.append(post_dict)
        
        # Get predictions from LLM
        logger.info(f"🤖 Running LLM analysis using {model_loader.provider.upper()} ({model_loader.model_name})...")
        predictions = model_loader.predict_sentiment(texts)
        logger.info(f"✅ Got {len(predictions)} predictions")
        
        # Log detailed results (scores shown in console but NOT sent to frontend UI)
        logger.info("=" * 80)
        logger.info("📊 SENTIMENT ANALYSIS RESULTS (Console Only - Not Shown to Users)")
        logger.info("=" * 80)
        for i, pred in enumerate(predictions):
            text_preview = texts[i][:60] + "..." if len(texts[i]) > 60 else texts[i]
            logger.info(f"   Post {i+1}:")
            logger.info(f"      Text: '{text_preview}'")
            logger.info(f"      Sentiment: {pred['sentiment'].upper()}")
            logger.info(f"      Score: {pred['sentimentScore']:.3f} (0=negative, 0.5=neutral, 1=positive)")
            logger.info(f"      Confidence: {pred['sentimentConfidence']:.3f}")
            logger.info("-" * 80)
        logger.info("=" * 80)
        
        # Build results
        results = []
        analyzed_at = datetime.utcnow().isoformat() + "Z"
        
        for i, (post_dict, prediction) in enumerate(zip(post_metadata, predictions)):
            # Preserve original post fields
            result = {**post_dict}
            
            # Add sentiment fields
            result['sentiment'] = prediction['sentiment']
            result['sentimentScore'] = prediction['sentimentScore']
            result['sentimentConfidence'] = prediction['sentimentConfidence']
            result['sentimentAnalyzedAt'] = analyzed_at
            # Set sentiment source based on provider
            provider_name = model_loader.provider if model_loader else "llm"
            result['sentimentSource'] = f'llm_{provider_name}'
            
            # Ensure _id or id is present
            if not result.get('_id') and not result.get('id'):
                result['_id'] = f"temp_{i}"
            
            results.append(result)
        
        logger.info(f"✅ ANALYSIS COMPLETE - Returning {len(results)} results")
        return AnalyzeResponse(results=results)
        
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error during sentiment analysis: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
