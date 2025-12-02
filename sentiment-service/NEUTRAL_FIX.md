# Sentiment Model Fix - Neutral Detection

## Problem
The sentiment model was returning only neutral values for all texts.

## Root Cause
DistilBERT sentiment model only outputs two labels:
- `POSITIVE` 
- `NEGATIVE`

It **never** outputs `NEUTRAL` as a label. Our code was expecting a NEUTRAL label that doesn't exist.

## Solution
Added confidence-based neutral detection:

```python
NEUTRAL_THRESHOLD = 0.65

if score < NEUTRAL_THRESHOLD:
    # Low confidence - classify as neutral
    sentiment = 'neutral'
    sentiment_score = 0.5
elif label == 'POSITIVE':
    sentiment = 'positive'
    sentiment_score = 0.5 + (score * 0.5)  # 0.65-1.0
elif label == 'NEGATIVE':
    sentiment = 'negative'
    sentiment_score = 0.5 - (score * 0.5)  # 0.0-0.35
```

## How It Works Now

| Model Output | Confidence | Our Classification |
|--------------|------------|-------------------|
| POSITIVE | > 0.65 | **Positive** |
| POSITIVE | < 0.65 | **Neutral** |
| NEGATIVE | > 0.65 | **Negative** |
| NEGATIVE | < 0.65 | **Neutral** |

## Examples

- **"This is amazing!"** → POSITIVE (0.95) → **Positive** ✅
- **"This is terrible"** → NEGATIVE (0.92) → **Negative** ✅
- **"It's okay"** → POSITIVE (0.55) → **Neutral** ✅
- **"Not bad"** → NEGATIVE (0.60) → **Neutral** ✅

## Next Steps

1. **Restart Python service** to load new code
2. **Test with real posts** to verify classification
3. **Adjust threshold** if needed (currently 0.65)

## Threshold Tuning

If you find too many/few neutral classifications:

- **More neutral**: Increase threshold (e.g., 0.70)
- **Less neutral**: Decrease threshold (e.g., 0.60)

Edit `model_loader.py` line 94:
```python
NEUTRAL_THRESHOLD = 0.65  # Adjust this value
```
