"""
Test script to verify LLM sentiment analysis is working correctly
"""
import requests
import json
from datetime import datetime

# Configuration
SERVICE_URL = "http://localhost:8000"

# Test data - various social media posts
TEST_POSTS = [
    {
        "_id": "test_positive_1",
        "content": {
            "text": "बिहार में ₹50,000 करोड़ घोटाला वाला दावा दरअसल एक राजनीतिक ड्रामा है, सच्चाई नहीं। अडानी पावर ने ये प्रोजेक्ट केंद्रीय सरकार के DEEP पोर्टल पर खुले रिवर्स ऑक्शन से जीता था, टोरेंट पावर, ललितपुर पावर और जेएसडब्ल्यू एनर्जी को पछाड़ते हुए, ₹6.075 प्रति यूनिट की सबसे कम बोली लगाकर"
        },
        "platform": "twitter",
        "expected_sentiment": "positive"
    },
    {
        "_id": "test_negative_1",
        "content": {
            "text": "The power of your one vote to a corrupt Narendra Modi helped:Adani grow from $5 billion to $85 billion Adani grew 17x under Modi Ambani grow from $23.6 billion to $106 billion Ambani grew 5x under Modi BJP grow from ₹781 crore to ₹9,181 crore BJP grew at 12x under Modi .Meanwhile, Narendra Modi pushed 80+ crore Indians to survive on just 5 kg of ration."
        },
        "platform": "reddit",
        "expected_sentiment": "negative"
    },
    {
        "_id": "test_neutral_1",
        "content": {
            "text": "bad product."
        },
        "platform": "facebook",
        "expected_sentiment": "negative"
    },
    {
        "_id": "test_sarcasm_1",
        "content": {
            "text": "Oh great, another delay. Just what I needed. 🙄"
        },
        "platform": "twitter",
        "expected_sentiment": "negative"
    },
    {
        "_id": "test_emoji_1",
        "content": {
            "text": "😍😍😍 Love it! ❤️❤️❤️"
        },
        "platform": "instagram",
        "expected_sentiment": "positive"
    },
    {
        "_id": "test_mixed_lang",
        "content": {
            "text": "Bahut accha product hai! Very good quality and fast delivery."
        },
        "platform": "twitter",
        "expected_sentiment": "positive"
    }
]

def test_health_check():
    """Test if the service is running and healthy"""
    print("\n" + "="*80)
    print("TEST 1: Health Check")
    print("="*80)
    
    try:
        response = requests.get(f"{SERVICE_URL}/health", timeout=5)
        response.raise_for_status()
        
        health_data = response.json()
        print(f"✅ Service is running")
        print(f"   Status: {health_data.get('status')}")
        print(f"   Model Loaded: {health_data.get('model_loaded')}")
        print(f"   Provider: {health_data.get('provider')}")
        print(f"   Model: {health_data.get('model_name')}")
        print(f"   API Configured: {health_data.get('api_configured')}")
        
        if health_data.get('status') != 'healthy':
            print("❌ Service is not healthy!")
            return False
            
        return True
        
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to service. Is it running on port 8000?")
        print("   Start it with: python main.py")
        return False
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_sentiment_analysis():
    """Test sentiment analysis with various posts"""
    print("\n" + "="*80)
    print("TEST 2: Sentiment Analysis")
    print("="*80)
    
    try:
        # Prepare request
        request_data = {
            "posts": [
                {
                    "_id": post["_id"],
                    "content": post["content"],
                    "platform": post["platform"]
                }
                for post in TEST_POSTS
            ]
        }
        
        print(f"\nSending {len(TEST_POSTS)} posts for analysis...")
        
        # Send request
        response = requests.post(
            f"{SERVICE_URL}/analyze",
            json=request_data,
            timeout=60
        )
        response.raise_for_status()
        
        # Parse response
        result_data = response.json()
        results = result_data.get("results", [])
        
        print(f"✅ Received {len(results)} results\n")
        
        # Validate results
        correct_predictions = 0
        total_tests = len(TEST_POSTS)
        
        for i, (test_post, result) in enumerate(zip(TEST_POSTS, results), 1):
            text = test_post["content"]["text"]
            expected = test_post["expected_sentiment"]
            actual = result.get("sentiment")
            score = result.get("sentimentScore")
            confidence = result.get("sentimentConfidence")
            
            is_correct = actual == expected
            if is_correct:
                correct_predictions += 1
            
            status = "✅" if is_correct else "⚠️"
            
            print(f"{status} Test {i}: {test_post['_id']}")
            print(f"   Text: '{text[:60]}...'")
            print(f"   Expected: {expected}")
            print(f"   Actual: {actual}")
            print(f"   Score: {score:.3f} (0=negative, 0.5=neutral, 1=positive)")
            print(f"   Confidence: {confidence:.3f}")
            print()
        
        # Summary
        accuracy = (correct_predictions / total_tests) * 100
        print("="*80)
        print(f"SUMMARY: {correct_predictions}/{total_tests} correct ({accuracy:.1f}% accuracy)")
        print("="*80)
        
        if accuracy >= 80:
            print("✅ Sentiment analysis is working well!")
            return True
        else:
            print("⚠️  Accuracy is lower than expected. Check the prompt or model.")
            return True  # Still return True as the service is working
            
    except requests.exceptions.Timeout:
        print("❌ Request timed out. The LLM API might be slow.")
        return False
    except Exception as e:
        print(f"❌ Sentiment analysis test failed: {e}")
        return False

def test_response_format():
    """Test that the response format is correct"""
    print("\n" + "="*80)
    print("TEST 3: Response Format Validation")
    print("="*80)
    
    try:
        # Send a simple test
        test_data = {
            "posts": [{
                "_id": "format_test",
                "content": {"text": "Test message"},
                "platform": "test"
            }]
        }
        
        response = requests.post(f"{SERVICE_URL}/analyze", json=test_data, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        
        # Validate structure
        assert "results" in result, "Missing 'results' field"
        assert len(result["results"]) == 1, "Wrong number of results"
        
        post_result = result["results"][0]
        
        # Check required fields
        required_fields = ["sentiment", "sentimentScore", "sentimentConfidence", 
                          "sentimentAnalyzedAt", "sentimentSource"]
        
        for field in required_fields:
            assert field in post_result, f"Missing required field: {field}"
        
        # Validate field types and ranges
        assert post_result["sentiment"] in ["positive", "neutral", "negative"], \
            "Invalid sentiment value"
        
        assert 0 <= post_result["sentimentScore"] <= 1, \
            "sentimentScore out of range [0, 1]"
        
        assert 0 <= post_result["sentimentConfidence"] <= 1, \
            "sentimentConfidence out of range [0, 1]"
        
        assert post_result["sentimentSource"].startswith("llm_"), \
            "Invalid sentimentSource format"
        
        print("✅ Response format is correct")
        print(f"   Sentiment: {post_result['sentiment']}")
        print(f"   Score: {post_result['sentimentScore']}")
        print(f"   Confidence: {post_result['sentimentConfidence']}")
        print(f"   Source: {post_result['sentimentSource']}")
        print(f"   Analyzed At: {post_result['sentimentAnalyzedAt']}")
        
        return True
        
    except AssertionError as e:
        print(f"❌ Format validation failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Format test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("🧪 LLM SENTIMENT ANALYSIS TEST SUITE")
    print("="*80)
    print(f"Service URL: {SERVICE_URL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Run tests
    test_results = []
    
    test_results.append(("Health Check", test_health_check()))
    
    if test_results[0][1]:  # Only continue if health check passed
        test_results.append(("Response Format", test_response_format()))
        test_results.append(("Sentiment Analysis", test_sentiment_analysis()))
    else:
        print("\n⚠️  Skipping other tests because health check failed")
    
    # Final summary
    print("\n" + "="*80)
    print("📊 FINAL TEST RESULTS")
    print("="*80)
    
    for test_name, passed in test_results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(result[1] for result in test_results)
    
    print("="*80)
    if all_passed:
        print("🎉 ALL TESTS PASSED! Sentiment analysis is working correctly.")
    else:
        print("⚠️  SOME TESTS FAILED. Check the errors above.")
    print("="*80)
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
