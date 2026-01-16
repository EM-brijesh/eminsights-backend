import dotenv from 'dotenv';
import { analyzePostsSentiment } from './services/sentiment.service.js';

dotenv.config();

// Sample posts (like what you'd scrape from social media)
const testPosts = [
    {
        _id: 'test1',
        content: {
            text: 'बिहार में ₹50,000 करोड़ घोटाला वाला दावा दरअसल एक राजनीतिक ड्रामा है, सच्चाई नहीं। अडानी पावर ने ये प्रोजेक्ट केंद्रीय सरकार के DEEP पोर्टल पर खुले रिवर्स ऑक्शन से जीता था'
        },
        platform: 'twitter',
        keyword: 'test',
        brandName: 'TestBrand'
    },
    {
        _id: 'test2',
        content: {
            text: 'The power of your one vote to a corrupt Narendra Modi helped Adani grow from $5 billion to $85 billion. Meanwhile, Narendra Modi pushed 80+ crore Indians to survive on just 5 kg of ration.'
        },
        platform: 'reddit',
        keyword: 'test',
        brandName: 'TestBrand'
    },
    {
        _id: 'test3',
        content: {
            text: 'Great product! Really happy with the quality and fast delivery. Highly recommend! 🎉'
        },
        platform: 'facebook',
        keyword: 'test',
        brandName: 'TestBrand'
    },
    {
        _id: 'test4',
        content: {
            text: 'बहुत अच्छा प्रोडक्ट है! Quality बहुत बढ़िया है और delivery भी fast थी। Highly recommended!'
        },
        platform: 'twitter',
        keyword: 'test',
        brandName: 'TestBrand'
    }
];

async function testSentimentAnalysis() {
    console.log('🧪 Testing Sentiment Analysis Locally (No Database)\n');
    console.log('='.repeat(80));
    console.log('This test will analyze posts WITHOUT writing to the database');
    console.log('Safe to run - will not affect production data!');
    console.log('='.repeat(80));
    console.log('\n📊 Analyzing posts...\n');

    try {
        const startTime = Date.now();
        const result = await analyzePostsSentiment(testPosts);
        const duration = Date.now() - startTime;

        console.log('✅ Analysis Complete!\n');
        console.log('='.repeat(80));
        console.log('RESULTS:');
        console.log('='.repeat(80));

        result.results.forEach((post, i) => {
            const text = post.content.text;
            const preview = text.length > 60 ? text.substring(0, 60) + '...' : text;

            console.log(`\n📝 Post ${i + 1}:`);
            console.log(`   Platform: ${post.platform}`);
            console.log(`   Text: "${preview}"`);
            console.log(`   Sentiment: ${post.sentiment?.toUpperCase() || 'N/A'}`);
            console.log(`   Score: ${post.sentimentScore?.toFixed(3) || 'N/A'}`);
            console.log(`   Confidence: ${post.sentimentConfidence?.toFixed(3) || 'N/A'}`);
            console.log(`   Source: ${post.sentimentSource || 'N/A'}`);
        });

        console.log('\n' + '='.repeat(80));
        console.log('📈 SUMMARY:');
        console.log('='.repeat(80));
        console.log(`   Total Posts: ${result.total}`);
        console.log(`   Successful: ${result.successful}`);
        console.log(`   Failed: ${result.failed}`);
        console.log(`   Success Rate: ${result.successRate?.toFixed(1)}%`);
        console.log(`   Duration: ${duration}ms`);
        console.log('='.repeat(80));

        if (result.errors && result.errors.length > 0) {
            console.log('\n⚠️  ERRORS:');
            result.errors.forEach((err, i) => {
                console.log(`   ${i + 1}. ${err.error}: ${err.message}`);
            });
        }

        console.log('\n✅ Test completed successfully!');
        console.log('💡 Sentiment scores are logged above but NOT shown to users in production');

    } catch (error) {
        console.error('\n❌ Error during sentiment analysis:');
        console.error(`   ${error.message}`);
        console.error('\n🔍 Troubleshooting:');
        console.error('   1. Is Python sentiment service running? (python main.py)');
        console.error('   2. Check http://localhost:8000/health');
        console.error('   3. Verify SENTIMENT_SERVICE_URL in .env');
        process.exit(1);
    }
}

// Run the test
console.log('\n🚀 Starting Local Sentiment Analysis Test...\n');
testSentimentAnalysis();
