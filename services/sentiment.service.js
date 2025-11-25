import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDXbNiWOCWt9g94XDmMyX9q-CDbKiCeWtc";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

let genAI = null;
let model = null;

const SENTIMENT_LABELS = ["positive", "neutral", "negative"];
const DEFAULT_SCORES = {
  positive: 0.72,
  neutral: 0.5,
  negative: 0.28,
};

const GENERATION_CONFIG = {
  temperature: 0.2,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 256,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      sentiment: {
        type: "string",
        enum: SENTIMENT_LABELS,
        description: "Overall sentiment classification for the post.",
      },
      sentimentScore: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence score scaled between 0 (negative) and 1 (positive).",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Model confidence in the classification.",
      },
      explanation: {
        type: "string",
        description: "Optional short rationale for the classification.",
      },
    },
    required: ["sentiment", "sentimentScore"],
  },
};

const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUAL,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

const isDev = () => process.env.NODE_ENV !== "production";

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
  const text =
    post?.content?.text ||
    post?.content?.description ||
    post?.text ||
    post?.title ||
    post?.content?.title ||
    post?.summary ||
    "";

  // Clean up the text
  let cleanedText = text.trim();

  // Remove excessive whitespace
  cleanedText = cleanedText.replace(/\s+/g, " ");

  // For very short text, check if it's meaningful
  if (cleanedText.length < 3) {
    return "";
  }

  return cleanedText;
};

const buildPrompt = (post = {}, text = "") => {
  const metadata = {
    brand: post.brandName || post.brand || "unknown",
    platform: post.platform || "unknown",
    keyword: post.keyword || post.content?.keyword || "unspecified",
    language: post.language || post.locale || "unknown",
    createdAt: post.createdAt || post.publishedAt || null,
    author: post.author || post.user || null,
    hasMedia: Boolean(post.media?.length || post.content?.mediaUrl),
  };

  return `You are an expert social-media sentiment analyst. Classify the overall sentiment for the following post.

METADATA (JSON):
${JSON.stringify(metadata, null, 2)}

POST CONTENT:
"""
${text}
"""

CLASSIFICATION RULES:
1. POSITIVE: Praise, excitement, satisfaction, support, gratitude (even if short or using emojis/slang).
2. NEGATIVE: Complaints, frustration, anger, disappointment, sarcasm targeting the brand, or repeated issues.
3. NEUTRAL: Factual statements, news, questions, or updates without emotional tone.
4. Do NOT default to "neutral" when there is clear praise/complaint, even if the post is brief or uses sarcasm.
5. Account for emojis, emphasis (!!!), negations, and informal spelling before deciding the class.

Return JSON exactly matching the provided schema.`;
};

const tryParseJson = (rawText = "") => {
  let cleanResponse = rawText.trim();
  cleanResponse = cleanResponse
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gi, "");

  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : cleanResponse;

  return JSON.parse(candidate);
};

const normalizeSentimentResult = (parsed = {}) => {
  const sentiment = SENTIMENT_LABELS.includes(parsed.sentiment)
    ? parsed.sentiment
    : "neutral";

  const sentimentScore =
    typeof parsed.sentimentScore === "number"
      ? Math.max(0, Math.min(1, parsed.sentimentScore))
      : DEFAULT_SCORES[sentiment];

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : null;

  return { sentiment, sentimentScore, confidence };
};

const lexicalConfig = {
  positiveWords: [
    "love",
    "awesome",
    "amazing",
    "great",
    "fantastic",
    "excellent",
    "happy",
    "thrilled",
    "excited",
    "thanks",
    "thank you",
    "appreciate",
    "best",
    "impressed",
  ],
  negativeWords: [
    "hate",
    "terrible",
    "awful",
    "angry",
    "furious",
    "frustrated",
    "disappointed",
    "worst",
    "buggy",
    "trash",
    "broken",
    "complain",
    "issue",
    "problem",
    "unacceptable",
    "lag",
  ],
  positiveEmojis: ["😍", "🤩", "😊", "😁", "🔥", "✨", "💯", "❤️", "👍"],
  negativeEmojis: ["💀", "😡", "🤬", "😤", "💔", "👎", "😠", "😭"],
  negations: ["not", "never", "no", "isn't", "wasn't", "aren't", "can't", "won't"],
};

const NEGATION_PATTERN = lexicalConfig.negations
  .map((term) =>
    term
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+")
  )
  .join("|");

const countOccurrences = (text, tokens, useWordBoundary = true) => {
  const lower = text.toLowerCase();
  return tokens.reduce((sum, token) => {
    if (!token) return sum;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = useWordBoundary
      ? new RegExp(`\\b${escaped}\\b`, "gi")
      : new RegExp(escaped, "gi");
    const matches = lower.match(regex);
    return sum + (matches ? matches.length : 0);
  }, 0);
};

const countEmojiOccurrences = (text, emojis) =>
  emojis.reduce((sum, emoji) => sum + (text.split(emoji).length - 1), 0);

const detectNegatedPhrases = (text, tokens) => {
  if (!NEGATION_PATTERN) return 0;
  const lower = text.toLowerCase();
  return tokens.reduce((sum, token) => {
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const phraseRegex = new RegExp(
      `(?:${NEGATION_PATTERN})\\s+${escapedToken}`,
      "gi"
    );
    const matches = lower.match(phraseRegex);
    return sum + (matches ? matches.length : 0);
  }, 0);
};

const evaluateLexicalHeuristics = (text = "") => {
  if (!text || text.length < 4) return null;

  const positiveHits = countOccurrences(text, lexicalConfig.positiveWords);
  const negativeHits = countOccurrences(text, lexicalConfig.negativeWords);
  const positiveEmojiHits = countEmojiOccurrences(text, lexicalConfig.positiveEmojis);
  const negativeEmojiHits = countEmojiOccurrences(text, lexicalConfig.negativeEmojis);

  const emphasisBonus = (text.match(/!+/g)?.length || 0) * 0.15;
  const uppercaseWords = text
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 4 &&
        /[A-Z]/.test(word) &&
        word === word.toUpperCase() &&
        /[A-Z]/.test(word.replace(/[^A-Z]/g, ""))
    ).length;

  const negatedPositives = detectNegatedPhrases(text, lexicalConfig.positiveWords);
  const negatedNegatives = detectNegatedPhrases(text, lexicalConfig.negativeWords);

  const netPositive =
    positiveHits + positiveEmojiHits - negatedPositives + uppercaseWords * 0.2;
  const netNegative =
    negativeHits + negativeEmojiHits - negatedNegatives + uppercaseWords * 0.1;

  const netScore = netPositive - netNegative + emphasisBonus;
  const magnitude = Math.abs(netScore);

  if (magnitude < 1.2) {
    return null;
  }

  const sentiment = netScore > 0 ? "positive" : "negative";
  const confidence = Math.min(0.95, 0.55 + magnitude * 0.15);
  const sentimentScore =
    sentiment === "positive"
      ? Math.min(0.95, 0.6 + magnitude * 0.1)
      : Math.max(0.05, 0.4 - magnitude * 0.1);

  return {
    sentiment,
    sentimentScore,
    confidence,
    magnitude,
    reason: `heuristic-${sentiment}`,
  };
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
    if (isDev()) {
      console.warn("No text found in post for sentiment analysis:", {
        postId: post._id || post.id,
        platform: post.platform,
        hasContent: !!post.content,
        hasText: !!post.text,
        contentKeys: post.content ? Object.keys(post.content) : [],
      });
    }
    return {
      sentiment: null,
      sentimentScore: null,
      sentimentAnalyzedAt: null,
    };
  }

  // Log for debugging (only in development)
  if (isDev() && post.platform === "twitter") {
    console.log("Analyzing Twitter post sentiment:", {
      textLength: text.length,
      textPreview: text.substring(0, 100),
      platform: post.platform,
    });
  }

  try {
    const geminiModel = initializeGemini();

    const prompt = buildPrompt(post, text);

    const result = await geminiModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: GENERATION_CONFIG,
      safetySettings: SAFETY_SETTINGS,
    });

    const response = await result.response;
    const responseText = response.text();

    // Log response for debugging (only in development)
    if (isDev()) {
      console.log("Gemini response received:", responseText.substring(0, 200));
    }

    // Try to parse JSON from response
    let parsedResponse;
    let usedFallback = false;
    try {
      parsedResponse = tryParseJson(responseText);
    } catch (parseError) {
      console.warn(
        "Failed to parse Gemini response as JSON, attempting text extraction:",
        parseError.message
      );
      console.warn("Response text:", responseText.substring(0, 200));

      // Enhanced text extraction with better pattern matching
      const lowerText = responseText.toLowerCase();
      let sentiment = "neutral";
      let sentimentScore = 0.5;

      // More sophisticated sentiment detection
      const positiveIndicators = [
        "positive",
        "good",
        "great",
        "excellent",
        "love",
        "amazing",
        "awesome",
        "happy",
        "satisfied",
      ];
      const negativeIndicators = [
        "negative",
        "bad",
        "terrible",
        "hate",
        "awful",
        "disappointed",
        "angry",
        "frustrated",
        "complaint",
      ];

      const hasPositive = positiveIndicators.some((ind) =>
        lowerText.includes(ind)
      );
      const hasNegative = negativeIndicators.some((ind) =>
        lowerText.includes(ind)
      );

      if (hasPositive && !hasNegative) {
        sentiment = "positive";
        sentimentScore = 0.7;
      } else if (hasNegative && !hasPositive) {
        sentiment = "negative";
        sentimentScore = 0.3;
      } else if (hasPositive && hasNegative) {
        // Mixed sentiment - determine which is stronger
        const positiveCount = positiveIndicators.filter((ind) =>
          lowerText.includes(ind)
        ).length;
        const negativeCount = negativeIndicators.filter((ind) =>
          lowerText.includes(ind)
        ).length;
        if (positiveCount > negativeCount) {
          sentiment = "positive";
          sentimentScore = 0.6;
        } else {
          sentiment = "negative";
          sentimentScore = 0.4;
        }
      }

      parsedResponse = { sentiment, sentimentScore };
      usedFallback = true;
    }

    const normalized = normalizeSentimentResult(parsedResponse);
    const lexicalAdjustment = evaluateLexicalHeuristics(text);

    const confidenceOrScore =
      normalized.sentimentConfidence ?? normalized.sentimentScore ?? 0.5;
    const nearNeutralScore =
      Math.abs((normalized.sentimentScore ?? 0.5) - 0.5) < 0.12;

    const shouldApplyLexical =
      lexicalAdjustment &&
      (normalized.sentiment === "neutral" ||
        confidenceOrScore < 0.45 ||
        nearNeutralScore);

    const finalSentiment = shouldApplyLexical
      ? lexicalAdjustment.sentiment
      : normalized.sentiment;
    const finalScore = shouldApplyLexical
      ? lexicalAdjustment.sentimentScore
      : normalized.sentimentScore;
    const finalConfidence = shouldApplyLexical
      ? lexicalAdjustment.confidence
      : normalized.confidence;

    const fallbackReasons = [];
    if (usedFallback) fallbackReasons.push("parse");
    if (shouldApplyLexical) fallbackReasons.push("lexical");

    return {
      sentiment: finalSentiment,
      sentimentScore: finalScore,
      sentimentAnalyzedAt: new Date(),
      sentimentConfidence: finalConfidence,
      sentimentSource: shouldApplyLexical ? "gemini+heuristic" : "gemini",
      sentimentFallback: fallbackReasons.length > 0,
      sentimentFallbackReason: fallbackReasons,
      heuristicMeta: shouldApplyLexical ? lexicalAdjustment : null,
    };
  } catch (error) {
    console.error("Gemini sentiment analysis error:", {
      message: error.message,
      stack: error.stack,
      postPlatform: post?.platform,
      textLength: text?.length,
      textPreview: text?.substring(0, 50),
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
          sentimentConfidence: sentimentData.sentimentConfidence ?? null,
          sentimentSource: sentimentData.sentimentSource || "gemini",
          sentimentFallback: sentimentData.sentimentFallback ?? false,
          sentimentAnalyzedAt: sentimentData.sentimentAnalyzedAt,
          analysis: {
            ...(post.analysis || {}),
            sentiment: sentimentData.sentiment,
            sentimentConfidence: sentimentData.sentimentConfidence ?? null,
            sentimentSource: sentimentData.sentimentSource || "gemini",
            sentimentFallback: sentimentData.sentimentFallback ?? false,
            sentimentFallbackReason: sentimentData.sentimentFallbackReason || [],
            heuristicMeta: sentimentData.heuristicMeta || null,
          },
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
};

