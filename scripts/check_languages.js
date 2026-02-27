import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const results = await mongoose.connection.db
    .collection('socialposts')
    .aggregate([
      { $group: { _id: '$language', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 40 },
    ])
    .toArray();
  console.table(results.map((r) => ({ language: r._id, count: r.count })));
  await mongoose.disconnect();
}

check();
