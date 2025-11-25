import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  defaultConcurrency: 5,
  maxRetries: 3,
  retryDelayMs: 1000,
  requestTimeoutMs: 30000,
};

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
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

// ============================================================================
// ERROR CLASSES
// ============================================================================

class SentimentAnalysisError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "SentimentAnalysisError";
    this.code = code;
    this.details = details;
  }
}

class ConfigurationError extends SentimentAnalysisError {
  constructor(message, details) {
    super(message, "CONFIGURATION_ERROR", details);
    this.name = "ConfigurationError";
  }
}

class APIError extends SentimentAnalysisError {
  constructor(message, details) {
    super(message, "API_ERROR", details);
    this.name = "APIError";
  }
}

class ValidationError extends SentimentAnalysisError {
  constructor(message, details) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

// ============================================================================
// LOGGING UTILITY
// ============================================================================

const Logger = {
  level: process.env.LOG_LEVEL || "info",
  levels: { debug: 0, info: 1, warn: 2, error: 3 },

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  },

  debug(message, meta = {}) {
    if (this.shouldLog("debug")) {
      console.log(JSON.stringify({ level: "debug", message, ...meta, timestamp: new Date().toISOString() }));
    }
  },

  info(message, meta = {}) {
    if (this.shouldLog("info")) {
      console.log(JSON.stringify({ level: "info", message, ...meta, timestamp: new Date().toISOString() }));
    }
  },

  warn(message, meta = {}) {
    if (this.shouldLog("warn")) {
      console.warn(JSON.stringify({ level: "warn", message, ...meta, timestamp: new Date().toISOString() }));
    }
  },

  error(message, error = null, meta = {}) {
    if (this.shouldLog("error")) {
      console.error(JSON.stringify({
        level: "error",
        message,
        error: error ? {
          message: error.message,
          stack: error.stack,
          code: error.code,
        } : null,
        ...meta,
        timestamp: new Date().toISOString(),
      }));
    }
  },
};

// ============================================================================
// GEMINI CLIENT MANAGER
// ============================================================================

class GeminiClientManager {
  constructor() {
    this.client = null;
    this.model = null;
  }

  initialize() {
    if (!CONFIG.apiKey) {
      throw new ConfigurationError(
        "GEMINI_API_KEY environment variable is required",
        { available: false }
      );
    }

    if (!this.client) {
      this.client = new GoogleGenerativeAI(CONFIG.apiKey);
      this.model = this.client.getGenerativeModel({ model: CONFIG.model });
      Logger.info("Gemini client initialized", { model: CONFIG.model });
    }

    return this.model;
  }

  getModel() {
    if (!this.model) {
      return this.initialize();
    }
    return this.model;
  }

  reset() {
    this.client = null;
    this.model = null;
  }
}

const geminiManager = new GeminiClientManager();

// ============================================================================
// TEXT EXTRACTION
// ============================================================================

/**
 * Extract and clean text content from a post object
 * @param {Object} post - Post object with various content fields
 * @returns {string} - Cleaned text content
 */
function extractText(post) {
  if (!post || typeof post !== "object") {
    return "";
  }

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
  let cleanedText = String(text).trim();

  // Remove excessive whitespace
  cleanedText = cleanedText.replace(/\s+/g, " ");

  // For very short text, check if it's meaningful
  if (cleanedText.length < 3) {
    return "";
  }

  return cleanedText;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the prompt for sentiment analysis
 * @param {Object} post - Post object
 * @param {string} text - Extracted text content
 * @returns {string} - Formatted prompt
 */
function buildPrompt(post = {}, text = "") {
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
}

// ============================================================================
// JSON PARSING
// ============================================================================

/**
 * Parse JSON response from Gemini, handling various formats
 * @param {string} rawText - Raw response text
 * @returns {Object} - Parsed JSON object
 */
function parseJsonResponse(rawText = "") {
  let cleanResponse = rawText.trim();
  
  // Remove markdown code blocks
  cleanResponse = cleanResponse
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gi, "");

  // Try to extract JSON object
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : cleanResponse;

  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new ValidationError("Failed to parse JSON response", {
      rawText: rawText.substring(0, 200),
      cleanedText: candidate.substring(0, 200),
      error: error.message,
    });
  }
}

// ============================================================================
// RESULT NORMALIZATION
// ============================================================================

/**
 * Normalize and validate sentiment analysis result
 * @param {Object} parsed - Parsed response object
 * @returns {Object} - Normalized result with sentiment, sentimentScore, confidence
 */
function normalizeSentimentResult(parsed = {}) {
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
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<any>} - Result of the function
 */
async function retryWithBackoff(fn, maxRetries = CONFIG.maxRetries, baseDelay = CONFIG.retryDelayMs) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        Logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}`, {
          delay,
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new APIError("Max retries exceeded", {
    maxRetries,
    lastError: lastError.message,
  });
}

// ============================================================================
// GEMINI API CALL
// ============================================================================

/**
 * Call Gemini API for sentiment analysis
 * @param {string} prompt - Analysis prompt
 * @returns {Promise<Object>} - API response
 */
async function callGeminiAPI(prompt) {
  const model = geminiManager.getModel();

  const result = await model.generateContent({
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
  return response.text();
}

// ============================================================================
// CORE SENTIMENT ANALYSIS
// ============================================================================

/**
 * Analyze sentiment of a single post using Gemini API
 * @param {Object} post - Post object to analyze
 * @returns {Promise<Object>} - Sentiment analysis result
 */
export async function analyzePostSentiment(post) {
  const startTime = Date.now();

  try {
    // Validate input
    if (!post || typeof post !== "object") {
      throw new ValidationError("Invalid post object", { post });
    }

    // Extract text
    const text = extractText(post);

    // Handle empty text
    if (!text || text.length === 0) {
      Logger.warn("No text found in post", {
        postId: post._id || post.id,
        platform: post.platform,
        hasContent: !!post.content,
      });

      return {
        sentiment: null,
        sentimentScore: null,
        sentimentConfidence: null,
        sentimentAnalyzedAt: null,
        sentimentSource: "none",
        error: "NO_TEXT",
      };
    }

    Logger.debug("Analyzing post sentiment", {
      postId: post._id || post.id,
      platform: post.platform,
      textLength: text.length,
    });

    // Build prompt
    const prompt = buildPrompt(post, text);

    // Call API with retry logic
    const responseText = await retryWithBackoff(() => callGeminiAPI(prompt));

    Logger.debug("Gemini response received", {
      responseLength: responseText.length,
    });

    // Parse and normalize response
    const parsed = parseJsonResponse(responseText);
    const normalized = normalizeSentimentResult(parsed);

    const duration = Date.now() - startTime;

    Logger.info("Sentiment analysis completed", {
      postId: post._id || post.id,
      sentiment: normalized.sentiment,
      score: normalized.sentimentScore,
      duration,
    });

    return {
      sentiment: normalized.sentiment,
      sentimentScore: normalized.sentimentScore,
      sentimentConfidence: normalized.confidence,
      sentimentAnalyzedAt: new Date(),
      sentimentSource: "gemini",
      sentimentExplanation: parsed.explanation || null,
      processingTimeMs: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    Logger.error("Sentiment analysis failed", error, {
      postId: post?._id || post?.id,
      platform: post?.platform,
      errorType: error.name,
      errorCode: error.code,
      duration,
    });

    // Return error state
    return {
      sentiment: null,
      sentimentScore: null,
      sentimentConfidence: null,
      sentimentAnalyzedAt: null,
      sentimentSource: "error",
      error: error.code || "UNKNOWN_ERROR",
      errorMessage: error.message,
      processingTimeMs: duration,
    };
  }
}

// ============================================================================
// BATCH SENTIMENT ANALYSIS
// ============================================================================

/**
 * Analyze sentiment for multiple posts in batch with progress tracking
 * @param {Array<Object>} posts - Array of post objects
 * @param {Object} options - Options for batch processing
 * @param {number} options.concurrency - Number of concurrent requests
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} - Results with success/failure counts
 */
export async function analyzePostsSentiment(posts, options = {}) {
  const {
    concurrency = CONFIG.defaultConcurrency,
    onProgress = null,
  } = options;

  // Validate input
  if (!Array.isArray(posts)) {
    throw new ValidationError("Posts must be an array", { type: typeof posts });
  }

  if (posts.length === 0) {
    return {
      results: [],
      total: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };
  }

  Logger.info("Starting batch sentiment analysis", {
    totalPosts: posts.length,
    concurrency,
  });

  const results = [];
  const errors = [];
  let successful = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < posts.length; i += concurrency) {
    const batch = posts.slice(i, i + concurrency);
    const batchNumber = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(posts.length / concurrency);

    Logger.debug(`Processing batch ${batchNumber}/${totalBatches}`, {
      batchSize: batch.length,
    });

    const batchResults = await Promise.allSettled(
      batch.map(async (post, index) => {
        const sentimentData = await analyzePostSentiment(post);
        
        // Track success/failure
        if (sentimentData.sentiment) {
          successful++;
        } else {
          failed++;
          errors.push({
            postId: post._id || post.id,
            error: sentimentData.error,
            message: sentimentData.errorMessage,
          });
        }

        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            processed: i + index + 1,
            total: posts.length,
            successful,
            failed,
          });
        }

        return {
          ...post,
          sentiment: sentimentData.sentiment,
          sentimentScore: sentimentData.sentimentScore,
          sentimentConfidence: sentimentData.sentimentConfidence,
          sentimentAnalyzedAt: sentimentData.sentimentAnalyzedAt,
          sentimentSource: sentimentData.sentimentSource,
          sentimentExplanation: sentimentData.sentimentExplanation,
          sentimentError: sentimentData.error || null,
          analysis: {
            ...(post.analysis || {}),
            sentiment: sentimentData.sentiment,
            sentimentConfidence: sentimentData.sentimentConfidence,
            sentimentSource: sentimentData.sentimentSource,
            sentimentExplanation: sentimentData.sentimentExplanation,
            processingTimeMs: sentimentData.processingTimeMs,
          },
        };
      })
    );

    // Extract results from settled promises
    const batchProcessed = batchResults.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        Logger.error("Batch processing error", result.reason);
        return null;
      }
    }).filter(Boolean);

    results.push(...batchProcessed);

    // Add a small delay between batches to avoid rate limiting
    if (i + concurrency < posts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  Logger.info("Batch sentiment analysis completed", {
    total: posts.length,
    successful,
    failed,
    successRate: ((successful / posts.length) * 100).toFixed(2) + "%",
  });

  return {
    results,
    total: posts.length,
    successful,
    failed,
    errors,
    successRate: (successful / posts.length) * 100,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate API configuration
 * @returns {boolean} - True if configuration is valid
 */
export function validateConfiguration() {
  try {
    if (!CONFIG.apiKey) {
      throw new ConfigurationError("GEMINI_API_KEY is not set");
    }
    return true;
  } catch (error) {
    Logger.error("Configuration validation failed", error);
    return false;
  }
}

/**
 * Get current configuration (without sensitive data)
 * @returns {Object} - Safe configuration object
 */
export function getConfiguration() {
  return {
    model: CONFIG.model,
    defaultConcurrency: CONFIG.defaultConcurrency,
    maxRetries: CONFIG.maxRetries,
    retryDelayMs: CONFIG.retryDelayMs,
    hasApiKey: !!CONFIG.apiKey,
  };
}

/**
 * Reset the Gemini client (useful for testing)
 */
export function resetClient() {
  geminiManager.reset();
  Logger.info("Gemini client reset");
}
