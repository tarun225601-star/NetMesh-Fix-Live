import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Link2, Copy, CheckCheck, Trash2, ExternalLink,
  Search, ArrowUpDown, ArrowUp, ArrowDown, Wifi,
  Globe, Clock, Gauge, Filter, RotateCcw, Share2,
  Activity, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type LinkType   = 'p2p-relay' | 'proxy' | 'direct';
type LinkStatus = 'active' | 'expired' | 'revoked';
type SortKey    = 'createdAt' | 'uses' | 'bytesServed' | 'label';
type SortDir    = 'asc' | 'desc';

interface ManagedLink {
  id:           string;
  slug:         string;
  label:        string;
  targetUrl:    string;
  linkType:     LinkType;
  expiry:       string;
  bandwidthCap: string;
  passwordEnabled: boolean;
  status:       LinkStatus;
  createdAt:    Date;
  uses:         number;
  bytesServed:  number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function makeLink(overrides: Partial<ManagedLink> & Pick<ManagedLink, 'id' | 'slug' | 'label' | 'targetUrl' | 'linkType' | 'status' | 'uses' | 'bytesServed' | 'createdAt'>): ManagedLink {
  return {
    expiry: '24h',
    bandwidthCap: 'unlimited',
    passwordEnabled: false,
    ...overrides,
  };
}

const SEED_LINKS: ManagedLink[] = [
  makeLink({ id: '1', slug: 'a1b2c3d4', label: 'API Test Relay',        targetUrl: 'https://jsonplaceholder.typicode.com/posts/1', linkType: 'p2p-relay', status: 'active',  uses: 312, bytesServed: 4718592,  createdAt: new Date(Date.now() - 2 * 86400000), expiry: '7d',    bandwidthCap: 'unlimited' }),
  makeLink({ id: '2', slug: 'e5f6g7h8', label: 'BigBuckBunny Stream',   targetUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', linkType: 'p2p-relay', status: 'active',  uses: 87,  bytesServed: 165580032, createdAt: new Date(Date.now() - 1 * 86400000), expiry: '24h',   bandwidthCap: '500mb' }),
  makeLink({ id: '3', slug: 'i9j0k1l2', label: 'GitHub Proxy',          targetUrl: 'https://api.github.com/repos/tarun225601-star/NetMesh-Free-Share', linkType: 'proxy',    status: 'active',  uses: 54,  bytesServed: 229376,   createdAt: new Date(Date.now() - 3 * 86400000), expiry: 'never',  bandwidthCap: '100mb', passwordEnabled: true }),
  makeLink({ id: '4', slug: 'm3n4o5p6', label: 'Internal Dashboard',    targetUrl: 'https://dashboard.internal.netmesh.app',                         linkType: 'direct',   status: 'active',  uses: 203, bytesServed: 1048576,  createdAt: new Date(Date.now() - 5 * 86400000), expiry: 'never',  bandwidthCap: 'unlimited' }),
  makeLink({ id: '5', slug: 'q7r8s9t0', label: 'Elephant Dream Relay',  targetUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', linkType: 'p2p-relay', status: 'expired', uses: 22,  bytesServed: 56623104,  createdAt: new Date(Date.now() - 8 * 86400000), expiry: '6h',    bandwidthCap: '100mb' }),
  makeLink({ id: '6', slug: 'u1v2w3x4', label: 'Public API Gateway',    targetUrl: 'https://api.open-meteo.com/v1/forecast',                         linkType: 'proxy',    status: 'active',  uses: 498, bytesServed: 786432,   createdAt: new Date(Date.now() - 6 * 3600000),  expiry: '24h',   bandwidthCap: '10mb'  }),
  makeLink({ id: '7', slug: 'y5z6a7b8', label: 'Old Test Link',         targetUrl: 'https://httpbin.org/get',                                        linkType: 'direct',   status: 'revoked', uses: 7,   bytesServed: 8192,     createdAt: new Date(Date.now() - 10 * 86400000), expiry: '1h',   bandwidthCap: 'unlimited' }),
  makeLink({ id: '8', slug: 'c9d0e1f2', label: 'Video Stress Test',     targetUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', linkType: 'p2p-relay', status: 'active',  uses: 11,  bytesServed: 11534336,  createdAt: new Date(Date.now() - 3600000),       expiry: '6h',    bandwidthCap: '500mb' }),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024)       return `${n} B`;
  if (n < 1048576)    return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function fmtDate(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)    return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)     return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function buildShareUrl(slug: string) {
  return `https://netmesh.app/r/${slug}`;
}

const LINK_TYPE_META: Record<LinkType, { label: string; icon: React.ReactNode; pill: string }> = {
  'p2p-relay': { label: 'P2P Relay', icon: <Wifi className="w-3 h-3" />,   pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  proxy:       { label: 'Proxy',     icon: <Globe className="w-3 h-3" />,  pill: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  direct:      { label: 'Direct',   icon: <Link2 className="w-3 h-3" />,   pill: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
};

const STATUS_META: Record<LinkStatus, { label: string; icon: React.ReactNode; pill: string }> = {
  active:  { label: 'Active',   icon: <CheckCircle2 className="w-3 h-3" />, pill: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  expired: { label: 'Expired',  icon: <Clock className="w-3 h-3" />,        pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  revoked: { label: 'Revoked',  icon: <XCircle className="w-3 h-3" />,      pill: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
};

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copy URL"
      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortTh({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th className="px-4 py-2.5 text-left">
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          'flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors',
          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {label}
        {active
          ? dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );
}

// ─── Summary stat cards ───────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

// ─── MyLinks page ─────────────────────────────────────────────────────────────

export default function MyLinks() {
  const [links, setLinks]           = useState<ManagedLink[]>(SEED_LINKS);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState<LinkType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<LinkStatus | 'all'>('all');
  const [sortKey, setSortKey]       = useState<SortKey>('createdAt');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [selected, setSelected]     = useState<Set<string>>(new Set());

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const revoke = (id: string) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, status: 'revoked' } : l));
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const revokeSelected = () => {
    setLinks(prev => prev.map(l => selected.has(l.id) ? { ...l, status: 'revoked' } : l));
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const resetFilters = () => {
    setSearch('');
    setFilterType('all');
    setFilterStatus('all');
  };

  const filtered = useMemo(() => {
    let list = links.filter(l => {
      const q = search.toLowerCase();
      if (q && !l.label.toLowerCase().includes(q) && !l.targetUrl.toLowerCase().includes(q) && !l.slug.includes(q)) return false;
      if (filterType !== 'all' && l.linkType !== filterType) return false;
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'label')       cmp = a.label.localeCompare(b.label);
      else if (sortKey === 'uses')   cmp = a.uses - b.uses;
      else if (sortKey === 'bytesServed') cmp = a.bytesServed - b.bytesServed;
      else cmp = a.createdAt.getTime() - b.createdAt.getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [links, search, filterType, filterStatus, sortKey, sortDir]);

  // Stats
  const active      = links.filter(l => l.status === 'active').length;
  const totalUses   = links.reduce((s, l) => s + l.uses, 0);
  const totalBytes  = links.reduce((s, l) => s + l.bytesServed, 0);
  const hasFilters  = search || filterType !== 'all' || filterStatus !== 'all';

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" />
              My Links
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage all generated P2P relay links
            </p>
          </div>
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={revokeSelected}
              className="flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Revoke {selected.size} selected
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Active Links"   value={String(active)}        sub={`${links.length} total`}          icon={<Activity className="w-3.5 h-3.5" />} />
          <StatCard label="Total Uses"     value={totalUses.toLocaleString()} sub="across all links"            icon={<Share2 className="w-3.5 h-3.5" />} />
          <StatCard label="Data Served"    value={fmtBytes(totalBytes)}  sub="lifetime relay volume"             icon={<Gauge className="w-3.5 h-3.5" />} />
          <StatCard label="Link Types"     value="3"                     sub="P2P · Proxy · Direct"              icon={<Link2 className="w-3.5 h-3.5" />} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search label, URL, slug…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <Select value={filterType} onValueChange={v => setFilterType(v as typeof filterType)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="p2p-relay">P2P Relay</SelectItem>
              <SelectItem value="proxy">Proxy</SelectItem>
              <SelectItem value="direct">Direct</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="flex items-center gap-1.5 text-xs">
              <RotateCcw className="w-3 h-3" />Clear
            </Button>
          )}

          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {links.length} links
          </span>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <AlertCircle className="w-8 h-8 opacity-20" />
              <span className="text-sm">No links match your filters</span>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.size > 0 && filtered.every(l => selected.has(l.id))}
                        onChange={e => {
                          if (e.target.checked) setSelected(new Set(filtered.map(l => l.id)));
                          else setSelected(new Set());
                        }}
                      />
                    </th>
                    <SortTh label="Label"   sortKey="label"       current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                    <SortTh label="Uses"    sortKey="uses"        current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Served"  sortKey="bytesServed" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Created" sortKey="createdAt"   current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Share URL</th>
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(link => {
                    const tm = LINK_TYPE_META[link.linkType];
                    const sm = STATUS_META[link.status];
                    const url = buildShareUrl(link.slug);
                    const isSelected = selected.has(link.id);
                    return (
                      <tr
                        key={link.id}
                        className={cn(
                          'border-b border-border last:border-0 transition-colors',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/20',
                          link.status !== 'active' && 'opacity-60'
                        )}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={isSelected}
                            onChange={() => toggleSelect(link.id)}
                          />
                        </td>

                        {/* Label + URL */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="font-medium text-sm truncate">{link.label}</div>
                          <div className="text-xs text-muted-foreground truncate font-mono">{link.targetUrl}</div>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', tm.pill)}>
                            {tm.icon}{tm.label}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', sm.pill)}>
                            {sm.icon}{sm.label}
                          </span>
                        </td>

                        {/* Uses */}
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {link.uses.toLocaleString()}
                        </td>

                        {/* Bytes served */}
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {fmtBytes(link.bytesServed)}
                        </td>

                        {/* Created */}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {fmtDate(link.createdAt)}
                        </td>

                        {/* Share URL */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 font-mono text-xs text-primary">
                            <span className="truncate max-w-[110px]">{url}</span>
                            <CopyBtn text={url} />
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          {link.status === 'active' && (
                            <button
                              onClick={() => revoke(link.id)}
                              title="Revoke link"
                              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Bulk-action footer */}
        {selected.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-foreground text-background rounded-full px-5 py-2.5 shadow-xl text-sm font-medium">
            <span>{selected.size} selected</span>
            <span className="w-px h-4 bg-background/20" />
            <button
              onClick={() => setSelected(new Set())}
              className="text-background/60 hover:text-background transition-colors text-xs"
            >
              Clear
            </button>
            <button
              onClick={revokeSelected}
              className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />Revoke all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
