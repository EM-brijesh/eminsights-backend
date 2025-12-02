"""
Test script to debug sentiment model
"""
from model_loader import SentimentModelLoader

# Initialize and load model
print("Loading model...")
loader = SentimentModelLoader()
loader.load_model()
print("Model loaded!")

# Test with sample texts
test_texts = [
    "This is amazing! I love it!",
    "This is terrible. I hate it.",
    "It's okay, nothing special."
]

print("\nTesting predictions:")
results = loader.predict_sentiment(test_texts)

for text, result in zip(test_texts, results):
    print(f"\nText: {text}")
    print(f"Sentiment: {result['sentiment']}")
    print(f"Score: {result['sentimentScore']}")
    print(f"Confidence: {result['sentimentConfidence']}")
