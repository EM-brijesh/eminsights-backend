import os
import sys
from pathlib import Path

# Set model path
model_path = Path(__file__).parent.parent.parent / 'bert-keras-bert_large_en-v3'
print(f"Model path: {model_path}")
print(f"Model path exists: {model_path.exists()}")

if model_path.exists():
    print(f"Contents: {list(model_path.iterdir())}")

# Try loading the model
try:
    from model_loader import SentimentModelLoader
    print("Importing SentimentModelLoader...")
    
    loader = SentimentModelLoader(str(model_path))
    print("Loading model...")
    loader.load_model()
    print("Model loaded successfully!")
    
    # Test prediction
    results = loader.predict_sentiment(["This is great!", "This is terrible"])
    print(f"Test predictions: {results}")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
