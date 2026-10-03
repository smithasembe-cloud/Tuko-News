import { ArrowLeft, Bookmark, Check, Copy, ExternalLink, Play, Share2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useGetNews, useSummarizeNews } from '@workspace/api-client-react';
import { StoryCard, StoryImage, StoryMeta, formatTime, isSaved, toggleSaved } from '@/components/story-card';
import { cachePublisherImagesForOffline } from '@/components/offline-cache';
import { Seo } from '@/components/seo';
import { AdSlot } from '@/components/ad-slot';

function getVideoEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}?rel=0`;
    }
    if (parsed.hostname === 'youtube.com' || parsed.hostname.endsWith('.youtube.com')) {
      const videoId = parsed.searchParams.get('v');
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : url;
    }
    if (parsed.hostname === 'vimeo.com' || parsed.hostname.endsWith('.vimeo.com')) {
      const videoId = parsed.pathname.split('/').filter(Boolean).pop();
      return videoId ? `https://player.vimeo.com/video/${videoId}` : url;
    }
  } catch {
    return null;
  }
  return null;
}

function ArticleLoading() {
  return <main className="tuko-container py-12"><div className="skeleton h-4 w-28 rounded" /><div className="mt-7 skeleton h-20 max-w-4xl rounded" /><div className="mt-5 skeleton h-5 w-3/4 rounded" /><div className="mt-10 aspect-[2/1] skeleton rounded-2xl" /><div className="mx-auto mt-10 max-w-2xl space-y-3"><div className="skeleton h-4 rounded" /><div className="skeleton h-4 rounded" /><div className="skeleton h-4 w-4/5 rounded" /></div></main>;
}

function ArticleError() {
  return <main className="tuko-container py-24 text-center"><h1 className="font-serif text-5xl">Story not found.</h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">This report may have moved, or the live edition has changed.</p><Link href="/" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-back-home-error"><ArrowLeft size={16} /> Back to the desk</Link></main>;
}

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(() => id ? isSaved(id) : false);
  const [shared, setShared] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const feedQuery = useGetNews({ limit: 250 });
  const article = useMemo(() => feedQuery.data?.articles.find((item) => item.id === id), [feedQuery.data, id]);
  const related = useMemo(() => article ? feedQuery.data?.articles.filter((item) => item.id !== id && item.category === article.category).slice(0, 3) || [] : [], [feedQuery.data, article, id]);
  const summaryMutation = useSummarizeNews();
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: article?.title || 'Mwangaza Wire', url }); else { await navigator.clipboard.writeText(url); setShared(true); window.setTimeout(() => setShared(false), 2200); } } catch { /* share dialog dismissed */ }
  };
  useEffect(() => { setSaved(id ? isSaved(id) : false); }, [id]);
  useEffect(() => {
    if (article?.imageUrl) cachePublisherImagesForOffline([article.imageUrl]);
  }, [article?.imageUrl]);
  if (feedQuery.isLoading) return <ArticleLoading />;
  if (feedQuery.isError || !article) return <ArticleError />;
  const handleSave = () => setSaved(toggleSaved(article.id));
  const generateSummary = () => { setSummaryError(false); summaryMutation.mutate({ data: { title: article.title, excerpt: article.excerpt, source: article.source } }, { onError: () => setSummaryError(true) }); };
  return (
    <main className="tuko-container pb-16 pt-8 md:pt-12">
      <Seo title={`${article.title} | Mwangaza Wire`} description={article.excerpt} path={`/article/${article.id}`} type="article" />
      <div className="flex items-center justify-between"><button type="button" onClick={() => {
        let destination = '/';
        let scrollY = 0;
        try {
          const storedOrigin = sessionStorage.getItem(`mwangaza-story-origin:${id}`);
          if (storedOrigin) {
            const origin = JSON.parse(storedOrigin) as { location?: unknown; scrollY?: unknown };
            if (typeof origin.location === 'string' && origin.location.startsWith('/') && !origin.location.startsWith('//')) {
              destination = origin.location;
              if (typeof origin.scrollY === 'number' && Number.isFinite(origin.scrollY)) scrollY = Math.max(0, origin.scrollY);
            }
          }
          sessionStorage.removeItem(`mwangaza-story-origin:${id}`);
        } catch { /* use edition */ }
        setLocation(destination);
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
      }} className="inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]" data-testid="button-back-to-feed"><ArrowLeft size={17} /> Back to edition</button><span className="eyebrow text-[hsl(var(--primary))]">Mwangaza News Brief</span></div>
      <article className="mx-auto mt-9 max-w-[1080px]">
        <div className="max-w-4xl reveal"><StoryMeta article={article} /><h1 className="mt-5 font-serif text-[clamp(3rem,7vw,6.8rem)] leading-[.86] tracking-[-.045em] text-balance">{article.title}</h1></div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-[hsl(var(--border))] py-4 reveal reveal-1">{article.author && <p className="text-xs text-[hsl(var(--muted-foreground))]">By <strong className="text-[hsl(var(--foreground))]">{article.author}</strong></p>}<div className="flex items-center gap-2"><button type="button" onClick={handleSave} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-all ${saved ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]'}`} data-testid="button-save-article">{saved ? <Check size={14} /> : <Bookmark size={14} />}{saved ? 'Saved' : 'Save story'}</button><button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-3.5 py-2 text-xs font-bold transition-all hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]" data-testid="button-share-article">{shared ? <Check size={14} /> : <Copy size={14} />}{shared ? 'Copied' : 'Share'}</button></div></div>
          <div className="media-stage mt-8 overflow-hidden rounded-[1.2rem] reveal reveal-2">{article.videoUrl ? (() => { const embedUrl = getVideoEmbedUrl(article.videoUrl); return <div className="relative aspect-video h-full">{embedUrl ? <iframe className="h-full w-full" src={embedUrl} title={`Publisher video for ${article.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <video className="media-video" controls playsInline preload="metadata" poster={article.imageUrl ?? undefined}><source src={article.videoUrl} /></video>}<span className="video-badge absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold"><Play size={13} fill="currentColor" /> Publisher video</span></div>; })() : <div className="aspect-[16/8]"><StoryImage article={article} eager /></div>}</div>
        <div className="mx-auto mt-10 grid max-w-4xl gap-10 lg:grid-cols-[1fr_275px]">
          <div>
              <div className="prose reading-copy prose-lg max-w-none prose-p:font-serif prose-p:text-[1.28rem] prose-p:leading-[1.55] prose-p:text-[hsl(var(--foreground))]"><p className="!font-sans !text-xs !font-bold !uppercase !tracking-[.14em] !text-[hsl(var(--primary))]">Publisher-provided excerpt / summary</p><p>{article.excerpt}</p><p className="!font-sans !text-sm !leading-relaxed !text-[hsl(var(--muted-foreground))]">This is the excerpt supplied by <strong>{article.source}</strong>, not the full report. Follow the publisher link to read the complete story and its original context.</p></div>
              <div className="mt-8 flex flex-wrap gap-3"><a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5" data-testid="link-original-source">Read the full story at {article.source} <ExternalLink size={15} /></a><button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-5 py-3 text-sm font-bold transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]" data-testid="button-copy-link"><Share2 size={15} /> Share this report</button></div>
              <AdSlot placement="article-inline" />
          </div>
          <aside className="h-fit rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><Sparkles size={17} /><span className="eyebrow">Reader's brief</span></div>
            {summaryMutation.data ? <><p className="mt-4 text-sm leading-relaxed">{summaryMutation.data.summary}</p><p className="mt-4 text-[.68rem] text-[hsl(var(--muted-foreground))]">Generated by {summaryMutation.data.generatedBy}</p></> : <><p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Get the essential context before you commit to the full report.</p><button type="button" onClick={generateSummary} disabled={summaryMutation.isPending} className="mt-5 w-full rounded-full border border-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))] disabled:cursor-wait disabled:opacity-60" data-testid="button-generate-summary">{summaryMutation.isPending ? 'Preparing brief…' : 'Generate a short brief'}</button>{summaryError && <p className="mt-3 text-xs text-[hsl(var(--destructive))]">The brief could not be prepared. Try again.</p>}</>}
          </aside>
        </div>
        {related.length > 0 && <section className="mt-20 border-t border-[hsl(var(--foreground))] pt-5"><div className="flex items-end justify-between"><h2 className="font-serif text-4xl">Keep reading</h2><span className="eyebrow text-[hsl(var(--muted-foreground))]">More from {article.category}</span></div><div className="mt-6 grid gap-5 sm:grid-cols-3">{related.map((item, index) => <StoryCard article={item} key={item.id} index={index} />)}</div></section>}
      </article>
    </main>
  );
}