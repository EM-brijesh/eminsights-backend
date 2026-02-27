// ============================================================================
// GEMINI CODE COMMENTED OUT - NOW USING KERAS BERT MODEL VIA PYTHON SERVICE
// ============================================================================
// import {
//   GoogleGenerativeAI,
//   HarmBlockThreshold,
//   HarmCategory,
// } from "@google/generative-ai";

import axios from "axios";

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Python FastAPI service configuration
const CONFIG = {
  get serviceUrl() {
    return process.env.SENTIMENT_SERVICE_URL || "http://localhost:8000";
  },
  // No rate limiting needed for local model
  defaultConcurrency: 10, // Can process multiple posts concurrently
  maxRetries: 2, // Simple retry for network errors only
  retryDelayMs: 1000,
  requestTimeoutMs: 60000, // 60 seconds timeout for model inference
};

// ============================================================================
// RATE LIMITER REMOVED - No longer needed for local model
// ============================================================================

const SENTIMENT_LABELS = ["positive", "neutral", "negative"];

const DEFAULT_SCORES = {
  positive: 0.72,
  neutral: 0.5,
  negative: 0.28,
};

// ============================================================================
// GEMINI CONFIG COMMENTED OUT
// ============================================================================
// const GENERATION_CONFIG = { ... };
// const SAFETY_SETTINGS = [ ... ];

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
// GEMINI CLIENT MANAGER COMMENTED OUT
// ============================================================================
// class GeminiClientManager { ... }
// const geminiManager = new GeminiClientManager();

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

  // Special handling for Google posts - combine title and snippet for better analysis
  if (post.platform === "google" || post.platform === "Google") {
    const title = post?.content?.title || post?.title || "";
    const snippet = post?.content?.text || post?.content?.description || post?.text || "";
    const combined = `${title} ${snippet}`.trim();
    
    if (combined.length >= 3) {
      return combined.replace(/\s+/g, " ");
    }
    return "";
  }

  // For other platforms, try multiple fields to get text content
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
// PROMPT BUILDING COMMENTED OUT - Not needed for BERT model
// ============================================================================
// function buildPrompt(post = {}, text = "") { ... }
// function parseJsonResponse(rawText = "") { ... }

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
// RETRY LOGIC - Simplified for network errors only
// ============================================================================

/**
 * Simple retry for network errors
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

      // Only retry on network errors (ECONNREFUSED, ETIMEDOUT, etc.)
      const isNetworkError = error.code === 'ECONNREFUSED' || 
                            error.code === 'ETIMEDOUT' ||
                            error.code === 'ENOTFOUND' ||
                            (error.response && error.response.status >= 500);

      if (attempt < maxRetries && isNetworkError) {
        const delay = baseDelay * Math.pow(2, attempt);
        Logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}`, {
          delay: Math.round(delay / 1000) + "s",
          error: error.message?.substring(0, 100),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (!isNetworkError) {
        // Don't retry non-network errors
        throw error;
      }
    }
  }

  throw new APIError("Max retries exceeded", {
    maxRetries,
    lastError: lastError?.message,
  });
}

// ============================================================================
// PYTHON SERVICE API CALL
// ============================================================================

/**
 * Call Python FastAPI service for sentiment analysis
 * @param {Array<Object>} posts - Array of post objects to analyze
 * @returns {Promise<Array>} - Array of sentiment analysis results
 */
async function callPythonService(posts) {
  const serviceUrl = CONFIG.serviceUrl;
  const endpoint = `${serviceUrl}/analyze`;

  try {
    Logger.debug("Calling Python service", {
      endpoint,
      postCount: posts.length,
    });

    const response = await axios.post(
      endpoint,
      { posts },
      {
        timeout: CONFIG.requestTimeoutMs,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data && response.data.results) {
      Logger.debug("Python service response received", {
        resultCount: response.data.results.length,
      });
      return response.data.results;
    }

    throw new APIError("Invalid response format from Python service", {
      response: response.data,
    });
  } catch (error) {
    if (error.response) {
      // Python service returned an error
      Logger.error("Python service returned error", {
        status: error.response.status,
        data: error.response.data,
      });
      throw new APIError(
        `Python service error: ${error.response.data?.detail || error.response.statusText}`,
        {
          status: error.response.status,
          data: error.response.data,
        }
      );
    } else if (error.request) {
      // Request was made but no response received
      Logger.error("Python service connection failed", {
        endpoint,
        code: error.code,
        message: error.message,
      });
      throw new APIError(
        `Python service is not responding at ${endpoint}. Make sure the service is running.`,
        {
          code: error.code,
          message: error.message,
          endpoint,
        }
      );
    } else {
      // Error setting up request
      Logger.error("Failed to setup request to Python service", {
        endpoint,
        code: error.code,
        message: error.message,
      });
      throw new APIError(`Failed to call Python service: ${error.message}`, {
        code: error.code,
        endpoint,
      });
    }
  }
}

// ============================================================================
// CORE SENTIMENT ANALYSIS
// ============================================================================

/**
 * Analyze sentiment of a single post using Python BERT service
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

    // Call Python service with retry logic for network errors
    const results = await retryWithBackoff(() => callPythonService([post]));

    if (!results || results.length === 0) {
      throw new APIError("No results returned from Python service");
    }

    const result = results[0];
    const duration = Date.now() - startTime;

    Logger.info("Sentiment analysis completed", {
      postId: post._id || post.id,
      sentiment: result.sentiment,
      score: result.sentimentScore,
      duration,
    });

    // Return result matching expected format
    return {
      sentiment: result.sentiment || 'neutral',
      sentimentScore: result.sentimentScore || 0.5,
      sentimentConfidence: result.sentimentConfidence || 0.0,
      sentimentAnalyzedAt: result.sentimentAnalyzedAt || new Date(),
      sentimentSource: result.sentimentSource || "llm",
      language: result.language || null,
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
    serviceUrl: CONFIG.serviceUrl,
  });

  const results = [];
  const errors = [];
  let successful = 0;
  let failed = 0;

  // Process posts in batches via Python service
  // No rate limiting needed for local model - can process efficiently
  const batchSize = Math.max(1, Math.min(50, concurrency * 10)); // Process in batches of up to 50
  
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(posts.length / batchSize);

    Logger.debug(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} posts)`);

    try {
      // Call Python service with batch of posts
      const batchResults = await retryWithBackoff(() => callPythonService(batch));

      // Process results
      for (let j = 0; j < batch.length; j++) {
        const post = batch[j];
        const result = batchResults[j];

        if (result && result.sentiment) {
          successful++;
          results.push({
            ...post,
            sentiment: result.sentiment,
            sentimentScore: result.sentimentScore,
            sentimentConfidence: result.sentimentConfidence,
            sentimentAnalyzedAt: result.sentimentAnalyzedAt || new Date(),
            sentimentSource: result.sentimentSource || "llm",
            language: result.language || null,
            sentimentError: null,
            analysis: {
              ...(post.analysis || {}),
              sentiment: result.sentiment,
              sentimentConfidence: result.sentimentConfidence,
              sentimentSource: result.sentimentSource || "llm",
            },
          });
        } else {
          failed++;
          errors.push({
            postId: post._id || post.id,
            platform: post.platform || 'unknown',
            keyword: post.keyword || 'unknown',
            error: result?.error || 'NO_RESULT',
            message: result?.errorMessage || 'No result from Python service',
            hasText: !!(post.content?.text || post.content?.title || post.text || post.title),
            textLength: (post.content?.text || post.content?.title || post.text || post.title || '').length,
          });
          // Add post with null sentiment
          results.push({
            ...post,
            sentiment: null,
            sentimentScore: null,
            sentimentConfidence: null,
            sentimentAnalyzedAt: null,
            sentimentSource: "error",
            sentimentError: result?.error || 'NO_RESULT',
          });
        }

        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            processed: i + j + 1,
            total: posts.length,
            successful,
            failed,
          });
        }
      }
    } catch (error) {
      Logger.error(`Batch ${batchNumber} processing error`, error);
      // Mark all posts in this batch as failed
      for (const post of batch) {
        failed++;
        errors.push({
          postId: post._id || post.id,
          platform: post.platform || 'unknown',
          keyword: post.keyword || 'unknown',
          error: error.code || 'BATCH_ERROR',
          message: error.message,
        });
        results.push({
          ...post,
          sentiment: null,
          sentimentScore: null,
          sentimentConfidence: null,
          sentimentAnalyzedAt: null,
          sentimentSource: "error",
          sentimentError: error.code || 'BATCH_ERROR',
        });
      }
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
 * Validate service configuration
 * @returns {boolean} - True if configuration is valid
 */
export function validateConfiguration() {
  try {
    if (!CONFIG.serviceUrl) {
      throw new ConfigurationError("SENTIMENT_SERVICE_URL is not set");
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
    serviceUrl: CONFIG.serviceUrl,
    defaultConcurrency: CONFIG.defaultConcurrency,
    maxRetries: CONFIG.maxRetries,
    retryDelayMs: CONFIG.retryDelayMs,
    hasServiceUrl: !!CONFIG.serviceUrl,
  };
}

/**
 * Check if Python service is available
 * @returns {Promise<boolean>} - True if service is healthy
 */
export async function checkServiceHealth() {
  try {
    const response = await axios.get(`${CONFIG.serviceUrl}/health`, {
      timeout: 5000,
    });
    return response.data?.status === "healthy";
  } catch (error) {
    Logger.warn("Python service health check failed", { error: error.message });
    return false;
  }
}
