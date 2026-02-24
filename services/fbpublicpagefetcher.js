import axios from "axios";
import { FacebookPage } from "../models/facebookPage.js";
import { SocialPost } from "../models/data.js";
import { Brand } from "../models/brand.js";

const FB_GRAPH_URL = "https://graph.facebook.com/v24.0";
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const PAGE_ACCESS_TOKEN = process.env.META_APP_PAGE_TOKEN;

const APP_ACCESS_TOKEN = `${META_APP_ID}|${META_APP_SECRET}`;

export const fetchFacebookPublicPosts = async () => {
    try {
        const pages = await FacebookPage.find({ isActive: true });
        const brands = await Brand.find({ active: true });

        if (!pages.length || !brands.length) {
            console.log("No active pages or brands found.");
            return 0;
        }

        let totalSaved = 0;

        for (const page of pages) {
            const saved = await fetchPostsForPublicPage(page, brands);
            totalSaved += saved;
        }

        console.log(`Total Facebook posts saved: ${totalSaved}`);
        return totalSaved;

    } catch (error) {
        console.error("Facebook Fetch Job Failed:", error.message);
        return 0;
    }
};

/* =====================================================
   FETCH POSTS FOR ONE PAGE
===================================================== */

const fetchPostsForPublicPage = async (page, brands) => {
    try {
        const url = `${FB_GRAPH_URL}/${page.pageId}/posts`;

        const params = {
            fields:
                "id,message,created_time,permalink_url,reactions.summary(true),comments.summary(true),shares",
            access_token: PAGE_ACCESS_TOKEN,
            limit: 25,
        };

        const response = await axios.get(url, { params });
        const posts = response.data?.data || [];

        if (!posts.length) {
            console.log(`No posts found for page: ${page.pageName}`);
            return 0;
        }

        let savedCount = 0;

        for (const post of posts) {
            if (!post.message) continue;

            const message = post.message.toLowerCase();

            for (const brand of brands) {
                for (const group of brand.keywordGroups) {

                    // 🚨 Skip invalid groups
                    if (
                        group.paused ||
                        group.status !== "running" ||
                        !group.platforms.includes("facebook")
                    ) {
                        continue;
                    }

                    /* ===============================
                       KEYWORD MATCHING LOGIC
                    =============================== */

                    const message = post.message?.toLowerCase().trim();
                    if (!message) continue;

                    // 🔥 Simple keyword containment logic
                    const containsKeyword = (keywords) =>
                        keywords.some((kw) =>
                            message.includes(kw.toLowerCase().trim())
                        );

                    // Skip if group not valid
                    if (
                        group.paused ||
                        group.status !== "running" ||
                        !group.platforms.includes("facebook")
                    ) {
                        continue;
                    }

                    // ✅ Save if ANY keyword matches
                    if (!containsKeyword(group.keywords)) {
                        continue;
                    }

                    /* ===============================
                       SAVE POST (WITH DUP CHECK)
                    =============================== */

                    try {
                        await SocialPost.create({
                            externalId: post.id, // ⚠️ make this unique in schema

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
                        // Duplicate error (unique index)
                        if (err.code !== 11000) {
                            console.error("Save error:", err.message);
                        }
                    }
                }
            }
        }

        page.lastFetchedAt = new Date();
        await page.save();

        console.log(`Saved ${savedCount} posts from ${page.pageName}`);
        return savedCount;

    } catch (error) {
        console.error(
            `Error fetching page ${page.pageName}:`,
            error.response?.data || error.message
        );
        return 0;
    }
};