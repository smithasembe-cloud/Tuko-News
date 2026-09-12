import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  GetNewsQueryParams,
  GetNewsResponse,
  GetTrendingNewsResponse,
  SummarizeNewsBody,
  SummarizeNewsResponse,
} from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { db, newsArticlesTable, type NewsArticleRecord } from "@workspace/db";

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
  videoUrl: string | null;
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
  { url: "https://www.citizen.digital/feed.xml", source: "Citizen Digital", category: "kenya" },
  { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", source: "BBC Africa", category: "world" },
  { url: "https://feeds.bbci.co.uk/news/rss.xml", source: "BBC News", category: "world" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC Business", category: "business" },
  { url: "https://feeds.bbci.co.uk/sport/rss.xml", source: "BBC Sport", category: "sport" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", source: "BBC Technology", category: "technology" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera", category: "world" },
  { url: "https://techcrunch.com/feed/", source: "TechCrunch", category: "technology" },
  { url: "https://www.espn.com/espn/rss/news", source: "ESPN", category: "sport" },
];

const EDITION_INTERVAL_MS = 3_600_000;
const CURRENT_EDITION_VERSION = 2;
let feedCache: CachedFeed | null = null;
let refreshPromise: Promise<NewsArticle[]> | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

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

function extractVideo(block: string) {
  const videoTag = block.match(/<(?:media:content|enclosure|video|source)\b[^>]*(?:type=["'][^"']*video[^"']*["']|url=["'][^"']+\.(?:mp4|webm|m3u8)(?:\?[^"']*)?["']|src=["'][^"']+\.(?:mp4|webm|m3u8)(?:\?[^"']*)?["'])[^>]*>/i)?.[0] ?? "";
  const candidates = [
    firstAttribute(videoTag, "media:content", "url"),
    firstAttribute(videoTag, "enclosure", "url"),
    firstAttribute(videoTag, "video", "src"),
    firstAttribute(videoTag, "source", "src"),
    videoTag.match(/\b(?:url|src)=["']([^"']+)["']/i)?.[1] ?? "",
  ];
  return candidates.find((candidate) => /^https?:\/\//i.test(candidate)) ?? null;
}

function extractMetaContent(html: string, names: string[]) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!name || !names.includes(name)) continue;
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1] ?? "";
    if (/^https?:\/\//i.test(content)) return decodeXml(content);
  }
  return null;
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
  return blocks.slice(0, 50).flatMap((block) => {
    const title = stripMarkup(firstTag(block, "title"));
    const sourceUrl = firstTag(block, "link") || firstAttribute(block, "link", "href");
    const description = stripMarkup(firstTag(block, "description") || firstTag(block, "summary") || firstTag(block, "content"));
    const publishedAt = firstTag(block, "pubDate") || firstTag(block, "published") || firstTag(block, "updated");
    const timestamp = Date.parse(publishedAt);
    if (!title || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return [];
    const excerpt = description.length > 680 ? `${description.slice(0, 677).trim()}…` : description;
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
      videoUrl: extractVideo(block),
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

async function enrichArticleMedia(articles: NewsArticle[]) {
  const targets = articles.filter((article) => !article.imageUrl || !article.videoUrl).slice(0, 180);
  const enriched = new Map<string, NewsArticle>();
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < targets.length) {
      const article = targets[nextIndex++];
      try {
        const response = await fetch(article.sourceUrl, {
          headers: { "user-agent": "GEN5minutesNews/1.0" },
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) continue;
        const html = (await response.text()).slice(0, 250_000);
        enriched.set(article.id, {
          ...article,
          imageUrl: article.imageUrl ?? extractMetaContent(html, ["og:image", "twitter:image"]),
          videoUrl: article.videoUrl ?? extractMetaContent(html, ["og:video", "og:video:url", "twitter:player:stream"]),
        });
      } catch {
        // Keep the real RSS item even when its publisher page is unavailable.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, targets.length) }, () => worker()));
  return articles.map((article) => enriched.get(article.id) ?? article);
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
      const enriched = await enrichArticleMedia(unique);
      const curated = await curateArticles(enriched);
      const editionStartedAt = Date.now();
      await replaceStoredEdition(curated, editionStartedAt);
      feedCache = { articles: curated, refreshedAt: editionStartedAt };
      return curated;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function recordToArticle(record: NewsArticleRecord): NewsArticle {
  return {
    id: record.id,
    title: record.title,
    excerpt: record.excerpt,
    source: record.source,
    sourceUrl: record.sourceUrl,
    publishedAt: record.publishedAt.toISOString(),
    category: record.category as NewsCategory,
    imageUrl: record.imageUrl,
    videoUrl: record.videoUrl,
    author: record.author,
    isFeatured: record.isFeatured,
    readingTime: record.readingTime ?? undefined,
  };
}

async function loadStoredEdition(): Promise<CachedFeed | null> {
  const [latest] = await db
    .select({ editionStartedAt: newsArticlesTable.editionStartedAt, editionVersion: newsArticlesTable.editionVersion })
    .from(newsArticlesTable)
    .orderBy(desc(newsArticlesTable.editionStartedAt))
    .limit(1);
  if (!latest || latest.editionVersion !== CURRENT_EDITION_VERSION || Date.now() - latest.editionStartedAt.getTime() >= EDITION_INTERVAL_MS) return null;
  const records = await db
    .select()
    .from(newsArticlesTable)
    .where(eq(newsArticlesTable.editionStartedAt, latest.editionStartedAt))
    .orderBy(desc(newsArticlesTable.publishedAt));
  return { articles: records.map(recordToArticle), refreshedAt: latest.editionStartedAt.getTime() };
}

async function replaceStoredEdition(articles: NewsArticle[], editionStartedAt: number) {
  const editionDate = new Date(editionStartedAt);
  await db.transaction(async (tx) => {
    await tx.delete(newsArticlesTable);
    if (articles.length === 0) return;
    await tx.insert(newsArticlesTable).values(articles.map((article) => ({
      id: article.id,
      title: article.title,
      excerpt: article.excerpt,
      source: article.source,
      sourceUrl: article.sourceUrl,
      publishedAt: new Date(article.publishedAt),
      category: article.category,
      imageUrl: article.imageUrl,
      videoUrl: article.videoUrl,
      author: article.author ?? null,
      isFeatured: article.isFeatured ?? false,
      readingTime: article.readingTime ?? null,
      editionStartedAt: editionDate,
      editionVersion: CURRENT_EDITION_VERSION,
    })));
  });
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
    "You are the GEN 5minutes News editorial desk. Curate the supplied real RSS items; do not write, rewrite, or invent any news.",
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
  if (feedCache && Date.now() - feedCache.refreshedAt < EDITION_INTERVAL_MS) return feedCache.articles;
  const storedEdition = await loadStoredEdition();
  if (storedEdition) {
    feedCache = storedEdition;
    return storedEdition.articles;
  }
  return refreshArticles();
}

function isNewsCategory(value: string): value is NewsCategory {
  return ["kenya", "world", "business", "sport", "culture", "technology"].includes(value);
}

async function generateSummary(title: string, excerpt: string, source: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return {
    summary: `${excerpt} Read the full report from ${source} for the latest verified details.`,
    generatedBy: "GEN 5minutes News editorial summary",
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
      nextRefreshInSeconds: Math.max(0, Math.ceil(((feedCache?.refreshedAt ?? Date.now()) + EDITION_INTERVAL_MS - Date.now()) / 1000)),
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

async function startNewsEditionScheduler() {
  try {
    const storedEdition = await loadStoredEdition();
    if (storedEdition) feedCache = storedEdition;
    else await refreshArticles();
  } catch (error) {
    console.error("Unable to initialize news edition", error);
  }
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      void refreshArticles().catch((error) => console.error("Unable to refresh news edition", error));
    }, EDITION_INTERVAL_MS);
    refreshTimer.unref?.();
  }
}

void startNewsEditionScheduler();