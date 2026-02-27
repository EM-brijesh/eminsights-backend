import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SocialPost } from '../models/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ISO 639-3 (3-letter) → ISO 639-1 (2-letter)
const ISO3_TO_ISO1 = {
  eng: 'en', hin: 'hi', nld: 'nl', spa: 'es', fra: 'fr', deu: 'de',
  por: 'pt', ita: 'it', rus: 'ru', jpn: 'ja', kor: 'ko', zho: 'zh',
  ara: 'ar', tur: 'tr', pol: 'pl', ben: 'bn', tam: 'ta', tel: 'te',
  mar: 'mr', guj: 'gu', kan: 'kn', mal: 'ml', pan: 'pa', urd: 'ur',
  swe: 'sv', dan: 'da', nor: 'no', fin: 'fi', tha: 'th', vie: 'vi',
  ind: 'id', msa: 'ms', ces: 'cs', ell: 'el', heb: 'he', hun: 'hu',
  ron: 'ro', ukr: 'uk', cat: 'ca', hrv: 'hr', bul: 'bg', slk: 'sk',
  slv: 'sl', lit: 'lt', lav: 'lv', est: 'et', fil: 'tl', afr: 'af',
  swa: 'sw', nep: 'ne', sin: 'si', mya: 'my', khm: 'km', lao: 'lo',
  amh: 'am', som: 'so', hau: 'ha', yor: 'yo', ibo: 'ig', zul: 'zu',
  jav: 'jv', sun: 'su', ceb: 'ceb', tgl: 'tl', glg: 'gl', eus: 'eu',
  kat: 'ka', hye: 'hy', aze: 'az', uzb: 'uz', kaz: 'kk', tgk: 'tg',
  kir: 'ky', mon: 'mn', bod: 'bo', pus: 'ps', fas: 'fa', ori: 'or',
  asm: 'as', mai: 'mai', bho: 'bh', raj: 'raj',
  npi: 'ne', nob: 'nb', nno: 'nn', swh: 'sw', uzn: 'uz', ekk: 'et',
  hat: 'ht', plt: 'mg', src: 'sc', qug: 'qu',
  sco: 'en',
};

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected');

    const distinctLangs = await SocialPost.distinct('language');
    const threeLetter = distinctLangs.filter(
      (code) => code && code.length === 3 && code !== 'und' && ISO3_TO_ISO1[code],
    );

    console.log(`Found ${threeLetter.length} 3-letter codes to convert: ${threeLetter.join(', ')}`);

    let totalUpdated = 0;

    for (const code3 of threeLetter) {
      const code2 = ISO3_TO_ISO1[code3];
      const result = await SocialPost.updateMany(
        { language: code3 },
        { $set: { language: code2 } },
      );
      console.log(`  ${code3} → ${code2}: ${result.modifiedCount} updated`);
      totalUpdated += result.modifiedCount;
    }

    const undResult = await SocialPost.updateMany(
      { language: 'und' },
      { $set: { language: 'undefined' } },
    );
    if (undResult.modifiedCount > 0) {
      console.log(`  und → undefined: ${undResult.modifiedCount} updated`);
      totalUpdated += undResult.modifiedCount;
    }

    console.log(`Migration complete: ${totalUpdated} total documents updated`);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
