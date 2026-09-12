import { ArrowDown, ArrowUpRight, Bookmark, ChevronRight, RefreshCw, Rss, SearchX, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { getGetNewsQueryKey, getGetTrendingNewsQueryKey, useGetNews, useGetTrendingNews, type NewsArticle, type GetNewsParams } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { StoryCard, StoryImage, StoryMeta, formatTime, isSaved, toggleSaved } from '@/components/story-card';
import { Seo } from '@/components/seo';

function SkeletonHome() {
  return <main className="tuko-container py-10"><div className="skeleton h-5 w-32 rounded" /><div className="mt-6 grid gap-5 md:grid-cols-[1.35fr_.65fr]"><div className="skeleton h-[390px] rounded-2xl" /><div className="space-y-5"><div className="skeleton h-44 rounded-2xl" /><div className="skeleton h-44 rounded-2xl" /></div></div><div className="mt-12 grid gap-5 sm:grid-cols-3"><div className="skeleton h-52 rounded-2xl" /><div className="skeleton h-52 rounded-2xl" /><div className="skeleton h-52 rounded-2xl" /></div></main>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return <div className="tuko-container py-20"><div className="mx-auto max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]"><Rss size={22} /></div><h2 className="mt-5 font-serif text-3xl">The desk is quiet.</h2><p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">We couldn't reach the live feed. Try the connection once more.</p><button type="button" onClick={retry} className="mt-6 rounded-full bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="button-retry-feed">Try again</button></div></div>;
}

function EmptyState({ saved }: { saved: boolean }) {
  return <div className="border-y border-[hsl(var(--border))] py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">{saved ? <Bookmark size={21} /> : <SearchX size={21} />}</div><h2 className="mt-4 font-serif text-3xl">{saved ? 'Nothing saved yet.' : 'No stories in this edition.'}</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{saved ? 'Tap the bookmark on a story and it will wait here.' : 'Try another section or check back soon.'}</p></div>;
}

export default function Home() {
  const [location] = useLocation();
  const query = new URLSearchParams(location.split('?')[1] || '');
  const category = query.get('category') as GetNewsParams['category'] || undefined;
  const search = query.get('q')?.toLowerCase() || '';
  const savedOnly = query.get('saved') === '1';
  const queryClient = useQueryClient();
  const [savedVersion, setSavedVersion] = useState(0);
  const params = useMemo(() => ({ category: category || 'all', limit: 250 }) satisfies GetNewsParams, [category]);
  const feedQuery = useGetNews(params, {
    query: { queryKey: getGetNewsQueryKey(params), refetchInterval: 3_600_000, refetchOnWindowFocus: true },
  });
  const trendingQuery = useGetTrendingNews({
    query: { queryKey: getGetTrendingNewsQueryKey(), refetchInterval: 3_600_000, refetchOnWindowFocus: true },
  });
  useEffect(() => {
    const update = () => setSavedVersion((version) => version + 1);
    window.addEventListener('tuko-saved-change', update);
    return () => window.removeEventListener('tuko-saved-change', update);
  }, []);
  const [visibleCount, setVisibleCount] = useState(14);
  const feed = feedQuery.data;
  const filtered = useMemo(() => (feed?.articles || []).filter((article) => {
    const matchesSearch = !search || `${article.title} ${article.excerpt} ${article.source}`.toLowerCase().includes(search);
    return matchesSearch && (!savedOnly || isSaved(article.id));
  }), [feed, search, savedOnly, savedVersion]);
  useEffect(() => setVisibleCount(14), [category, search, savedOnly]);
  useEffect(() => {
    const sentinel = document.querySelector('[data-testid="feed-sentinel"]');
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + 12, filtered.length));
    }, { rootMargin: '500px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length]);
  const featured = filtered.find((article) => article.isFeatured) || filtered[0];
  const rest = filtered.filter((article) => article.id !== featured?.id);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetNewsQueryKey(params) });
    queryClient.invalidateQueries({ queryKey: getGetTrendingNewsQueryKey() });
  };
  if (feedQuery.isLoading) return <SkeletonHome />;
  if (feedQuery.isError || !feed) return <ErrorState retry={refresh} />;
  return (
    <main>
      <Seo title="GEN 5minutes News | Kenya and World News" description="Read fresh Kenyan, African, business, sport, culture, technology, and world news in the GEN 5minutes News edition." path="/" />
      <section className="tuko-container pb-12 pt-8 md:pb-20 md:pt-12">
        <div className="flex flex-col justify-between gap-4 border-b border-[hsl(var(--border))] pb-6 sm:flex-row sm:items-end">
          <div className="reveal"><p className="eyebrow text-[hsl(var(--primary))]">{new Intl.DateTimeFormat('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p><h1 className="mt-3 font-serif text-[clamp(3.3rem,8vw,7rem)] leading-[.82] tracking-[-.04em]">Stay curious<span className="text-[hsl(var(--primary))]">.</span></h1><p className="mt-5 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">The stories moving Kenya and the wider world, selected for a sharper start to the day.</p></div>
          <div className="reveal reveal-1 flex items-center gap-3 self-start sm:self-end"><div className="live-dot" /><div><p className="eyebrow text-[hsl(var(--primary))]">Live edition</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Updated {formatTime(feed.refreshedAt)} · New edition every hour</p></div><button type="button" onClick={refresh} className="ml-3 rounded-full border border-[hsl(var(--border))] p-2.5 transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]" aria-label="Refresh news" data-testid="button-refresh-news"><RefreshCw size={16} /></button></div>
        </div>
        {search && <p className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">Showing results for <strong className="text-[hsl(var(--foreground))]">“{search}”</strong></p>}
        {savedOnly && <p className="mt-6 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Bookmark size={15} /> Your saved stories</p>}
        {!filtered.length ? <div className="mt-10"><EmptyState saved={savedOnly} /></div> : (
          <>
            <div className="mt-8 grid gap-5 md:grid-cols-[1.35fr_.65fr]">
              {featured && <article className="story-card reveal reveal-1 group relative min-h-[390px] overflow-hidden rounded-[1.2rem] bg-[hsl(var(--secondary))]" data-testid={`card-featured-${featured.id}`}><Link href={`/article/${featured.id}`} className="absolute inset-0" data-testid={`link-featured-${featured.id}`}><StoryImage article={featured} className="opacity-80 mix-blend-luminosity transition-opacity group-hover:opacity-95" /><div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--secondary))] via-[hsl(var(--secondary)/.28)] to-transparent" /><div className="absolute inset-x-0 bottom-0 p-6 text-[hsl(var(--background))] sm:p-8"><StoryMeta article={featured} light /><h2 className="mt-3 max-w-2xl font-serif text-[clamp(2.2rem,5vw,4.2rem)] leading-[.91] tracking-[-.025em]">{featured.title}</h2><p className="mt-4 max-w-xl text-sm leading-relaxed text-[hsl(var(--background)/.76)]">{featured.excerpt}</p><span className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--accent))]">Open the full story <ArrowUpRight size={15} /></span></div></Link><button type="button" onClick={() => toggleSaved(featured.id)} aria-label={`Save ${featured.title}`} className="absolute right-5 top-5 rounded-full bg-[hsl(var(--secondary)/.65)] p-3 text-[hsl(var(--background))] backdrop-blur transition-colors hover:bg-[hsl(var(--primary))]" data-testid={`button-save-featured-${featured.id}`}><Bookmark size={17} /></button></article>}
              <div className="flex flex-col gap-5">{rest.slice(0, 2).map((article, index) => <StoryCard article={article} key={article.id} index={index + 1} />)}</div>
            </div>
            <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_320px]">
              <section><div className="mb-5 flex items-center justify-between border-b border-[hsl(var(--foreground))] pb-3"><h2 className="eyebrow">Latest from the desk</h2><span className="text-xs text-[hsl(var(--muted-foreground))]">{filtered.length} live stories</span></div><div className="grid gap-5 sm:grid-cols-2">{rest.slice(2, visibleCount).map((article, index) => <StoryCard article={article} key={article.id} index={index % 4} />)}</div><div className="h-8" data-testid="feed-sentinel" aria-hidden="true" /></section>
              <aside><div className="mb-5 flex items-center gap-2 border-b border-[hsl(var(--foreground))] pb-3"><TrendingUp size={17} className="text-[hsl(var(--primary))]" /><h2 className="eyebrow">What readers are following</h2></div><div className="divide-y divide-[hsl(var(--border))]">{trendingQuery.isLoading ? [1, 2, 3].map((item) => <div key={item} className="skeleton my-4 h-20 rounded-lg" />) : (trendingQuery.data || []).slice(0, 5).map((article, index) => <Link href={`/article/${article.id}`} key={article.id} className="group flex gap-4 py-4" data-testid={`link-trending-${article.id}`}><span className="font-serif text-3xl leading-none text-[hsl(var(--primary)/.5)]">0{index + 1}</span><div><p className="text-sm font-semibold leading-snug transition-colors group-hover:text-[hsl(var(--primary))]">{article.title}</p><p className="mt-2 text-[.68rem] text-[hsl(var(--muted-foreground))]">{article.source} · {formatTime(article.publishedAt)}</p></div><ChevronRight size={15} className="ml-auto mt-1 shrink-0 text-[hsl(var(--muted-foreground))]" /></Link>)}</div></aside>
            </div>
          </>
        )}
      </section>
      <div className="overflow-hidden border-y border-[hsl(var(--border))] bg-[hsl(var(--accent))] py-2.5 text-[hsl(var(--accent-foreground))]"><div className="ticker-track flex w-max gap-8 whitespace-nowrap"><span className="eyebrow">GEN 5minutes briefing</span><ArrowDown size={13} /><span className="eyebrow">Read beyond the headline</span><span className="opacity-50">◆</span><span className="eyebrow">GEN 5minutes briefing</span><ArrowDown size={13} /><span className="eyebrow">Read beyond the headline</span><span className="opacity-50">◆</span></div></div>
    </main>
  );
}