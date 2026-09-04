import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  GetNewsQueryParams,
  GetNewsResponse,
  GetTrendingNewsResponse,
  SummarizeNewsBody,
  SummarizeNewsResponse,
} from "@workspace/api-zod";

type NewsCategory = "kenya" | "world" | "business" | "sport" | "culture" | "technology";

type NewsArticle = {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: NewsCategory;
  imageUrl: string | null;
  author?: string | null;
  isFeatured?: boolean;
  readingTime?: number;
};

type FeedDefinition = {
  url: string;
  source: string;
  category: NewsCategory;
};

type CachedFeed = {
  articles: NewsArticle[];
  refreshedAt: number;
};

const FEEDS: FeedDefinition[] = [
  { url: "https://www.capitalfm.co.ke/news/feed/", source: "Capital FM Kenya", category: "kenya" },
  { url: "https://www.kbc.co.ke/feed/", source: "KBC Kenya", category: "kenya" },
  { url: "https://www.standardmedia.co.ke/rss/headlines.php", source: "The Standard Kenya", category: "kenya" },
  { url: "https://nation.africa/kenya/rss.xml", source: "Nation Africa", category: "kenya" },
  { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", source: "BBC Africa", category: "world" },
  { url: "https://feeds.bbci.co.uk/news/rss.xml", source: "BBC News", category: "world" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC Business", category: "business" },
  { url: "https://feeds.bbci.co.uk/sport/rss.xml", source: "BBC Sport", category: "sport" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", source: "BBC Technology", category: "technology" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera", category: "world" },
  { url: "https://techcrunch.com/feed/", source: "TechCrunch", category: "technology" },
  { url: "https://www.espn.com/espn/rss/news", source: "ESPN", category: "sport" },
];

const CACHE_TTL_MS = 240_000;
const REFRESH_INTERVAL_MS = 300_000;
let feedCache: CachedFeed | null = null;
let refreshPromise: Promise<NewsArticle[]> | null = null;

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripMarkup(value: string) {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function firstAttribute(block: string, tag: string, attribute: string) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function extractImage(block: string) {
  const candidates = [
    firstAttribute(block, "media:content", "url"),
    firstAttribute(block, "media:thumbnail", "url"),
    firstAttribute(block, "enclosure", "url"),
    firstAttribute(block, "image", "href"),
  ];
  const inlineImage = block.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] ?? "";
  candidates.push(inlineImage);
  return candidates.find((candidate) => /^https?:\/\//i.test(candidate)) ?? null;
}

function inferCategory(title: string, excerpt: string, fallback: NewsCategory): NewsCategory {
  const text = `${title} ${excerpt}`.toLowerCase();
  if (/\b(kenya|nairobi|mombasa|kisumu|nakuru|eldoret|ruto|kenyan|mpesa|m-pesa)\b/.test(text)) return "kenya";
  if (/\b(stock|market|business|economy|trade|company|finance|bank)\b/.test(text)) return "business";
  if (/\b(football|soccer|sport|cricket|rugby|tennis|olympic|league)\b/.test(text)) return "sport";
  if (/\b(film|music|art|culture|book|fashion|celebrity)\b/.test(text)) return "culture";
  if (/\b(technology|tech|ai|software|startup|cyber|robot)\b/.test(text)) return "technology";
  return fallback;
}

function parseFeed(xml: string, feed: FeedDefinition): NewsArticle[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((match) => match[0]);
  return blocks.slice(0, 30).flatMap((block) => {
    const title = stripMarkup(firstTag(block, "title"));
    const sourceUrl = firstTag(block, "link") || firstAttribute(block, "link", "href");
    const description = stripMarkup(firstTag(block, "description") || firstTag(block, "summary") || firstTag(block, "content"));
    const publishedAt = firstTag(block, "pubDate") || firstTag(block, "published") || firstTag(block, "updated");
    const timestamp = Date.parse(publishedAt);
    if (!title || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return [];
    const excerpt = description.length > 220 ? `${description.slice(0, 217).trim()}…` : description;
    const id = createHash("sha1").update(`${feed.source}:${sourceUrl}`).digest("hex").slice(0, 14);
    const category = inferCategory(title, excerpt, feed.category);
    return [{
      id,
      title,
      excerpt: excerpt || "Read the latest reporting from the original publisher.",
      source: feed.source,
      sourceUrl,
      publishedAt: Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString(),
      category,
      imageUrl: extractImage(block),
      author: stripMarkup(firstTag(block, "dc:creator") || firstTag(block, "author")) || null,
      readingTime: Math.max(2, Math.min(9, Math.round((title.length + excerpt.length) / 140))),
    }];
  });
}

async function fetchFeed(feed: FeedDefinition) {
  const response = await fetch(feed.url, {
    headers: { "user-agent": "TukoNews/1.0 (+https://tuko.news)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${feed.source} returned ${response.status}`);
  return parseFeed(await response.text(), feed);
}

async function refreshArticles() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = Promise.allSettled(FEEDS.map(fetchFeed))
    .then((results) => results.flatMap((result) => result.status === "fulfilled" ? result.value : []))
    .then(async (articles) => {
      const seenUrls = new Set<string>();
      const seenTitles = new Set<string>();
      const unique = articles.filter((article) => {
        const titleKey = article.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 12).join(" ");
        if (seenUrls.has(article.sourceUrl) || seenTitles.has(titleKey)) return false;
        seenUrls.add(article.sourceUrl);
        seenTitles.add(titleKey);
        return true;
      })
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      const availableImages = unique
        .map((article) => article.imageUrl)
        .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
      const fallbackImages = [...new Set(availableImages)].slice(0, 2);
      const filled = unique.map((article, index) => ({
        ...article,
        imageUrl: article.imageUrl ?? (fallbackImages.length ? fallbackImages[index % fallbackImages.length] : null),
      }));
      const curated = await curateArticles(filled);
      feedCache = { articles: curated, refreshedAt: Date.now() };
      return curated;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function deterministicNewsOrder(articles: NewsArticle[]) {
  return [...articles].sort((a, b) => {
    const kenyaPriority = Number(b.category === "kenya") - Number(a.category === "kenya");
    if (kenyaPriority) return kenyaPriority;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

async function curateArticles(articles: NewsArticle[]) {
  const fallback = deterministicNewsOrder(articles);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || articles.length < 2) return fallback;

  const candidateData = articles.map((article) => ({
    id: article.id,
    title: article.title,
    excerpt: article.excerpt,
    source: article.source,
    category: article.category,
    publishedAt: article.publishedAt,
  }));
  const prompt = [
    "You are the Tuko News editorial desk. Curate the supplied real RSS items; do not write, rewrite, or invent any news.",
    "Return JSON only in exactly this shape: {\"orderedIds\":[\"id-1\",\"id-2\"]}.",
    "Use only IDs from the supplied list, include each ID at most once, and include every ID.",
    "Put genuinely Kenyan stories first, then other East African stories, then the wider world.",
    "Within each group, prefer the newest items and the strongest mix of politics, public life, business, sport, culture, and technology.",
    "When two items report the same event or are near-duplicate headlines, keep the clearer/newer item first and put the other later.",
    "Never add facts, sources, URLs, headlines, or IDs that are not supplied.",
    JSON.stringify(candidateData),
  ].join("\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) throw new Error(`Gemini curation returned ${response.status}`);
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const parsed = text ? JSON.parse(text) as { orderedIds?: unknown } : null;
    const orderedIds = Array.isArray(parsed?.orderedIds)
      ? parsed.orderedIds.filter((id): id is string => typeof id === "string")
      : [];
    const byId = new Map(articles.map((article) => [article.id, article]));
    const ordered = [...new Set(orderedIds)].flatMap((id) => {
      const article = byId.get(id);
      return article ? [article] : [];
    });
    const selected = new Set(ordered.map((article) => article.id));
    return [...ordered, ...fallback.filter((article) => !selected.has(article.id))];
  } catch (error) {
    console.warn("AI curation unavailable; using deterministic Kenya-first ordering", error);
    return fallback;
  }
}

async function getArticles() {
  if (feedCache && Date.now() - feedCache.refreshedAt < CACHE_TTL_MS) return feedCache.articles;
  return refreshArticles();
}

function isNewsCategory(value: string): value is NewsCategory {
  return ["kenya", "world", "business", "sport", "culture", "technology"].includes(value);
}

async function generateSummary(title: string, excerpt: string, source: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return {
    summary: `${excerpt} Read the full report from ${source} for the latest verified details.`,
    generatedBy: "Tuko editorial summary",
  };

  const prompt = [
    "Summarize this news item in 2 concise sentences for a general reader.",
    "Do not add facts that are not present. Keep names and uncertainty accurate.",
    `Publisher: ${source}`,
    `Headline: ${title}`,
    `Excerpt: ${excerpt}`,
  ].join("\n");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const summary = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!summary) throw new Error("Gemini returned no summary");
  return { summary, generatedBy: "Google Gemini" };
}

const router: IRouter = Router();

router.get("/news", async (req, res) => {
  try {
    const params = GetNewsQueryParams.parse(req.query);
    const articles = await getArticles();
    const filtered = params.category === "all"
      ? articles
      : articles.filter((article) => article.category === params.category);
    const payload = {
      articles: filtered.slice(0, params.limit),
      refreshedAt: new Date(feedCache?.refreshedAt ?? Date.now()).toISOString(),
      nextRefreshInSeconds: Math.max(0, Math.ceil(((feedCache?.refreshedAt ?? Date.now()) + REFRESH_INTERVAL_MS - Date.now()) / 1000)),
    };
    res.json(GetNewsResponse.parse(payload));
  } catch (error) {
    req.log.error({ err: error }, "Unable to load live news");
    res.status(502).json({ error: "Live publishers could not be reached. Please try again shortly." });
  }
});

router.get("/news/trending", async (req, res) => {
  try {
    const articles = await getArticles();
    res.json(GetTrendingNewsResponse.parse(articles.filter((article) => article.imageUrl).slice(0, 5)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to load trending news");
    res.status(502).json({ error: "Trending stories are temporarily unavailable." });
  }
});

router.post("/news/summary", async (req, res) => {
  try {
    const body = SummarizeNewsBody.parse(req.body);
    const result = await generateSummary(body.title, body.excerpt, body.source);
    res.json(SummarizeNewsResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Unable to summarize article");
    res.status(502).json({ error: "AI summary is temporarily unavailable. The original publisher remains available." });
  }
});

export default router;