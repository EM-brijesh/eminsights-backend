"""
VADER Sentiment Analysis Model Loader
Optimized for social media text with native neutral detection
"""
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

class SentimentModelLoader:
    """Load and manage VADER sentiment analyzer"""
    
    def __init__(self, model_path: str = None):
        """
        Initialize VADER analyzer
        
        Args:
            model_path: Not used for VADER (kept for compatibility)
        """
        self.analyzer = None
        self.is_loaded = False
        
    def load_model(self):
        """Load the VADER sentiment analyzer"""
        try:
            logger.info("Loading VADER sentiment analyzer...")
            logger.info("VADER is optimized for social media text (emojis, slang, hashtags)")
            
            self.analyzer = SentimentIntensityAnalyzer()
            
            self.is_loaded = True
            logger.info("VADER loaded successfully!")
            logger.info("Memory usage: ~5MB (vs 500MB for DistilBERT)")
            logger.info("Speed: 1000x faster than transformer models")
            
        except Exception as e:
            logger.error(f"Error loading VADER: {e}", exc_info=True)
            raise
    
    def predict_sentiment(self, texts: List[str]) -> List[Dict]:
        """
        Predict sentiment for a list of texts using VADER
        
        Args:
            texts: List of text strings to analyze
            
        Returns:
            List of dictionaries with sentiment predictions
        """
        if not self.is_loaded:
            raise RuntimeError("Model not loaded. Call load_model() first.")
        
        if not texts:
            return []
        
        results = []
        
        try:
            for text in texts:
                # Handle empty texts
                if not text or not text.strip():
                    results.append({
                        'sentiment': 'neutral',
                        'sentimentScore': 0.5,
                        'sentimentConfidence': 0.0,
                    })
                    continue
                
                # Get VADER scores
                scores = self.analyzer.polarity_scores(text.strip())
                compound = scores['compound']
                
                # VADER compound score ranges from -1 (most negative) to +1 (most positive)
                # Thresholds: >= 0.05 is positive, <= -0.05 is negative, else neutral
                if compound >= 0.05:
                    sentiment = 'positive'
                    # Map compound score to 0.5-1.0 range
                    sentiment_score = (compound + 1) / 2
                elif compound <= -0.05:
                    sentiment = 'negative'
                    # Map compound score to 0.0-0.5 range
                    sentiment_score = (compound + 1) / 2
                else:
                    sentiment = 'neutral'
                    sentiment_score = 0.5
                
                results.append({
                    'sentiment': sentiment,
                    'sentimentScore': round(sentiment_score, 3),
                    'sentimentConfidence': round(abs(compound), 3),
                })
            
        except Exception as e:
            logger.error(f"Error during prediction: {e}", exc_info=True)
            # Return neutral sentiment for all texts on error
            for text in texts:
                results.append({
                    'sentiment': 'neutral',
                    'sentimentScore': 0.5,
                    'sentimentConfidence': 0.0,
                })
        
        return results
