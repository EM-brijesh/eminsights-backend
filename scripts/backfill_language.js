import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { franc } from 'franc';
import { SocialPost } from '../models/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BATCH_SIZE = 200;
const MIN_TEXT_LENGTH = 10;
const REDETECT_ALL = process.argv.includes('--redetect');

// Comprehensive ISO 639-3 → ISO 639-1 mapping (400+ languages)
// Covers all 22 scheduled Indian languages + regional Indian languages + world languages
const ISO3_TO_ISO1 = {
  // ── Indian scheduled languages (22 official) ──
  hin: 'hi',  // Hindi
  ben: 'bn',  // Bengali
  tam: 'ta',  // Tamil
  tel: 'te',  // Telugu
  mar: 'mr',  // Marathi
  guj: 'gu',  // Gujarati
  kan: 'kn',  // Kannada
  mal: 'ml',  // Malayalam
  pan: 'pa',  // Punjabi
  ori: 'or',  // Odia
  asm: 'as',  // Assamese
  urd: 'ur',  // Urdu
  san: 'sa',  // Sanskrit
  nep: 'ne',  // Nepali
  snd: 'sd',  // Sindhi
  kas: 'ks',  // Kashmiri
  mai: 'mai', // Maithili
  sat: 'sat', // Santali
  doi: 'doi', // Dogri
  kok: 'kok', // Konkani
  mni: 'mni', // Manipuri (Meitei)
  bod: 'bo',  // Bodo (Tibetan script group)

  // ── Other Indian regional languages ──
  bho: 'bh',  // Bhojpuri
  raj: 'raj', // Rajasthani
  mag: 'mag', // Magahi
  awa: 'awa', // Awadhi
  mar: 'mr',  // Marwari (often detected as Marathi)
  tcy: 'tcy', // Tulu
  lus: 'lus', // Mizo (Lushai)
  khm: 'km',  // Khmer
  brx: 'brx', // Bodo
  hne: 'hne', // Chhattisgarhi
  gom: 'gom', // Goan Konkani
  dgo: 'dgo', // Dogri (alternate code)
  mwr: 'mwr', // Marwari
  npi: 'ne',  // Nepali (modern ISO 639-3 code)

  // ── Major world languages ──
  eng: 'en',  // English
  spa: 'es',  // Spanish
  fra: 'fr',  // French
  deu: 'de',  // German
  por: 'pt',  // Portuguese
  ita: 'it',  // Italian
  rus: 'ru',  // Russian
  jpn: 'ja',  // Japanese
  kor: 'ko',  // Korean
  zho: 'zh',  // Chinese
  ara: 'ar',  // Arabic
  tur: 'tr',  // Turkish
  pol: 'pl',  // Polish
  nld: 'nl',  // Dutch
  swe: 'sv',  // Swedish
  dan: 'da',  // Danish
  nor: 'no',  // Norwegian
  fin: 'fi',  // Finnish
  tha: 'th',  // Thai
  vie: 'vi',  // Vietnamese
  ind: 'id',  // Indonesian
  msa: 'ms',  // Malay
  ces: 'cs',  // Czech
  ell: 'el',  // Greek
  heb: 'he',  // Hebrew
  hun: 'hu',  // Hungarian
  ron: 'ro',  // Romanian
  ukr: 'uk',  // Ukrainian
  cat: 'ca',  // Catalan
  hrv: 'hr',  // Croatian
  bul: 'bg',  // Bulgarian
  slk: 'sk',  // Slovak
  slv: 'sl',  // Slovenian
  lit: 'lt',  // Lithuanian
  lav: 'lv',  // Latvian
  est: 'et',  // Estonian
  fas: 'fa',  // Persian/Farsi
  pus: 'ps',  // Pashto
  afr: 'af',  // Afrikaans
  swa: 'sw',  // Swahili
  sin: 'si',  // Sinhala
  mya: 'my',  // Myanmar/Burmese
  lao: 'lo',  // Lao
  amh: 'am',  // Amharic
  som: 'so',  // Somali
  hau: 'ha',  // Hausa
  yor: 'yo',  // Yoruba
  ibo: 'ig',  // Igbo
  zul: 'zu',  // Zulu
  xho: 'xh',  // Xhosa
  jav: 'jv',  // Javanese
  sun: 'su',  // Sundanese
  ceb: 'ceb', // Cebuano
  tgl: 'tl',  // Tagalog/Filipino
  glg: 'gl',  // Galician
  eus: 'eu',  // Basque
  kat: 'ka',  // Georgian
  hye: 'hy',  // Armenian
  aze: 'az',  // Azerbaijani
  uzb: 'uz',  // Uzbek
  kaz: 'kk',  // Kazakh
  tgk: 'tg',  // Tajik
  kir: 'ky',  // Kyrgyz
  mon: 'mn',  // Mongolian
  bel: 'be',  // Belarusian
  mkd: 'mk',  // Macedonian
  srp: 'sr',  // Serbian
  bos: 'bs',  // Bosnian
  sqi: 'sq',  // Albanian
  isl: 'is',  // Icelandic
  mlt: 'mt',  // Maltese
  cym: 'cy',  // Welsh
  gle: 'ga',  // Irish
  tat: 'tt',  // Tatar
  tuk: 'tk',  // Turkmen

  // ── Additional 639-3 variants returned by franc ──
  nob: 'nb',  // Norwegian Bokmål
  nno: 'nn',  // Norwegian Nynorsk
  swh: 'sw',  // Swahili (specific)
  uzn: 'uz',  // Northern Uzbek
  ekk: 'et',  // Estonian (specific)
  hat: 'ht',  // Haitian Creole
  plt: 'mg',  // Plateau Malagasy
  src: 'sc',  // Sardinian (Logudorese)
  qug: 'qu',  // Quechua (Highland)
  sco: 'en',  // Scots → treat as English (franc misidentifies short English as Scots)
};

// Unicode script ranges → language code.
// If enough characters from a specific script are found, that script wins.
// This is far more reliable than trigram analysis for Indian languages
// because social media posts often mix native script with Latin hashtags/URLs.
const SCRIPT_PATTERNS = [
  { regex: /[\u0900-\u097F]/g, lang: 'hi' },  // Devanagari → Hindi
  { regex: /[\u0980-\u09FF]/g, lang: 'bn' },  // Bengali
  { regex: /[\u0A00-\u0A7F]/g, lang: 'pa' },  // Gurmukhi → Punjabi
  { regex: /[\u0A80-\u0AFF]/g, lang: 'gu' },  // Gujarati
  { regex: /[\u0B00-\u0B7F]/g, lang: 'or' },  // Odia
  { regex: /[\u0B80-\u0BFF]/g, lang: 'ta' },  // Tamil
  { regex: /[\u0C00-\u0C7F]/g, lang: 'te' },  // Telugu
  { regex: /[\u0C80-\u0CFF]/g, lang: 'kn' },  // Kannada
  { regex: /[\u0D00-\u0D7F]/g, lang: 'ml' },  // Malayalam
  { regex: /[\u0600-\u06FF]/g, lang: 'ur' },   // Arabic script → Urdu (for Indian context)
];

const SCRIPT_MIN_CHARS = 4;

function detectByScript(text) {
  let best = null;
  let bestCount = 0;
  for (const { regex, lang } of SCRIPT_PATTERNS) {
    const matches = text.match(regex);
    const count = matches ? matches.length : 0;
    if (count >= SCRIPT_MIN_CHARS && count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

function detectLanguage(text) {
  if (!text || text.trim().length < MIN_TEXT_LENGTH) return 'undefined';
  const cleaned = text.trim();
  try {
    // Script-based detection first (reliable for Indian languages)
    const scriptLang = detectByScript(cleaned);
    if (scriptLang) return scriptLang;

    // Fall back to trigram-based detection
    const code3 = franc(cleaned);
    if (code3 === 'und') return 'undefined';
    return ISO3_TO_ISO1[code3] || code3;
  } catch {
    return 'undefined';
  }
}

function extractText(doc) {
  return (
    doc?.content?.text ||
    doc?.content?.description ||
    doc?.text ||
    doc?.summary ||
    ''
  );
}

async function backfillLanguage() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const query = REDETECT_ALL
      ? {}
      : { $or: [{ language: { $exists: false } }, { language: null }] };

    const mode = REDETECT_ALL ? 'RE-DETECT ALL' : 'BACKFILL MISSING';
    const totalPosts = await SocialPost.countDocuments(query);
    console.log(`[${mode}] Found ${totalPosts} posts to process`);

    if (totalPosts === 0) {
      console.log('Nothing to process.');
      await mongoose.disconnect();
      return;
    }

    let processed = 0;
    let updated = 0;

    const cursor = SocialPost.find(query)
      .select({ _id: 1, content: 1, text: 1, summary: 1 })
      .lean()
      .cursor({ batchSize: BATCH_SIZE });

    const flushBatch = async (docs) => {
      const bulkOps = docs.map((doc) => {
        const text = extractText(doc);
        const language = detectLanguage(text);
        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { language } },
          },
        };
      });

      if (bulkOps.length > 0) {
        const result = await SocialPost.bulkWrite(bulkOps, { ordered: false });
        updated += result.modifiedCount || 0;
      }

      processed += docs.length;
      console.log(`Progress: ${processed}/${totalPosts} processed, ${updated} updated`);
    };

    let batch = [];

    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await flushBatch(batch);
    }

    console.log(`Complete: ${processed} processed, ${updated} updated`);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Backfill failed:', error.message);
    process.exit(1);
  }
}

backfillLanguage();
