import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings as SettingsIcon, User, Shield, Bell, Wifi,
  Gauge, Globe, CheckCheck, Save, RotateCcw, Trash2,
  AlertTriangle, Moon, Sun, Monitor, Lock, Unlock,
  Key, Download, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Theme         = 'light' | 'dark' | 'system';
type DefaultExpiry = '1h' | '6h' | '24h' | '7d' | 'never';
type DefaultBw     = 'unlimited' | '10mb' | '100mb' | '500mb';

interface SettingsState {
  // Account
  displayName:    string;
  email:          string;
  username:       string;
  // Appearance
  theme:          Theme;
  // Relay defaults
  defaultExpiry:  DefaultExpiry;
  defaultBw:      DefaultBw;
  defaultMaxConns: string;
  defaultCors:    boolean;
  defaultLogging: boolean;
  // Notifications
  notifyNewSession:   boolean;
  notifyBandwidth:    boolean;
  notifyExpiry:       boolean;
  // Privacy
  publicProfile:  boolean;
  showStats:      boolean;
  // Network
  workerAutoStart: boolean;
  maxWorkerConns:  string;
  signalingUrl:   string;
}

const DEFAULTS: SettingsState = {
  displayName:     'Tarun',
  email:           'tarun225601@example.com',
  username:        'tarun225601',
  theme:           'system',
  defaultExpiry:   '24h',
  defaultBw:       'unlimited',
  defaultMaxConns: '10',
  defaultCors:     true,
  defaultLogging:  true,
  notifyNewSession:   true,
  notifyBandwidth:    false,
  notifyExpiry:       true,
  publicProfile:   true,
  showStats:       true,
  workerAutoStart: false,
  maxWorkerConns:  '5',
  signalingUrl:    'wss://signal.netmesh.app/ws',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXPIRY_OPTIONS: [DefaultExpiry, string][] = [
  ['1h', '1 hour'], ['6h', '6 hours'], ['24h', '24 hours'], ['7d', '7 days'], ['never', 'Never'],
];

const BW_OPTIONS: [DefaultBw, string][] = [
  ['unlimited', 'Unlimited'], ['10mb', '10 MB'], ['100mb', '100 MB'], ['500mb', '500 MB'],
];

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light',  label: 'Light',  icon: <Sun className="w-4 h-4" /> },
  { value: 'dark',   label: 'Dark',   icon: <Moon className="w-4 h-4" /> },
  { value: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> },
];

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ─── Settings page ────────────────────────────────────────────────────────────

export default function Settings() {
  const [s, setS]       = useState<SettingsState>(DEFAULTS);
  const [saved, setSaved]     = useState(false);
  const [dirty, setDirty]     = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKey] = useState('nm_live_' + Math.random().toString(36).slice(2, 34));

  const update = <K extends keyof SettingsState>(key: K, val: SettingsState[K]) => {
    setS(prev => ({ ...prev, [key]: val }));
    setDirty(true);
    setSaved(false);
  };

  const save = () => {
    // Simulate save
    setTimeout(() => { setSaved(true); setDirty(false); }, 500);
  };

  const reset = () => { setS(DEFAULTS); setDirty(false); setSaved(false); };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              Settings
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Account preferences and relay configuration
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={reset} className="flex items-center gap-1.5 text-xs">
                <RotateCcw className="w-3 h-3" />Reset
              </Button>
            )}
            <Button
              onClick={save}
              disabled={!dirty}
              size="sm"
              className="flex items-center gap-1.5"
            >
              {saved
                ? <><CheckCheck className="w-3.5 h-3.5" />Saved</>
                : <><Save className="w-3.5 h-3.5" />Save changes</>}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-5">

          {/* Account */}
          <Section title="Account" icon={<User className="w-4 h-4" />} description="Your identity on the NetMesh network">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-xs">Display Name</Label>
                <Input id="displayName" value={s.displayName} onChange={e => update('displayName', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs">Username</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <Input id="username" value={s.username} onChange={e => update('username', e.target.value)} className="pl-7" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input id="email" type="email" value={s.email} onChange={e => update('email', e.target.value)} />
            </div>

            <Separator />

            {/* API Key */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />API Key
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-xs bg-muted/60 border border-border rounded-md px-3 py-2 text-muted-foreground truncate">
                  {apiKeyVisible ? apiKey : '••••••••••••••••••••••••••••••••'}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setApiKeyVisible(v => !v)}
                  title={apiKeyVisible ? 'Hide key' : 'Reveal key'}
                >
                  {apiKeyVisible ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-9"
                  onClick={() => navigator.clipboard.writeText(apiKey)}
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Use this key to authenticate programmatic relay requests via the NetMesh API.</p>
            </div>
          </Section>

          {/* Appearance */}
          <Section title="Appearance" icon={<Sun className="w-4 h-4" />}>
            <div className="space-y-2">
              <Label className="text-xs">Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update('theme', value)}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all',
                      s.theme === value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary text-primary'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30 text-foreground'
                    )}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                System follows your OS preference. Changes take effect on next load.
              </p>
            </div>
          </Section>

          {/* Relay defaults */}
          <Section
            title="Relay Defaults"
            icon={<Gauge className="w-4 h-4" />}
            description="Pre-filled values when creating new links in Share Link"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Default Expiry</Label>
                <Select value={s.defaultExpiry} onValueChange={v => update('defaultExpiry', v as DefaultExpiry)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Default Bandwidth Cap</Label>
                <Select value={s.defaultBw} onValueChange={v => update('defaultBw', v as DefaultBw)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BW_OPTIONS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Max Connections</Label>
              <Input
                type="number" min={1} max={1000}
                value={s.defaultMaxConns}
                onChange={e => update('defaultMaxConns', e.target.value)}
                className="w-28 tabular-nums"
              />
            </div>
            <Separator />
            <div className="space-y-3">
              <ToggleRow
                id="default-cors"
                label="Inject CORS headers by default"
                description="Auto-enable CORS injection on every new link"
                checked={s.defaultCors}
                onChange={v => update('defaultCors', v)}
              />
              <ToggleRow
                id="default-logging"
                label="Enable access logging by default"
                description="New links will write to the Network Topology Log stream"
                checked={s.defaultLogging}
                onChange={v => update('defaultLogging', v)}
              />
            </div>
          </Section>

          {/* Notifications */}
          <Section title="Notifications" icon={<Bell className="w-4 h-4" />}>
            <div className="space-y-3">
              <ToggleRow
                id="notify-session"
                label="New session connected"
                description="Alert when a buyer pairs with your Worker node"
                checked={s.notifyNewSession}
                onChange={v => update('notifyNewSession', v)}
              />
              <ToggleRow
                id="notify-bw"
                label="Bandwidth cap reached"
                description="Notify when a link hits its bandwidth limit"
                checked={s.notifyBandwidth}
                onChange={v => update('notifyBandwidth', v)}
              />
              <ToggleRow
                id="notify-expiry"
                label="Link expiry warnings"
                description="Remind you 1 hour before a link expires"
                checked={s.notifyExpiry}
                onChange={v => update('notifyExpiry', v)}
              />
            </div>
          </Section>

          {/* Privacy */}
          <Section title="Privacy" icon={<Shield className="w-4 h-4" />}>
            <div className="space-y-3">
              <ToggleRow
                id="public-profile"
                label="Public profile"
                description="Allow others to view your profile at netmesh.app/@username"
                checked={s.publicProfile}
                onChange={v => update('publicProfile', v)}
              />
              <ToggleRow
                id="show-stats"
                label="Show usage statistics"
                description="Display total uses and bytes relayed on your public profile"
                checked={s.showStats}
                onChange={v => update('showStats', v)}
              />
            </div>
          </Section>

          {/* Network / Worker */}
          <Section
            title="Worker Node"
            icon={<Wifi className="w-4 h-4" />}
            description="Configure this device's behaviour as a relay worker"
          >
            <div className="space-y-1.5">
              <Label htmlFor="signalingUrl" className="text-xs flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />Signaling Server URL
              </Label>
              <Input
                id="signalingUrl"
                value={s.signalingUrl}
                onChange={e => update('signalingUrl', e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                WebSocket endpoint used for WebRTC offer/answer exchange.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Simultaneous Worker Connections</Label>
              <Input
                type="number" min={1} max={50}
                value={s.maxWorkerConns}
                onChange={e => update('maxWorkerConns', e.target.value)}
                className="w-28 tabular-nums"
              />
            </div>
            <Separator />
            <ToggleRow
              id="worker-autostart"
              label="Auto-start broadcasting on launch"
              description="Automatically enable Worker Node broadcasting when the dashboard opens"
              checked={s.workerAutoStart}
              onChange={v => update('workerAutoStart', v)}
            />
          </Section>

          {/* Data export */}
          <Section title="Data & Export" icon={<Download className="w-4 h-4" />}>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ settings: s, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href = url; a.download = 'netmesh-settings.json'; a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-3.5 h-3.5" />Export Settings
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  const csv = ['label,slug,type,uses,bytes,created', '...'].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href = url; a.download = 'netmesh-links.csv'; a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Activity className="w-3.5 h-3.5" />Export Link History
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Export your configuration or full link history as JSON/CSV for backup or migration.
            </p>
          </Section>

          {/* Danger zone */}
          <Card className="border-destructive/30">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Revoke all active links</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Immediately deactivates all {6} active relay links
                  </div>
                </div>
                <Button variant="destructive" size="sm" className="flex items-center gap-1.5 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />Revoke All
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Delete account</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Permanently removes your account and all associated data
                  </div>
                </div>
                <Button variant="destructive" size="sm" className="flex items-center gap-1.5 shrink-0" disabled>
                  <Trash2 className="w-3.5 h-3.5" />Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bottom save bar */}
          {dirty && (
            <div className="sticky bottom-0 -mx-6 px-6 py-3 border-t border-border bg-background/95 backdrop-blur-sm flex items-center justify-between">
              <p className="text-xs text-muted-foreground">You have unsaved changes</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>Discard</Button>
                <Button size="sm" onClick={save} className="flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" />Save changes
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
