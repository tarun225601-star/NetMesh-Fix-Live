import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Link2, Copy, CheckCheck, Loader2, Zap, Shield,
  Clock, Gauge, Lock, Unlock, Trash2, ExternalLink,
  RotateCcw, Share2, Globe, Wifi, AlertCircle, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type LinkType      = 'p2p-relay' | 'proxy' | 'direct';
type Expiry        = '1h' | '6h' | '24h' | '7d' | 'never';
type BandwidthCap  = 'unlimited' | '1mb' | '10mb' | '100mb' | '500mb';

interface LinkConfig {
  label:        string;
  targetUrl:    string;
  linkType:     LinkType;
  expiry:       Expiry;
  bandwidthCap: BandwidthCap;
  maxConns:     string;
  password:     string;
  passwordEnabled: boolean;
  corsEnabled:  boolean;
  loggingEnabled: boolean;
}

interface GeneratedLink {
  id:          string;
  slug:        string;
  label:       string;
  targetUrl:   string;
  linkType:    LinkType;
  expiry:      Expiry;
  bandwidthCap: BandwidthCap;
  maxConns:    string;
  passwordEnabled: boolean;
  corsEnabled: boolean;
  createdAt:   Date;
  uses:        number;
  bytesServed: number;
  active:      boolean;
}

// ─── Inline mock hook ─────────────────────────────────────────────────────────

function useCreateLink() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const create = useCallback(
    async (cfg: LinkConfig): Promise<GeneratedLink> => {
      setLoading(true);
      setError(null);
      // Simulate network latency
      await new Promise(r => setTimeout(r, 1600));
      setLoading(false);
      const slug = Math.random().toString(36).slice(2, 10);
      return {
        id:          crypto.randomUUID(),
        slug,
        label:       cfg.label || 'Untitled link',
        targetUrl:   cfg.targetUrl,
        linkType:    cfg.linkType,
        expiry:      cfg.expiry,
        bandwidthCap: cfg.bandwidthCap,
        maxConns:    cfg.maxConns,
        passwordEnabled: cfg.passwordEnabled,
        corsEnabled: cfg.corsEnabled,
        createdAt:   new Date(),
        uses:        0,
        bytesServed: 0,
        active:      true,
      };
    },
    []
  );

  return { create, loading, error };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LINK_TYPE_META: Record<LinkType, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  'p2p-relay': {
    label: 'P2P Relay',
    description: 'Route traffic through a paired Worker node',
    icon: <Wifi className="w-4 h-4" />,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
  proxy: {
    label: 'Proxy',
    description: 'Forward requests via the NetMesh gateway',
    icon: <Globe className="w-4 h-4" />,
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  },
  direct: {
    label: 'Direct',
    description: 'Signed URL with access controls only',
    icon: <Link2 className="w-4 h-4" />,
    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  },
};

const EXPIRY_LABELS: Record<Expiry, string> = {
  '1h':    '1 hour',
  '6h':    '6 hours',
  '24h':   '24 hours',
  '7d':    '7 days',
  'never': 'Never expires',
};

const BW_LABELS: Record<BandwidthCap, string> = {
  unlimited: 'Unlimited',
  '1mb':    '1 MB',
  '10mb':   '10 MB',
  '100mb':  '100 MB',
  '500mb':  '500 MB',
};

const DEFAULT_CONFIG: LinkConfig = {
  label:           '',
  targetUrl:       'https://jsonplaceholder.typicode.com/posts/1',
  linkType:        'p2p-relay',
  expiry:          '24h',
  bandwidthCap:    'unlimited',
  maxConns:        '10',
  password:        '',
  passwordEnabled: false,
  corsEnabled:     true,
  loggingEnabled:  true,
};

function fmtBytes(n: number): string {
  if (n < 1024)       return `${n} B`;
  if (n < 1048576)    return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function fmtDate(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function buildShareUrl(slug: string): string {
  return `https://netmesh.app/r/${slug}`;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, size = 'default' }: { text: string; size?: 'default' | 'sm' | 'icon' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button variant="outline" size={size} onClick={copy} className="shrink-0 flex items-center gap-1.5">
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {size !== 'icon' && (copied ? 'Copied!' : 'Copy')}
    </Button>
  );
}

// ─── Generated link card ──────────────────────────────────────────────────────

function GeneratedLinkCard({
  link,
  onRevoke,
}: {
  link: GeneratedLink;
  onRevoke: (id: string) => void;
}) {
  const meta = LINK_TYPE_META[link.linkType];
  const url  = buildShareUrl(link.slug);

  return (
    <Card className={cn('transition-opacity', !link.active && 'opacity-50')}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col flex-1 min-w-0 gap-3">
            {/* Top row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full', meta.color)}>
                {meta.icon}{meta.label}
              </span>
              {link.passwordEnabled && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                  <Lock className="w-3 h-3" />Password
                </span>
              )}
              {!link.active && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertCircle className="w-3 h-3" />Revoked
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">{fmtDate(link.createdAt)}</span>
            </div>

            {/* Label + target */}
            <div>
              <p className="font-medium text-sm">{link.label}</p>
              <p className="text-xs text-muted-foreground truncate">{link.targetUrl}</p>
            </div>

            {/* Share URL */}
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-xs bg-muted/60 border border-border rounded-md px-3 py-2 truncate text-primary">
                {url}
              </div>
              <CopyButton text={url} size="sm" />
              <Button variant="ghost" size="icon" asChild className="shrink-0 h-8 w-8">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Share2 className="w-3 h-3" />{link.uses} uses
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="w-3 h-3" />{fmtBytes(link.bytesServed)} served
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />{EXPIRY_LABELS[link.expiry]}
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="w-3 h-3" />{BW_LABELS[link.bandwidthCap]} cap
              </span>
            </div>
          </div>

          {/* Revoke */}
          {link.active && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-8 w-8"
              onClick={() => onRevoke(link.id)}
              title="Revoke link"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Link type selector ───────────────────────────────────────────────────────

function LinkTypeSelector({
  value,
  onChange,
}: {
  value: LinkType;
  onChange: (v: LinkType) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {(Object.keys(LINK_TYPE_META) as LinkType[]).map(t => {
        const { label, description, icon, color } = LINK_TYPE_META[t];
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn(
              'flex flex-col items-start gap-1.5 rounded-lg border px-3 py-3 text-left text-sm transition-all',
              active
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'
            )}
          >
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full', color)}>
              {icon}{label}
            </span>
            <span className="text-xs text-muted-foreground leading-snug">{description}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── ShareLink page ────────────────────────────────────────────────────────────

export default function ShareLink() {
  const [cfg, setCfg]           = useState<LinkConfig>(DEFAULT_CONFIG);
  const [links, setLinks]       = useState<GeneratedLink[]>([]);
  const [latest, setLatest]     = useState<GeneratedLink | null>(null);
  const [showForm, setShowForm] = useState(true);

  const { create, loading } = useCreateLink();

  const update = <K extends keyof LinkConfig>(key: K, value: LinkConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfg.targetUrl.trim()) return;
    const link = await create(cfg);
    setLinks(prev => [link, ...prev]);
    setLatest(link);
    setShowForm(false);
  };

  const handleRevoke = (id: string) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, active: false } : l));
    if (latest?.id === id) setLatest(prev => prev ? { ...prev, active: false } : null);
  };

  const handleReset = () => {
    setLatest(null);
    setCfg(DEFAULT_CONFIG);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Share2 className="w-5 h-5 text-primary" />
              Share Link
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate P2P relay links with access controls and bandwidth caps
            </p>
          </div>
          {!showForm && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={handleReset}
            >
              <Plus className="w-3.5 h-3.5" />
              New Link
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Success state ─────────────────────────────────────────────────── */}
        {latest && latest.active && (
          <Card className="border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-950/20">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-green-800 dark:text-green-300 text-sm">
                    Link generated successfully
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">
                    {latest.label} · {LINK_TYPE_META[latest.linkType].label} · expires {EXPIRY_LABELS[latest.expiry]}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 font-mono text-xs bg-white dark:bg-background border border-green-200 dark:border-green-800 rounded-md px-3 py-2 truncate text-primary">
                      {buildShareUrl(latest.slug)}
                    </div>
                    <CopyButton text={buildShareUrl(latest.slug)} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Link creation form ─────────────────────────────────────────────── */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Identity */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" />
                  Link Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure the endpoint and relay behaviour for this link
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Label */}
                <div className="space-y-1.5">
                  <Label htmlFor="label" className="text-xs font-medium">
                    Label <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="label"
                    placeholder="e.g. API Test Relay"
                    value={cfg.label}
                    onChange={e => update('label', e.target.value)}
                  />
                </div>

                {/* Target URL */}
                <div className="space-y-1.5">
                  <Label htmlFor="targetUrl" className="text-xs font-medium">
                    Target URL <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="targetUrl"
                    placeholder="https://example.com/api/resource"
                    value={cfg.targetUrl}
                    onChange={e => update('targetUrl', e.target.value)}
                    required
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    The origin this link will relay traffic to.
                    Must be a CORS-friendly URL.
                  </p>
                </div>

                {/* Link type */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Link Type</Label>
                  <LinkTypeSelector value={cfg.linkType} onChange={v => update('linkType', v)} />
                </div>
              </CardContent>
            </Card>

            {/* Access rules */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Access Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  {/* Expiry */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />Expiration
                    </Label>
                    <Select value={cfg.expiry} onValueChange={v => update('expiry', v as Expiry)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(EXPIRY_LABELS) as [Expiry, string][]).map(([k, label]) => (
                          <SelectItem key={k} value={k}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Bandwidth cap */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5" />Bandwidth Cap
                    </Label>
                    <Select value={cfg.bandwidthCap} onValueChange={v => update('bandwidthCap', v as BandwidthCap)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(BW_LABELS) as [BandwidthCap, string][]).map(([k, label]) => (
                          <SelectItem key={k} value={k}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Max connections */}
                <div className="space-y-1.5">
                  <Label htmlFor="maxConns" className="text-xs font-medium flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5" />Max Concurrent Connections
                  </Label>
                  <Input
                    id="maxConns"
                    type="number"
                    min={1}
                    max={1000}
                    value={cfg.maxConns}
                    onChange={e => update('maxConns', e.target.value)}
                    className="w-32 tabular-nums"
                  />
                </div>

                <Separator />

                {/* Toggles */}
                <div className="space-y-3">
                  {/* Password */}
                  <div className="flex items-start gap-3">
                    <Switch
                      id="password-toggle"
                      checked={cfg.passwordEnabled}
                      onCheckedChange={v => update('passwordEnabled', v)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <Label htmlFor="password-toggle" className="cursor-pointer text-sm flex items-center gap-1.5">
                        {cfg.passwordEnabled ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        Password protection
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Require a passphrase to access this link
                      </p>
                      {cfg.passwordEnabled && (
                        <Input
                          className="mt-2 max-w-xs"
                          type="password"
                          placeholder="Enter passphrase…"
                          value={cfg.password}
                          onChange={e => update('password', e.target.value)}
                        />
                      )}
                    </div>
                  </div>

                  {/* CORS */}
                  <div className="flex items-start gap-3">
                    <Switch
                      id="cors-toggle"
                      checked={cfg.corsEnabled}
                      onCheckedChange={v => update('corsEnabled', v)}
                      className="mt-0.5"
                    />
                    <div>
                      <Label htmlFor="cors-toggle" className="cursor-pointer text-sm">
                        Inject CORS headers
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Auto-inject <code className="text-xs bg-muted px-1 rounded">Access-Control-Allow-Origin: *</code> on relay responses
                      </p>
                    </div>
                  </div>

                  {/* Logging */}
                  <div className="flex items-start gap-3">
                    <Switch
                      id="logging-toggle"
                      checked={cfg.loggingEnabled}
                      onCheckedChange={v => update('loggingEnabled', v)}
                      className="mt-0.5"
                    />
                    <div>
                      <Label htmlFor="logging-toggle" className="cursor-pointer text-sm">
                        Access logging
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Record usage events in the Network Topology Log stream
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Config summary + submit */}
            <Card className="bg-muted/30">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    <span className={cn('inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full', LINK_TYPE_META[cfg.linkType].color)}>
                      {LINK_TYPE_META[cfg.linkType].icon}
                      {LINK_TYPE_META[cfg.linkType].label}
                    </span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{EXPIRY_LABELS[cfg.expiry]}</span>
                    <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{BW_LABELS[cfg.bandwidthCap]}</span>
                    <span className="flex items-center gap-1">
                      {cfg.passwordEnabled
                        ? <><Lock className="w-3 h-3 text-amber-500" /><span className="text-amber-600 dark:text-amber-400">Password on</span></>
                        : <><Unlock className="w-3 h-3" />Open access</>}
                    </span>
                  </div>
                  <Button type="submit" disabled={loading || !cfg.targetUrl.trim()} className="flex items-center gap-2 shrink-0">
                    {loading
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                      : <><Zap className="w-4 h-4" />Generate Link</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        )}

        {/* ── Link history ──────────────────────────────────────────────────── */}
        {links.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Generated Links ({links.filter(l => l.active).length} active)
              </h2>
              {!showForm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs flex items-center gap-1.5"
                  onClick={handleReset}
                >
                  <RotateCcw className="w-3 h-3" />New link
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {links.map(link => (
                <GeneratedLinkCard key={link.id} link={link} onRevoke={handleRevoke} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {links.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Link2 className="w-10 h-10 opacity-20" />
            <span className="text-sm">No links yet — create your first one above</span>
          </div>
        )}
      </div>
    </div>
  );
}
