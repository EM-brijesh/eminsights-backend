import axios from "axios";
import { FacebookPage } from "../models/facebookPage.js";
import { SocialPost } from "../models/data.js";
import { Brand } from "../models/brand.js";

const FB_GRAPH_URL = "https://graph.facebook.com/v24.0";

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;

// 🔥 Always trim to avoid hidden newline/whitespace bugs
//const META_USER_TOKEN = process.env.META_USER_TOKEN?.trim();
const META_USER_TOKEN="EAAMYUDyIZAZCsBQykmXszZAN42VzcAWwIOlZCT0xebPqUp16y9qZBKcarfNb64ZAOVTUJxdvF0ZCdP2FzRfZAufm0zRxqQ8Hs90WMJTwSWYBOP9XamMSR2LIwQE2s3z6JeJNlupAtPbZBtN6UpFOXRs2T5rjF0lYuqiJkRwvAltRIf3BSPlgR6enj8OZBaH69x";


console.log("===== META CONFIG DEBUG =====");
console.log("App ID exists:", !!META_APP_ID);
console.log("App Secret exists:", !!META_APP_SECRET);
console.log("User Token exists:", !!META_USER_TOKEN);
console.log("User Token length:", META_USER_TOKEN?.length);
console.log("User Token preview:", META_USER_TOKEN?.slice(0, 25));
console.log("Graph URL:", FB_GRAPH_URL);
console.log("=============================");

export const fetchFacebookPublicPosts = async () => {
    try {
        const pages = await FacebookPage.find({ isActive: true });
        const brands = await Brand.find({ active: true });

        console.log("Active Pages:", pages.length);
        console.log("Active Brands:", brands.length);

        if (!pages.length || !brands.length) {
            console.log("No active pages or brands found.");
            return 0;
        }

        let totalSaved = 0;

        for (const page of pages) {
            const saved = await fetchPostsForPublicPage(page, brands);
            totalSaved += saved;
        }

        console.log(`✅ Total Facebook posts saved: ${totalSaved}`);
        return totalSaved;

    } catch (error) {
        console.error("❌ Facebook Fetch Job Failed:", error.message);
        return 0;
    }
};

/* =====================================================
   FETCH POSTS FOR ONE PAGE
===================================================== */

const fetchPostsForPublicPage = async (page, brands) => {
    try {
        const url = `${FB_GRAPH_URL}/${page.pageId}/posts`;

        console.log("\n==============================");
        console.log("Fetching page:", page.pageName);
        console.log("Page ID:", page.pageId);
        console.log("Request URL:", url);
        console.log("Using Token Length:", META_USER_TOKEN?.length);
        console.log("==============================");

        const params = {
            fields:
                "id,message,created_time,permalink_url,reactions.summary(true),comments.summary(true),shares",
            access_token: META_USER_TOKEN,
            limit: 25,
        };

        const response = await axios.get(url, { params });

        console.log("Response status:", response.status);

        const posts = response.data?.data || [];

        console.log("Posts fetched:", posts.length);

        if (!posts.length) {
            console.log(`No posts found for page: ${page.pageName}`);
            return 0;
        }

        let savedCount = 0;

        for (const post of posts) {
            if (!post.message) continue;

            const message = post.message.toLowerCase().trim();
            if (!message) continue;

            for (const brand of brands) {
                for (const group of brand.keywordGroups) {

                    if (
                        group.paused ||
                        group.status !== "running" ||
                        !group.platforms.includes("facebook")
                    ) {
                        continue;
                    }

                    const containsKeyword = (keywords) =>
                        keywords.some((kw) =>
                            message.includes(kw.toLowerCase().trim())
                        );

                    if (!containsKeyword(group.keywords)) {
                        continue;
                    }

                    try {
                        await SocialPost.create({
                            externalId: post.id,
                            brand: brand._id,
                            keyword: group.name || group.groupName || "facebook",
                            platform: "facebook",
                            groupId: page._id,
                            groupName: page.pageName,
                            createdAt: new Date(post.created_time),
                            author: {
                                id: page.pageId,
                                name: page.pageName,
                            },
                            content: {
                                text: post.message,
                            },
                            metrics: {
                                likes: post.reactions?.summary?.total_count || 0,
                                comments: post.comments?.summary?.total_count || 0,
                                shares: post.shares?.count || 0,
                            },
                            sourceUrl: post.permalink_url,
                            fetchedAt: new Date(),
                        });

                        savedCount++;

                    } catch (err) {
                        if (err.code !== 11000) {
                            console.error("Save error:", err.message);
                        }
                    }
                }
            }
        }

        page.lastFetchedAt = new Date();
        await page.save();

        console.log(`✅ Saved ${savedCount} posts from ${page.pageName}`);
        return savedCount;

    } catch (error) {
        console.error("❌ FULL ERROR OBJECT:");
        console.error(error.response?.data || error.message);
        console.error("Status Code:", error.response?.status);
        console.error("Headers:", error.response?.headers);
        return 0;
    }
};