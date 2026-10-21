import { rm, writeFile } from "node:fs/promises";

const outputDirectory = new URL("../dist/public/", import.meta.url);
const sitemapPath = new URL("sitemap.xml", outputDirectory);
const robotsPath = new URL("robots.txt", outputDirectory);
const configuredHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.SITE_URL;

if (!configuredHost) {
  await rm(sitemapPath, { force: true });
  await writeFile(robotsPath, "User-agent: *\nAllow: /\n");
  process.exit(0);
}

const siteUrl = new URL(
  configuredHost.includes("://") ? configuredHost : `https://${configuredHost}`,
).origin;

const pages = [
  ["/", "1.0"],
  ["/?category=kenya", "0.9"],
  ["/?category=business", "0.8"],
  ["/?category=sport", "0.8"],
  ["/?category=technology", "0.8"],
  ["/?category=culture", "0.8"],
  ["/?category=world", "0.8"],
  ["/?category=videos", "0.7"],
];

const urls = pages
  .map(
    ([path, priority]) =>
      `  <url>\n    <loc>${new URL(path, siteUrl).toString()}</loc>\n    <changefreq>hourly</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
  )
  .join("\n");

await writeFile(
  sitemapPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
await writeFile(
  robotsPath,
  `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`,
);
