"""
FastAPI service for sentiment analysis using VADER
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
    sentimentSource: str = "vader"

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
    """Load model on startup"""
    global model_loader
    
    try:
        logger.info("🚀 Initializing VADER sentiment analyzer...")
        logger.info("   Optimized for social media text")
        
        model_loader = SentimentModelLoader()
        model_loader.load_model()
        
        logger.info("✅ VADER loaded successfully!")
        
    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}", exc_info=True)
        raise

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if model_loader and model_loader.is_loaded else "not_ready",
        "model_loaded": model_loader.is_loaded if model_loader else False,
        "model_type": "vader"
    }

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
        
        # Get predictions from VADER
        logger.info("🤖 Running VADER analysis...")
        predictions = model_loader.predict_sentiment(texts)
        logger.info(f"✅ Got {len(predictions)} predictions")
        
        # Log results
        for i, pred in enumerate(predictions):
            logger.info(f"   Post {i+1}: {pred['sentiment'].upper()} (score: {pred['sentimentScore']:.3f})")
        
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
            result['sentimentSource'] = 'vader'
            
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
