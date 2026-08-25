import { useEffect, useState } from 'react';
import {
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Ticket,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageLoader } from '@/components/common/PageLoader';
import { ErrorState } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

import { fetchAgentCatalog } from '../api';
import type { AgentCatalogBook, AgentCatalogResponse } from '../types';

export function AgentCatalogPage() {
  const [data, setData] = useState<AgentCatalogResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'visual' | 'json'>('visual');
  const [copied, setCopied] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');

  const endpointUrl = `${window.location.origin.replace(':5173', ':8000')}/api/v1/agent/catalog`;

  const loadCatalog = async () => {
    setError(null);
    try {
      const res = await fetchAgentCatalog(100);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch agent catalog';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchAgentCatalog(100)
      .then((res) => {
        if (active) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Failed to fetch agent catalog';
          setError(msg);
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopyJson = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    toast.success('Copied machine-readable catalog JSON to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(endpointUrl);
    toast.success('Copied API endpoint URL to clipboard');
  };

  const formatBadgeText = (badge?: string | null) => {
    if (!badge) return null;
    if (badge === 'mostPopular' || badge === 'Most Popular') return '⭐ Most Popular';
    if (badge === 'bestValue' || badge === 'Best Value') return '💎 Best Value';
    return badge;
  };

  const allBooks = data?.catalog ?? [];
  const filteredBooks = allBooks.filter((book: AgentCatalogBook) => {
    const matchesSearch =
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.category.toLowerCase().includes(searchQuery.toLowerCase());

    if (stockFilter === 'in_stock') return matchesSearch && book.availability === 'in_stock';
    if (stockFilter === 'out_of_stock') return matchesSearch && book.availability === 'out_of_stock';
    return matchesSearch;
  });

  const previewBooks = filteredBooks.slice(0, 6);
  const previewCoupons = (data?.active_coupons ?? []).slice(0, 4);

  if (isLoading && !data) {
    return <PageLoader />;
  }

  if (error && !data) {
    return <ErrorState description={error} onRetry={loadCatalog} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">

      {/* ── 1. Modern Hero Section ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-surface p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 font-mono text-xs font-semibold text-primary border border-primary/20">
                <Bot className="size-3.5" /> 🤖 AI COMMERCE MERCHANT CATALOG
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-green-600 dark:text-green-400">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-green-500" />
                </span>
                Catalog API Live
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Your library, ready for AI agents.
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Exposing structured catalog inventory, membership subscriptions, real-time stock signals, and promotional discount codes directly to agentic shoppers.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Endpoint:</span>
              <code className="rounded-md bg-primary/10 px-2.5 py-1 text-primary font-mono font-bold border border-primary/20">
                GET /api/v1/agent/catalog
              </code>
              <button
                onClick={handleCopyUrl}
                className="text-primary hover:underline inline-flex items-center gap-1 ml-1 font-sans"
                title="Copy full endpoint URL"
              >
                <Copy className="size-3" /> Copy URL
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="primary"
              size="md"
              onClick={() => setActiveTab(activeTab === 'json' ? 'visual' : 'json')}
              className="gap-2 shadow-sm font-medium"
            >
              {activeTab === 'json' ? <Sparkles className="size-4" /> : <Code2 className="size-4" />}
              {activeTab === 'json' ? 'Visual Preview' : 'View Machine-Readable Catalog →'}
            </Button>

            <Button
              variant="outline"
              size="md"
              onClick={loadCatalog}
              disabled={isLoading}
              className="gap-1.5"
              title="Refetch Live Catalog"
            >
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. Stat Cards (Colored Accent Borders) ────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 border-t-4 border-t-primary shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-muted-foreground">MEMBERSHIP TIERS</span>
            <Layers className="size-4 text-primary" />
          </div>
          <p className="text-3xl font-bold font-mono text-foreground">
            {data?.membership_plans?.length ?? 4}
          </p>
          <p className="text-[11px] text-muted-foreground">Active subscription plans</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 border-t-4 border-t-violet-500 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-muted-foreground">CATALOG INVENTORY</span>
            <BookOpen className="size-4 text-violet-500" />
          </div>
          <p className="text-3xl font-bold font-mono text-foreground">
            {data?.meta?.total_books ?? data?.catalog?.length ?? 400}
          </p>
          <p className="text-[11px] text-muted-foreground">Books & copy stock signals</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 border-t-4 border-t-amber-500 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-muted-foreground">ACTIVE PROMO CODES</span>
            <Ticket className="size-4 text-amber-500" />
          </div>
          <p className="text-3xl font-bold font-mono text-foreground">
            {data?.active_coupons?.length ?? 15}
          </p>
          <p className="text-[11px] text-muted-foreground">Automated discount offers</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 border-t-4 border-t-green-500 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-muted-foreground">AGENT API READINESS</span>
            <Cpu className="size-4 text-green-500" />
          </div>
          <p className="text-3xl font-bold font-mono text-green-600 dark:text-green-400">
            Live
          </p>
          <p className="text-[11px] text-muted-foreground">Schema v1.0-agentic</p>
        </div>
      </div>

      {/* ── 3. Main View Toggle (Visual Preview vs Raw JSON) ─────── */}
      {activeTab === 'json' ? (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
          <div className="flex flex-row items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="font-mono text-base font-semibold text-foreground flex items-center gap-2">
                <Code2 className="size-4 text-primary" /> Live GET /api/v1/agent/catalog Response
              </h3>
              <p className="text-xs text-muted-foreground">
                Live backend response payload ({data?.catalog?.length ?? 0} books, {data?.membership_plans?.length ?? 0} plans, {data?.active_coupons?.length ?? 0} offers)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyJson} className="gap-1.5 font-mono text-xs">
                {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('visual')} className="text-xs text-muted-foreground hover:text-foreground">
                Close
              </Button>
            </div>
          </div>
          <pre className="max-h-[600px] overflow-auto rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-xs border border-slate-800 shadow-inner">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── 4. Membership Plans Grid ───────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Layers className="size-4 text-primary" /> Membership Subscription Tiers
                </h2>
                <p className="text-xs text-muted-foreground">
                  Standardized subscription options queryable by AI agents.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary border border-primary/20">
                {data?.membership_plans?.length ?? 0} Tiers
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data?.membership_plans.map((plan) => {
                const badgeText = formatBadgeText(plan.badge);
                return (
                  <div
                    key={plan.id}
                    className="relative flex flex-col justify-between rounded-xl border border-border bg-surface p-5 transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    {badgeText && (
                      <div className="absolute -top-3 right-4">
                        <span className="rounded-full bg-primary px-3 py-0.5 font-mono text-[10px] font-bold text-primary-foreground shadow-sm">
                          {badgeText}
                        </span>
                      </div>
                    )}
                    <div className="space-y-3">
                      <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        {plan.months} Month{plan.months > 1 ? 's' : ''} Plan
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-foreground">
                          {formatCurrency(plan.price)}
                        </span>
                        <span className="text-xs text-muted-foreground">/ month</span>
                      </div>

                      <div className="space-y-2 border-t border-border pt-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                            ● Available
                          </span>
                          {plan.save_percent > 0 && (
                            <span className="rounded-full bg-green-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-green-600 dark:text-green-400 border border-green-500/20">
                              Save {plan.save_percent}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 5. Book Catalog Preview Grid ────────────────────────── */}
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" /> Book Inventory & Stock Signals
                </h2>
                <p className="text-xs text-muted-foreground">
                  Stock availability and copy counts exposed to AI shopping agents.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter by title, author, category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs h-9"
                  />
                </div>

                <div className="flex items-center rounded-lg border border-border bg-surface p-1 text-xs font-mono">
                  <button
                    onClick={() => setStockFilter('all')}
                    className={`rounded px-3 py-1 ${stockFilter === 'all' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStockFilter('in_stock')}
                    className={`rounded px-3 py-1 ${stockFilter === 'in_stock' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    In Stock
                  </button>
                  <button
                    onClick={() => setStockFilter('out_of_stock')}
                    className={`rounded px-3 py-1 ${stockFilter === 'out_of_stock' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Out of Stock
                  </button>
                </div>
              </div>
            </div>

            {previewBooks.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted-foreground text-sm">
                No catalog books match your search or stock availability filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {previewBooks.map((book) => (
                  <div
                    key={book.id}
                    className="flex flex-col justify-between rounded-xl border border-border bg-surface p-5 transition-all hover:border-primary/40 shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-primary border border-primary/20">
                          {book.category}
                        </span>
                        {book.availability === 'in_stock' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400 border border-green-500/30">
                            <CheckCircle2 className="size-3" /> In Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            <XCircle className="size-3" /> Out of Stock
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="font-semibold text-sm text-foreground line-clamp-1">{book.title}</h3>
                        <p className="text-xs text-muted-foreground">{book.author}</p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-border pt-3 flex items-center justify-between text-xs font-mono">
                      <span className={book.available_copies > 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
                        {book.available_copies} of {book.total_copies} available
                      </span>
                      {book.average_rating ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          ★ {book.average_rating}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4 text-xs text-muted-foreground">
              <span>
                Showing {previewBooks.length} of {data?.meta?.total_books ?? 400} catalog items in preview mode.
              </span>
              <button
                onClick={() => setActiveTab('json')}
                className="text-primary hover:underline font-medium inline-flex items-center gap-1 text-left"
              >
                View Full Catalog Payload in Raw JSON →
              </button>
            </div>
          </section>

          {/* ── 6. Active Offers & Discounts ───────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Ticket className="size-4 text-primary" /> Active Promotional Offers
                </h2>
                <p className="text-xs text-muted-foreground">
                  Promotional codes exposed for automated AI discount validation.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary border border-primary/20">
                {data?.active_coupons?.length ?? 0} Offers
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {previewCoupons.map((coupon) => (
                <div key={coupon.code} className="rounded-xl border border-dashed border-primary/30 bg-surface p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-extrabold text-primary">
                      {coupon.discount_percent}% OFF
                    </span>
                    <span className="rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400 border border-green-500/20">
                      ● Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono border-t border-border pt-2">
                    <span className="text-muted-foreground">Code:</span>
                    <span className="font-bold text-foreground flex items-center gap-1">
                      <Tag className="size-3 text-primary" /> {coupon.code}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 7. Machine-Readable API Terminal Centerpiece ────────── */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-surface via-surface to-primary/5 p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold tracking-wider">
                  <Bot className="size-4" /> 🤖 MACHINE-READABLE MERCHANT CATALOG
                </div>
                <h3 className="text-xl font-extrabold text-foreground">
                  The same catalog can be consumed directly by AI shopping agents.
                </h3>
                <p className="text-xs text-muted-foreground">
                  Memberships &bull; Pricing &bull; Books &bull; Inventory Stock Signals &bull; Promotional Offers
                </p>
                <div className="pt-1 font-mono text-xs text-muted-foreground">
                  Endpoint: <code className="rounded-md bg-primary/10 px-2.5 py-1 text-primary font-mono font-bold border border-primary/20">GET /api/v1/agent/catalog</code>
                </div>
              </div>

              <Button
                variant="primary"
                size="md"
                onClick={() => setActiveTab('json')}
                className="gap-2 shrink-0 font-mono shadow-sm"
              >
                <Code2 className="size-4" /> Inspect Raw JSON →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
