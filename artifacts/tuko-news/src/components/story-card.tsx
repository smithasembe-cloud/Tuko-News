import { ArrowUpRight, Bookmark, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import type { NewsArticle } from '@workspace/api-client-react';

const categoryLabels: Record<NewsArticle['category'], string> = {
  kenya: 'Kenya', world: 'World', business: 'Business', sport: 'Sport', culture: 'Culture', technology: 'Technology',
};

export function formatTime(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

export function isSaved(id: string) {
  try { return JSON.parse(localStorage.getItem('tuko-saved') || '[]').includes(id); } catch { return false; }
}

export function toggleSaved(id: string) {
  try {
    const saved: string[] = JSON.parse(localStorage.getItem('tuko-saved') || '[]');
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id];
    localStorage.setItem('tuko-saved', JSON.stringify(next));
    window.dispatchEvent(new Event('tuko-saved-change'));
    return next.includes(id);
  } catch { return false; }
}

export function StoryImage({ article, className = '' }: { article: NewsArticle; className?: string }) {
  const [failed, setFailed] = useState(!article.imageUrl);
  useEffect(() => setFailed(!article.imageUrl), [article.imageUrl]);
  if (failed || !article.imageUrl) return <div className={`image-placeholder h-full w-full ${className}`} aria-label="Editorial image unavailable" />;
  return <img src={article.imageUrl} alt="" onError={() => setFailed(true)} className={`story-image h-full w-full object-cover ${className}`} />;
}

export function StoryMeta({ article, light = false }: { article: NewsArticle; light?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[.68rem] ${light ? 'text-[hsl(var(--background)/.68)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
      <span className="eyebrow">{categoryLabels[article.category]}</span>
      <span className="h-1 w-1 rounded-full bg-current opacity-40" />
      <span>{article.source}</span>
      <span className="h-1 w-1 rounded-full bg-current opacity-40" />
      <span>{formatTime(article.publishedAt)}</span>
    </div>
  );
}

export function StoryCard({ article, compact = false, index = 0 }: { article: NewsArticle; compact?: boolean; index?: number }) {
  const [saved, setSaved] = useState(() => isSaved(article.id));
  const saveStory = () => setSaved(toggleSaved(article.id));
  return (
    <article className={`story-card reveal reveal-${Math.min(index + 1, 4)} group relative overflow-hidden rounded-[1.1rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] ${compact ? 'flex gap-4 p-3' : ''}`} data-testid={`card-story-${article.id}`}>
      <Link href={`/article/${article.id}`} className={compact ? 'contents' : 'block'} data-testid={`link-story-${article.id}`}>
        <div className={compact ? 'h-24 w-28 shrink-0 overflow-hidden rounded-lg' : 'relative aspect-[4/3] overflow-hidden'}>
          <StoryImage article={article} />
          {article.videoUrl && <span className="video-badge absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[.65rem] font-bold"><Play size={11} fill="currentColor" /> Video</span>}
        </div>
        <div className={compact ? 'min-w-0 py-0.5' : 'p-5'}>
          <StoryMeta article={article} />
          <h3 className={`mt-2 font-serif leading-[1.02] text-[hsl(var(--foreground))] transition-colors group-hover:text-[hsl(var(--primary))] ${compact ? 'line-clamp-3 text-[1.2rem]' : 'text-[1.6rem] sm:text-[1.8rem]'}`}>{article.title}</h3>
          {!compact && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{article.excerpt}</p>}
          <div className="mt-4 flex items-center justify-between text-[.68rem] text-[hsl(var(--muted-foreground))]">
            <span>Live report</span>
            <span className="flex items-center gap-1 font-semibold text-[hsl(var(--primary))]">Read <ArrowUpRight size={14} /></span>
          </div>
        </div>
      </Link>
      {!compact && <button type="button" onClick={saveStory} className={`absolute right-4 top-4 rounded-full p-2.5 backdrop-blur transition-colors ${saved ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card)/.82)] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]'}`} aria-label={`${saved ? 'Unsave' : 'Save'} ${article.title}`} data-testid={`button-save-${article.id}`}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /></button>}
    </article>
  );
}