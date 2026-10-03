import type { NewsArticle, NewsFeed } from '@workspace/api-client-react';

type OfflineCacheMessage =
  | { type: 'CACHE_NEWS_EDITION'; edition: NewsFeed; imageUrls: string[] }
  | { type: 'CACHE_PUBLISHER_IMAGES'; imageUrls: string[] };

function sendToServiceWorker(message: OfflineCacheMessage) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage(message))
    .catch(() => {
      // The normal online experience still works when offline caching is unavailable.
    });
}

export function cacheEditionForOffline(feed: NewsFeed) {
  const imageUrls = feed.articles
    .slice(0, 12)
    .map((article: NewsArticle) => article.imageUrl)
    .filter((url): url is string => Boolean(url));

  sendToServiceWorker({ type: 'CACHE_NEWS_EDITION', edition: feed, imageUrls });
}

export function cachePublisherImagesForOffline(imageUrls: string[]) {
  if (imageUrls.length) sendToServiceWorker({ type: 'CACHE_PUBLISHER_IMAGES', imageUrls });
}