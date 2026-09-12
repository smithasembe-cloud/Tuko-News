import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const newsArticlesTable = pgTable("news_articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  author: text("author"),
  isFeatured: boolean("is_featured").notNull().default(false),
  readingTime: integer("reading_time"),
  editionStartedAt: timestamp("edition_started_at", { withTimezone: true }).notNull(),
});

export const insertNewsArticleSchema = createInsertSchema(newsArticlesTable).omit({ id: true });
export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;
export type NewsArticleRecord = typeof newsArticlesTable.$inferSelect;