#!/usr/bin/env node

/**
 * Sentiment benchmarking script
 *
 * Usage:
 *   node scripts/sentiment-benchmark.js --limit=50 --tag=pre-tuning
 *   node scripts/sentiment-benchmark.js --dataset=./data/custom.json --reports=./tmp/reports --only-mismatches=true
 *
 * Flags:
 *   --dataset=<path>        Override labeled dataset location (default data/labeled-sentiment.json)
 *   --reports=<path>        Override output directory (default reports/)
 *   --only-mismatches=true  CSV will only include wrong predictions for faster triage
 *   --dry-run=true          Skip Gemini calls and show how many posts would run
 *
 * Generates JSON + CSV reports under the chosen reports directory.
 */

import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { analyzePostsSentiment } from "../services/sentiment.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_DATA_PATH = path.join(ROOT_DIR, "data", "labeled-sentiment.json");
const DEFAULT_REPORT_DIR = path.join(ROOT_DIR, "reports");
const CLASSES = ["positive", "neutral", "negative"];

// Load env so Gemini credentials are available when script runs standalone
const envPath = path.join(ROOT_DIR, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const ensureGeminiKey = () => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      "[sentiment-benchmark] Warning: GEMINI_API_KEY is not set. The script will call Gemini with the default fallback key, which may be rate-limited."
    );
  }
};

const coerceBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (value === undefined) return false;
  if (value === "false" || value === "0") return false;
  return Boolean(value);
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config = {};

  args.forEach((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    config[key] = value ?? true;
  });

  return {
    limit: config.limit ? Number(config.limit) : undefined,
    tag: config.tag || "baseline",
    dryRun: coerceBoolean(config["dry-run"]),
    dataset: config.dataset,
    reports: config.reports,
    onlyMismatches: coerceBoolean(config["only-mismatches"]),
  };
};

const loadDataset = (datasetPath) => {
  if (!fs.existsSync(datasetPath)) {
    throw new Error(
      `Labeled dataset not found at ${datasetPath}. Add records to proceed.`
    );
  }

  const raw = fs.readFileSync(datasetPath, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Dataset file must contain an array with at least one item.");
  }

  return data;
};

const formatPostForAnalysis = (item) => ({
  _id: item.id,
  platform: item.platform,
  brandName: item.brand,
  content: {
    text: item.text,
    description: item.text,
  },
  text: item.text,
  language: item.language,
});

const buildConfusionMatrix = () => {
  const matrix = {};
  CLASSES.forEach((expected) => {
    matrix[expected] = {};
    CLASSES.forEach((predicted) => {
      matrix[expected][predicted] = 0;
    });
  });
  return matrix;
};

const computeStats = (records) => {
  const matrix = buildConfusionMatrix();
  let correct = 0;

  records.forEach((record) => {
    const expected = record.expected;
    const predicted = record.predicted;

    if (!matrix[expected]) {
      matrix[expected] = { positive: 0, neutral: 0, negative: 0 };
    }

    matrix[expected][predicted] = (matrix[expected][predicted] || 0) + 1;
    if (expected === predicted) {
      correct += 1;
    }
  });

  const perClass = {};
  CLASSES.forEach((label) => {
    const tp = matrix[label][label];
    const fp = CLASSES.reduce(
      (sum, other) => sum + (other !== label ? matrix[other][label] : 0),
      0
    );
    const fn = CLASSES.reduce(
      (sum, other) => sum + (other !== label ? matrix[label][other] : 0),
      0
    );
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);

    perClass[label] = {
      tp,
      fp,
      fn,
      precision: Number(precision.toFixed(3)),
      recall: Number(recall.toFixed(3)),
    };
  });

  return {
    accuracy: Number((correct / records.length).toFixed(3)),
    matrix,
    perClass,
    total: records.length,
    correct,
  };
};

const toCsv = (records) => {
  const headers = [
    "id",
    "platform",
    "brand",
    "expected",
    "predicted",
    "sentimentScore",
    "usedFallback",
    "fallbackReason",
    "heuristicReason",
    "text",
  ];

  const escape = (value = "") => {
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = records.map((row) =>
    [
      row.id,
      row.platform,
      row.brand,
      row.expected,
      row.predicted,
      row.sentimentScore ?? "",
      row.usedFallback ?? false,
      row.fallbackReason ?? "",
      row.heuristicReason ?? "",
      row.text?.slice(0, 500) ?? "",
    ].map(escape)
  );

  return [headers.map(escape), ...rows].map((row) => row.join(",")).join("\n");
};

const main = async () => {
  try {
    ensureGeminiKey();

    const { limit, tag, dryRun, dataset, reports, onlyMismatches } = parseArgs();
    const datasetPath = dataset
      ? path.resolve(process.cwd(), dataset)
      : DEFAULT_DATA_PATH;
    const reportsDir = reports
      ? path.resolve(process.cwd(), reports)
      : DEFAULT_REPORT_DIR;

    const datasetRecords = loadDataset(datasetPath);
    const trimmed = limit ? datasetRecords.slice(0, limit) : datasetRecords;

    if (dryRun) {
      console.log(
        `[sentiment-benchmark] Dry run: ${trimmed.length} labeled posts would be analyzed.`
      );
      return;
    }

    console.log(
      `[sentiment-benchmark] Running analysis for ${trimmed.length} labeled posts...`
    );

    const analysisInput = trimmed.map(formatPostForAnalysis);
    const analyzed = await analyzePostsSentiment(analysisInput, 5);

    const joined = trimmed.map((item, idx) => {
      const result = analyzed[idx] ?? {};
      return {
        id: item.id,
        platform: item.platform,
        brand: item.brand,
        expected: item.expectedSentiment,
        predicted: result.sentiment ?? null,
        sentimentScore: result.sentimentScore ?? null,
        usedFallback: result.analysis?.sentimentFallback ?? false,
        fallbackReason:
          result.analysis?.sentimentFallbackReason?.join("|") ?? "",
        heuristicReason: result.analysis?.heuristicMeta?.reason ?? "",
        text: item.text,
        notes: item.notes,
      };
    });

    const stats = computeStats(joined);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `sentiment-benchmark-${tag}-${timestamp}`;

    await fs.promises.mkdir(reportsDir, { recursive: true });

    const jsonReportPath = path.join(reportsDir, `${baseName}.json`);
    const csvReportPath = path.join(reportsDir, `${baseName}.csv`);

    const summary = {
      generatedAt: new Date().toISOString(),
      tag,
      limit: trimmed.length,
      stats,
      dataset: datasetPath,
      reportDirectory: reportsDir,
      onlyMismatches,
      notes: "Add this summary to CHANGELOG if running as part of a tuning cycle.",
    };

    await fs.promises.writeFile(
      jsonReportPath,
      JSON.stringify(
        {
          summary,
          records: joined,
        },
        null,
        2
      ),
      "utf8"
    );

    const csvRows = onlyMismatches
      ? joined.filter((row) => row.expected !== row.predicted)
      : joined;

    await fs.promises.writeFile(csvReportPath, toCsv(csvRows), "utf8");

    console.log("[sentiment-benchmark] Analysis complete.");
    console.table(stats.perClass);
    console.log(
      `[sentiment-benchmark] Accuracy: ${stats.accuracy} (${stats.correct}/${stats.total})`
    );
    console.log(
      `[sentiment-benchmark] Reports written to:\n- ${jsonReportPath}\n- ${csvReportPath}`
    );
  } catch (error) {
    console.error("[sentiment-benchmark] Failed:", error.message);
    process.exitCode = 1;
  }
};

main();

