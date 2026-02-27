import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { franc } from 'franc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // 1) Show overall language counts
  console.log('\n=== TOP LANGUAGES IN DB ===');
  const langCounts = await db.collection('socialposts').aggregate([
    { $group: { _id: '$language', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]).toArray();
  console.table(langCounts.map(r => ({ language: r._id, count: r.count })));

  // 2) Sample Hindi-script posts that franc detected as something else
  console.log('\n=== SAMPLE POSTS WITH DEVANAGARI SCRIPT DETECTED AS ENGLISH ===');
  const devPosts = await db.collection('socialposts').find({
    language: 'en',
    'content.text': { $regex: '[\u0900-\u097F]' },
  }).limit(10).project({ language: 1, 'content.text': 1 }).toArray();

  devPosts.forEach(p => {
    const text = (p.content?.text || '').substring(0, 120);
    const redetected = franc(text);
    console.log(`  DB: ${p.language} | franc-now: ${redetected} | "${text}"`);
  });

  console.log(`  Total Devanagari posts marked as English: ${await db.collection('socialposts').countDocuments({
    language: 'en',
    'content.text': { $regex: '[\u0900-\u097F]' },
  })}`);

  // 3) Sample Tamil-script posts marked as English
  console.log('\n=== SAMPLE POSTS WITH TAMIL SCRIPT DETECTED AS ENGLISH ===');
  const tamilPosts = await db.collection('socialposts').find({
    language: 'en',
    'content.text': { $regex: '[\u0B80-\u0BFF]' },
  }).limit(5).project({ language: 1, 'content.text': 1 }).toArray();

  tamilPosts.forEach(p => {
    const text = (p.content?.text || '').substring(0, 120);
    const redetected = franc(text);
    console.log(`  DB: ${p.language} | franc-now: ${redetected} | "${text}"`);
  });

  console.log(`  Total Tamil-script posts marked as English: ${await db.collection('socialposts').countDocuments({
    language: 'en',
    'content.text': { $regex: '[\u0B80-\u0BFF]' },
  })}`);

  // 4) Sample Bengali-script posts marked as English
  console.log('\n=== BENGALI SCRIPT POSTS MARKED AS ENGLISH ===');
  console.log(`  Count: ${await db.collection('socialposts').countDocuments({
    language: 'en',
    'content.text': { $regex: '[\u0980-\u09FF]' },
  })}`);

  await mongoose.disconnect();
}

check();
