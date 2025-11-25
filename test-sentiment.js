/**
 * Test script for Sentiment Analysis
 * 
 * Usage:
 * 1. Make sure your backend server is running
 * 2. Update the AUTH_TOKEN and API_URL if needed
 * 3. Run: node test-sentiment.js
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Get this from your login response

// Test data - sample posts to analyze
const testPosts = [
  {
    _id: 'test-1',
    content: {
      text: 'I love this product! It works perfectly and exceeded my expectations. Highly recommend!'
    }
  },
  {
    _id: 'test-2',
    content: {
      text: 'This is okay, nothing special. Does what it says but nothing more.'
    }
  },
  {
    _id: 'test-3',
    content: {
      text: 'Terrible product! Waste of money. Broke after one day. Do not buy!'
    }
  }
];

async function testSentimentAnalysis() {
  console.log('🧪 Testing Sentiment Analysis API\n');
  console.log(`API URL: ${API_URL}\n`);

  if (!AUTH_TOKEN) {
    console.log('⚠️  Warning: No AUTH_TOKEN provided. Some tests may fail.\n');
    console.log('To get a token:');
    console.log('1. Login via POST /api/auth/signin');
    console.log('2. Copy the token from the response');
    console.log('3. Set AUTH_TOKEN environment variable or update this script\n');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {})
  };

  try {
    // Test 1: Check sentiment endpoint
    console.log('📋 Test 1: Check Sentiment Endpoint');
    console.log('POST /api/sentiment/check');
    try {
      const checkResponse = await axios.post(
        `${API_URL}/api/sentiment/check`,
        { posts: testPosts },
        { headers }
      );
      console.log('✅ Success:', JSON.stringify(checkResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    console.log('\n');

    // Test 2: Analyze sentiment
    console.log('📋 Test 2: Analyze Sentiment');
    console.log('POST /api/sentiment/analyze');
    try {
      const analyzeResponse = await axios.post(
        `${API_URL}/api/sentiment/analyze`,
        { posts: testPosts },
        { headers }
      );
      console.log('✅ Success:');
      if (analyzeResponse.data.data) {
        analyzeResponse.data.data.forEach((post, index) => {
          console.log(`  Post ${index + 1}:`);
          console.log(`    Text: ${post.content?.text || 'N/A'}`);
          console.log(`    Sentiment: ${post.sentiment || 'N/A'}`);
          console.log(`    Score: ${post.sentimentScore || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log(JSON.stringify(analyzeResponse.data, null, 2));
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    console.log('\n');

    // Test 3: Batch analyze existing posts
    console.log('📋 Test 3: Batch Analyze Existing Posts');
    console.log('POST /api/sentiment/batch-analyze');
    try {
      const batchResponse = await axios.post(
        `${API_URL}/api/sentiment/batch-analyze`,
        { limit: 10, batchSize: 5 },
        { headers }
      );
      console.log('✅ Success:', JSON.stringify(batchResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    console.log('\n');

    // Test 4: Check database for posts with sentiment
    console.log('📋 Test 4: Verify Sentiment in Database');
    console.log('GET /api/search/data?brandName=<your-brand>&limit=5');
    console.log('⚠️  Note: Update brandName to test with real data\n');

    console.log('✅ All tests completed!\n');
    console.log('📝 Next Steps:');
    console.log('1. Check your database to see if posts have sentiment fields');
    console.log('2. Run a search to scrape new data and verify sentiment is added');
    console.log('3. Use the batch-analyze endpoint to process existing posts');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests
testSentimentAnalysis();

