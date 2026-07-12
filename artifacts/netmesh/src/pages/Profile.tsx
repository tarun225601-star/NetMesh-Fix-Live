import { useState } from 'react';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Copy, CheckCheck, ExternalLink, Share2, Link2, Wifi,
  Globe, Shield, Clock, Gauge, Edit2, Check, X,
  User, Mail, MapPin, Calendar, Activity, BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type LinkType = 'p2p-relay' | 'proxy' | 'direct';

interface PublicLink {
  slug:      string;
  label:     string;
  linkType:  LinkType;
  uses:      number;
  createdAt: Date;
}

interface ProfileData {
  username:    string;
  displayName: string;
  bio:         string;
  location:    string;
  joinedAt:    Date;
  totalLinks:  number;
  totalUses:   number;
  totalBytes:  number;
  links:       PublicLink[];
}

// ─── Mock profile data ────────────────────────────────────────────────────────

const MOCK_PROFILE: ProfileData = {
  username:    'tarun225601',
  displayName: 'Tarun',
  bio:         'Building NetMesh — open P2P internet sharing over WebRTC. Experimenting with decentralised relay networks.',
  location:    'India',
  joinedAt:    new Date('2024-03-15'),
  totalLinks:  24,
  totalUses:   2847,
  totalBytes:  524288000,
  links: [
    { slug: 'a1b2c3d4', label: 'API Test Relay',       linkType: 'p2p-relay', uses: 312, createdAt: new Date(Date.now() - 2 * 86400000) },
    { slug: 'e5f6g7h8', label: 'BigBuckBunny Stream',  linkType: 'p2p-relay', uses: 87,  createdAt: new Date(Date.now() - 1 * 86400000) },
    { slug: 'i9j0k1l2', label: 'GitHub Proxy',         linkType: 'proxy',     uses: 54,  createdAt: new Date(Date.now() - 3 * 86400000) },
    { slug: 'm3n4o5p6', label: 'Internal Dashboard',   linkType: 'direct',    uses: 203, createdAt: new Date(Date.now() - 5 * 86400000) },
    { slug: 'u1v2w3x4', label: 'Public API Gateway',   linkType: 'proxy',     uses: 498, createdAt: new Date(Date.now() - 6 * 3600000)  },
    { slug: 'c9d0e1f2', label: 'Video Stress Test',    linkType: 'p2p-relay', uses: 11,  createdAt: new Date(Date.now() - 3600000)      },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1048576)    return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function buildShareUrl(slug: string) {
  return `https://netmesh.app/r/${slug}`;
}

const LINK_TYPE_META: Record<LinkType, { label: string; icon: React.ReactNode; pill: string }> = {
  'p2p-relay': { label: 'P2P Relay', icon: <Wifi className="w-3 h-3" />,  pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  proxy:       { label: 'Proxy',     icon: <Globe className="w-3 h-3" />, pill: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  direct:      { label: 'Direct',    icon: <Link2 className="w-3 h-3" />, pill: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
};

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} className="flex items-center gap-1.5 text-xs h-8">
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {label ? (copied ? 'Copied!' : label) : (copied ? 'Copied!' : 'Copy')}
    </Button>
  );
}

// ─── Inline editable field ────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);

  const commit = () => { onSave(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex gap-2 items-start">
          {multiline ? (
            <textarea
              className="flex-1 text-sm border border-border rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          ) : (
            <Input
              className="flex-1 text-sm"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
            />
          )}
          <div className="flex gap-1 mt-0.5">
            <button onClick={commit} className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={cancel} className="p-1.5 rounded border border-border hover:bg-muted">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <p className={cn('text-sm', !value && 'text-muted-foreground italic')}>
          {value || placeholder || '—'}
        </p>
      )}
    </div>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────

export default function Profile() {
  const params = useParams<{ username?: string }>();
  const isOwnProfile = !params.username || params.username === MOCK_PROFILE.username;

  const [profile, setProfile] = useState<ProfileData>(MOCK_PROFILE);
  const profileUrl = `https://netmesh.app/@${profile.username}`;

  const update = <K extends keyof ProfileData>(key: K, val: ProfileData[K]) =>
    setProfile(prev => ({ ...prev, [key]: val }));

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              {isOwnProfile ? 'My Profile' : `@${params.username}`}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isOwnProfile
                ? 'Your public shareable profile page'
                : 'Public NetMesh user profile'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground hidden sm:block">{profileUrl}</span>
            <CopyBtn text={profileUrl} label="Copy profile URL" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-5 max-w-5xl">

          {/* ── Left column: identity ──────────────────────────── */}
          <div className="col-span-1 space-y-4">

            {/* Avatar + name */}
            <Card>
              <CardContent className="pt-6 pb-5 flex flex-col items-center text-center gap-3">
                {/* Avatar */}
                <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary select-none">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-base">{profile.displayName}</div>
                  <div className="text-sm text-muted-foreground">@{profile.username}</div>
                </div>

                {/* Profile URL share strip */}
                <div className="w-full mt-1 rounded-lg bg-muted/60 border border-border px-3 py-2 flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs text-primary truncate">
                    netmesh.app/@{profile.username}
                  </span>
                  <CopyBtn text={profileUrl} />
                </div>
              </CardContent>
            </Card>

            {/* Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{profile.location || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>Joined {fmtDate(profile.joinedAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="w-3.5 h-3.5 shrink-0 text-green-500" />
                  <span className="text-green-600 dark:text-green-400 text-xs font-medium">Verified node operator</span>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Network Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Links created',  value: profile.totalLinks.toString(),          icon: <Link2 className="w-3.5 h-3.5" /> },
                  { label: 'Total uses',     value: profile.totalUses.toLocaleString(),     icon: <Activity className="w-3.5 h-3.5" /> },
                  { label: 'Data relayed',   value: fmtBytes(profile.totalBytes),           icon: <BarChart2 className="w-3.5 h-3.5" /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</span>
                    <span className="font-semibold text-sm tabular-nums">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── Right column: edit + links ─────────────────────── */}
          <div className="col-span-2 space-y-4">

            {/* Edit profile (own only) */}
            {isOwnProfile && (
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-primary" />
                    Edit Profile
                  </CardTitle>
                  <CardDescription className="text-xs">
                    These details are visible on your public profile URL
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <EditableField
                      label="Display Name"
                      value={profile.displayName}
                      onSave={v => update('displayName', v)}
                      placeholder="Your name"
                    />
                    <EditableField
                      label="Location"
                      value={profile.location}
                      onSave={v => update('location', v)}
                      placeholder="City, Country"
                    />
                  </div>
                  <EditableField
                    label="Bio"
                    value={profile.bio}
                    onSave={v => update('bio', v)}
                    multiline
                    placeholder="Tell the network about yourself…"
                  />

                  <Separator />

                  {/* Public profile preview link */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Public profile URL</div>
                      <div className="font-mono text-sm text-primary mt-0.5">{profileUrl}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CopyBtn text={profileUrl} />
                      <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bio (read-only view for non-own) */}
            {!isOwnProfile && profile.bio && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
                </CardContent>
              </Card>
            )}

            {/* Public links */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-primary" />
                      Public Links
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {isOwnProfile
                        ? 'Links you have published to your public profile'
                        : `Relay links shared by @${profile.username}`}
                    </CardDescription>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {profile.links.length} links
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {profile.links.map(link => {
                  const tm  = LINK_TYPE_META[link.linkType];
                  const url = buildShareUrl(link.slug);
                  return (
                    <div
                      key={link.slug}
                      className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted/30 transition-colors group"
                    >
                      {/* Type pill */}
                      <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0', tm.pill)}>
                        {tm.icon}{tm.label}
                      </span>

                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{link.label}</div>
                        <div className="font-mono text-xs text-primary truncate">{url}</div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />{link.uses.toLocaleString()}
                        </span>
                        <span className="hidden sm:block">{fmtRelative(link.createdAt)}</span>
                      </div>

                      {/* Actions — appear on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => navigator.clipboard.writeText(url)}
                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                          title="Copy"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                          title="Open"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
