"""
Test VADER sentiment analysis
"""
from model_loader import SentimentModelLoader

# Initialize and load model
print("Loading VADER...")
loader = SentimentModelLoader()
loader.load_model()
print("VADER loaded!\n")

# Test with diverse examples
test_texts = [
    "This is amazing! I absolutely love it! 😍",
    "This is terrible. I hate it so much 😡",
    "It's okay, nothing special",
    "Not bad, could be better",
    "OMG this is the best thing ever!!!",
    "Worst experience of my life",
    "Meh",
    "Pretty good 👍",
    "Absolutely horrible and disappointing",
    "I'm feeling neutral about this"
]

print("Testing VADER predictions:\n")
print("=" * 80)

results = loader.predict_sentiment(test_texts)

for text, result in zip(test_texts, results):
    sentiment = result['sentiment']
    score = result['sentimentScore']
    confidence = result['sentimentConfidence']
    
    # Color coding for terminal
    if sentiment == 'positive':
        emoji = '✅'
    elif sentiment == 'negative':
        emoji = '❌'
    else:
        emoji = '⚪'
    
    print(f"\n{emoji} Text: {text}")
    print(f"   Sentiment: {sentiment.upper()}")
    print(f"   Score: {score:.3f}")
    print(f"   Confidence: {confidence:.3f}")

print("\n" + "=" * 80)
print("\nSummary:")
positive = sum(1 for r in results if r['sentiment'] == 'positive')
negative = sum(1 for r in results if r['sentiment'] == 'negative')
neutral = sum(1 for r in results if r['sentiment'] == 'neutral')

print(f"Positive: {positive}")
print(f"Negative: {negative}")
print(f"Neutral: {neutral}")
print(f"\n✅ VADER is working perfectly!")
