import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDXbNiWOCWt9g94XDmMyX9q-CDbKiCeWtc";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

let genAI = null;
let model = null;

// Initialize Gemini client
const initializeGemini = () => {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  }
  return model;
};

/**
 * Extract text content from a post
 * @param {Object} post - Post object with content field
 * @returns {string} - Extracted text content
 */
const extractText = (post) => {
  // Try multiple fields to get text content
  const text = post?.content?.text || 
               post?.content?.description || 
               post?.text || 
               post?.title ||
               post?.content?.title ||
               "";
  
  // Clean up the text
  let cleanedText = text.trim();
  
  // Remove excessive whitespace
  cleanedText = cleanedText.replace(/\s+/g, ' ');
  
  // For very short text, check if it's meaningful
  if (cleanedText.length < 3) {
    return "";
  }
  
  return cleanedText;
};

/**
 * Analyze sentiment of a single post using Gemini API
 * @param {Object} post - Post object to analyze
 * @returns {Promise<Object>} - { sentiment, sentimentScore, sentimentAnalyzedAt }
 */
export const analyzePostSentiment = async (post) => {
  const text = extractText(post);
  
  // If no text, return null (no data)
  if (!text || text.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('No text found in post for sentiment analysis:', {
        postId: post._id || post.id,
        platform: post.platform,
        hasContent: !!post.content,
        hasText: !!post.text,
        contentKeys: post.content ? Object.keys(post.content) : []
      });
    }
    return {
      sentiment: null,
      sentimentScore: null,
      sentimentAnalyzedAt: null,
    };
  }
  
  // Log for debugging (only in development)
  if (process.env.NODE_ENV !== 'production' && post.platform === 'twitter') {
    console.log('Analyzing Twitter post sentiment:', {
      textLength: text.length,
      textPreview: text.substring(0, 100),
      platform: post.platform
    });
  }

  try {
    const geminiModel = initializeGemini();
    
    // Improved prompt optimized for social media (Twitter, YouTube, Reddit)
    const prompt = `You are an expert sentiment analyzer for social media content. Analyze the sentiment of this social media post (which may be from Twitter/X, YouTube, Reddit, or other platforms).

POST CONTENT:
"${text}"

INSTRUCTIONS:
1. Consider the context: This is social media content that may include:
   - Emojis, hashtags, mentions (@username)
   - Slang, abbreviations, internet language
   - Sarcasm, irony, or humor
   - Short-form content (tweets, comments, posts)

2. Sentiment Classification:
   - POSITIVE: Expresses satisfaction, praise, excitement, support, agreement, or positive emotions
   - NEGATIVE: Expresses dissatisfaction, criticism, anger, disappointment, complaints, or negative emotions
   - NEUTRAL: Factual statements, questions, informational content, or unclear sentiment

3. Sentiment Score Guidelines:
   - 0.0-0.3: Strongly negative (complaints, anger, strong criticism)
   - 0.3-0.4: Negative (mild criticism, disappointment)
   - 0.4-0.6: Neutral (factual, informational, unclear)
   - 0.6-0.7: Positive (mild praise, satisfaction)
   - 0.7-1.0: Strongly positive (enthusiasm, strong praise, excitement)

4. Important: Consider the overall tone and intent, not just individual words. Account for sarcasm and context.

REQUIRED OUTPUT FORMAT (JSON only, no markdown, no explanations):
{
  "sentiment": "positive",
  "sentimentScore": 0.85
}

Replace "positive" with "neutral" or "negative" as appropriate, and set sentimentScore to a number between 0 and 1.`;

    // Use generateContent with better configuration for consistent results
    const generationConfig = {
      temperature: 0.3, // Lower temperature for more consistent results
      topP: 0.8,
      topK: 40,
    };
    
    // Generate content with improved prompt
    const result = await geminiModel.generateContent(prompt, {
      generationConfig,
    });
    
    const response = await result.response;
    const responseText = response.text();
    
    // Log response for debugging (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Gemini response received:', responseText.substring(0, 200));
    }
    
    // Try to parse JSON from response
    let parsedResponse;
    try {
      // Clean the response text
      let cleanResponse = responseText.trim();
      
      // Remove markdown code blocks if present
      cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Extract JSON object (handles cases where there's extra text)
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        // Try parsing the whole response
        parsedResponse = JSON.parse(cleanResponse);
      }
    } catch (parseError) {
      console.warn("Failed to parse Gemini response as JSON, attempting text extraction:", parseError.message);
      console.warn("Response text:", responseText.substring(0, 200));
      
      // Enhanced text extraction with better pattern matching
      const lowerText = responseText.toLowerCase();
      let sentiment = "neutral";
      let sentimentScore = 0.5;
      
      // More sophisticated sentiment detection
      const positiveIndicators = ['positive', 'good', 'great', 'excellent', 'love', 'amazing', 'awesome', 'happy', 'satisfied'];
      const negativeIndicators = ['negative', 'bad', 'terrible', 'hate', 'awful', 'disappointed', 'angry', 'frustrated', 'complaint'];
      
      const hasPositive = positiveIndicators.some(ind => lowerText.includes(ind));
      const hasNegative = negativeIndicators.some(ind => lowerText.includes(ind));
      
      if (hasPositive && !hasNegative) {
        sentiment = "positive";
        sentimentScore = 0.7;
      } else if (hasNegative && !hasPositive) {
        sentiment = "negative";
        sentimentScore = 0.3;
      } else if (hasPositive && hasNegative) {
        // Mixed sentiment - determine which is stronger
        const positiveCount = positiveIndicators.filter(ind => lowerText.includes(ind)).length;
        const negativeCount = negativeIndicators.filter(ind => lowerText.includes(ind)).length;
        if (positiveCount > negativeCount) {
          sentiment = "positive";
          sentimentScore = 0.6;
        } else {
          sentiment = "negative";
          sentimentScore = 0.4;
        }
      }
      
      parsedResponse = { sentiment, sentimentScore };
    }

    // Validate and normalize response
    const sentiment = ["positive", "neutral", "negative"].includes(parsedResponse.sentiment)
      ? parsedResponse.sentiment
      : "neutral";
    
    const sentimentScore = typeof parsedResponse.sentimentScore === "number"
      ? Math.max(0, Math.min(1, parsedResponse.sentimentScore))
      : sentiment === "positive" ? 0.7 : sentiment === "negative" ? 0.3 : 0.5;

    return {
      sentiment,
      sentimentScore,
      sentimentAnalyzedAt: new Date(),
    };
  } catch (error) {
    console.error("Gemini sentiment analysis error:", {
      message: error.message,
      stack: error.stack,
      postPlatform: post?.platform,
      textLength: text?.length,
      textPreview: text?.substring(0, 50)
    });
    
    // Return null on error (no data available)
    return {
      sentiment: null,
      sentimentScore: null,
      sentimentAnalyzedAt: null,
    };
  }
};

/**
 * Analyze sentiment for multiple posts in batch
 * @param {Array<Object>} posts - Array of post objects
 * @param {number} concurrency - Number of concurrent requests (default: 5)
 * @returns {Promise<Array<Object>>} - Array of posts with sentiment analysis
 */
export const analyzePostsSentiment = async (posts, concurrency = 5) => {
  if (!posts || posts.length === 0) {
    return [];
  }

  const results = [];
  
  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < posts.length; i += concurrency) {
    const batch = posts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (post) => {
        const sentimentData = await analyzePostSentiment(post);
        return {
          ...post,
          sentiment: sentimentData.sentiment,
          sentimentScore: sentimentData.sentimentScore,
          sentimentAnalyzedAt: sentimentData.sentimentAnalyzedAt,
          analysis: {
            ...(post.analysis || {}),
            sentiment: sentimentData.sentiment,
          },
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
};

