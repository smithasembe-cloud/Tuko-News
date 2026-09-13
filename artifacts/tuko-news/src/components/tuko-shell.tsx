import { Bookmark, Download, Menu, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';

const categories = [
  ['all', 'Top stories'],
  ['kenya', 'Kenya'],
  ['world', 'World'],
  ['business', 'Business'],
  ['sport', 'Sports'],
  ['culture', 'Culture'],
  ['technology', 'Technology'],
  ['videos', 'Videos'],
] as const;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function MwangazaBrand() {
  return (
    <span className="brand-lockup" aria-label="Mwangaza Wire">
      <span className="brand-mwangaza">Mwangaza</span>
      <span className="brand-wire">WIRE</span>
      <span className="brand-brief">NEWS BRIEF</span>
    </span>
  );
}

export function TukoShell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const query = search.trim();
    if (query) setLocation(`/?q=${encodeURIComponent(query)}`);
    setSearchOpen(false);
  }

  return (
    <div className="tuko-shell">
      <header className="tuko-header sticky top-0 z-40">
        <div className="tuko-container flex h-[70px] items-center justify-between gap-4">
          <Link href="/" className="brand-mark text-[2rem] text-[hsl(var(--foreground))]" data-testid="link-home">
            <MwangazaBrand />
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <span className="live-dot" aria-hidden="true" />
            <span className="eyebrow text-[hsl(var(--primary))]">Live desk</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Nairobi · East Africa</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/?saved=1" className="hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] sm:flex" data-testid="link-saved">
              <Bookmark size={16} /> Saved
            </Link>
            <button type="button" aria-label="Search stories" onClick={() => setSearchOpen((open) => !open)} className="rounded-full p-2.5 transition-colors hover:bg-[hsl(var(--muted))]" data-testid="button-toggle-search">
              <Search size={19} strokeWidth={1.8} />
            </button>
            <button type="button" aria-label="Open menu" onClick={() => setMobileOpen((open) => !open)} className="rounded-full p-2.5 transition-colors hover:bg-[hsl(var(--muted))] md:hidden" data-testid="button-toggle-menu">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] py-3">
            <form onSubmit={submitSearch} className="tuko-container flex items-center gap-3">
              <Search size={18} className="text-[hsl(var(--muted-foreground))]" />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search today's reporting" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]" data-testid="input-search" />
              <button type="submit" className="rounded-full bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid="button-submit-search">Search</button>
            </form>
          </div>
        )}
        <nav className={`border-t border-[hsl(var(--border))] ${mobileOpen ? 'block' : 'hidden'} md:block`} aria-label="Primary">
          <div className="tuko-container flex gap-1 overflow-x-auto py-2.5 md:gap-5">
            {categories.map(([value, label]) => {
              const active = value === 'all' ? location === '/' : location.includes(`category=${value}`);
              return (
                <Link key={value} href={value === 'all' ? '/' : `/?category=${value}`} onClick={() => setMobileOpen(false)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all md:px-0 md:py-0 ${active ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))] md:bg-transparent md:text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} data-testid={`link-category-${value}`}>
                  {label}
                </Link>
              );
            })}
            {installPrompt && <button type="button" onClick={installApp} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-bold text-[hsl(var(--primary-foreground))] md:px-3 md:py-1" data-testid="button-install-app"><Download size={13} /> Install app</button>}
          </div>
        </nav>
      </header>
      {children}
      <footer className="mt-24 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
        <div className="tuko-container flex flex-col gap-8 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="brand-mark text-4xl"><MwangazaBrand /></div>
            <p className="mt-3 max-w-xs text-sm text-[hsl(var(--secondary-foreground)/.68)]">Mwangaza News Brief for Kenya, the continent, and a curious world.</p>
            <p className="mt-3 text-xs text-[hsl(var(--secondary-foreground)/.52)]">Add it to your phone from your browser menu for one-tap access.</p>
          </div>
          <div className="text-right">
            <p className="eyebrow text-[hsl(var(--accent))]">Independent reading</p>
            <p className="mt-2 text-xs text-[hsl(var(--secondary-foreground)/.62)]">Stories belong to their original publishers.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}