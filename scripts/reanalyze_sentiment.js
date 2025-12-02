import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SocialPost } from '../models/data.js';
import { analyzePostsSentiment } from '../services/sentiment.service.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BATCH_SIZE = 50;

async function reanalyzeSentiment() {
    try {
        console.log('🔵 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find posts that need analysis or are neutral (likely from broken model)
        const query = {
            $or: [
                { sentiment: 'neutral' },
                { sentiment: { $exists: false } },
                { sentiment: null }
            ]
        };

        const totalPosts = await SocialPost.countDocuments(query);
        console.log(`📊 Found ${totalPosts} posts to re-analyze`);

        if (totalPosts === 0) {
            console.log('✅ No posts need re-analysis');
            process.exit(0);
        }

        let processed = 0;
        let updated = 0;

        // Process in batches
        while (processed < totalPosts) {
            const posts = await SocialPost.find(query)
                .limit(BATCH_SIZE)
                .skip(processed);

            if (posts.length === 0) break;

            console.log(`\n🔄 Processing batch ${Math.floor(processed / BATCH_SIZE) + 1} (${posts.length} posts)...`);

            // Analyze batch
            const analysisResult = await analyzePostsSentiment(posts, { concurrency: 10 });
            const results = analysisResult.results || [];

            // Update posts
            for (const result of results) {
                const text = (result.content?.text || result.text || '').substring(0, 50);

                if (result.sentiment && result.sentiment !== 'neutral') {
                    await SocialPost.updateOne(
                        { _id: result._id },
                        {
                            $set: {
                                sentiment: result.sentiment,
                                sentimentScore: result.sentimentScore,
                                sentimentConfidence: result.sentimentConfidence,
                                sentimentAnalyzedAt: new Date(),
                                sentimentSource: 'vader_reanalysis'
                            }
                        }
                    );
                    updated++;
                    process.stdout.write('✅');
                } else {
                    // Even if neutral, update metadata to show it was re-analyzed
                    await SocialPost.updateOne(
                        { _id: result._id },
                        {
                            $set: {
                                sentimentAnalyzedAt: new Date(),
                                sentimentSource: 'vader_reanalysis'
                            }
                        }
                    );
                    process.stdout.write('⚪');
                }
            }

            processed += posts.length;
            console.log(`\n📈 Progress: ${processed}/${totalPosts} (Updated: ${updated})`);
        }

        console.log('\n🎉 Re-analysis complete!');
        console.log(`Total processed: ${processed}`);
        console.log(`Total updated (non-neutral): ${updated}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

reanalyzeSentiment();
