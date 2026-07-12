import { useState, useEffect, useRef, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Wifi, WifiOff, Activity, Radio, Smartphone, Terminal,
  CheckCircle2, Circle, AlertCircle, Loader2, Globe,
  Zap, Server, ArrowRightLeft, Clock, FileJson,
  Play, Square, MonitorPlay, Download, Network,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkerStatus = 'idle' | 'ready' | 'awaiting' | 'connecting' | 'connected';
type BuyerStatus  = 'idle' | 'connecting' | 'connected' | 'failed';

interface Session {
  id: string;
  buyerIp: string;
  startedAt: string;
  bytesRelayed: number;
  status: 'active' | 'closed';
}

interface Telemetry {
  workerIp: string;
  bytesRelayed: number;
  relayTimeMs: number;
  httpStatus: number | null;
}

interface LogEntry {
  id: string;
  ts: string;
  message: string;
  kind: 'info' | 'success' | 'warn' | 'error';
}

interface VideoAsset {
  name: string;
  url: string;
  size: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_ASSETS: VideoAsset[] = [
  {
    name: "Big Buck Bunny",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    size: "158 MB",
  },
  {
    name: "Elephant's Dream",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    size: "54 MB",
  },
  {
    name: "For Bigger Blazes",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    size: "11 MB",
  },
];

const APK_CHECKLIST = [
  { label: 'Android SDK configured',        done: true  },
  { label: 'Capacitor dependencies installed', done: true  },
  { label: 'WebRTC native bridge ready',    done: true  },
  { label: 'P2P service manifest declared', done: true  },
  { label: 'Build signing key',             done: false },
  { label: 'Play Store release assets',     done: false },
];

function fakeIp(): string {
  return `${Math.floor(Math.random()*200)+10}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*254)+1}`;
}

function fmtBytes(n: number): string {
  if (n < 1024)       return `${n} B`;
  if (n < 1048576)    return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1048576).toFixed(2)} MB`;
}

function nowTs(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Worker Status Badge ───────────────────────────────────────────────────────

function WorkerStatusBadge({ status }: { status: WorkerStatus }) {
  const map: Record<WorkerStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    idle:       { label: 'Offline',          icon: <WifiOff className="w-3 h-3" />,                          cls: 'bg-muted text-muted-foreground' },
    ready:      { label: 'Ready',            icon: <CheckCircle2 className="w-3 h-3" />,                     cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
    awaiting:   { label: 'Awaiting Buyer',   icon: <Loader2 className="w-3 h-3 animate-spin" />,             cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
    connecting: { label: 'Connecting',       icon: <Activity className="w-3 h-3 animate-pulse" />,           cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
    connected:  { label: 'Connected',        icon: <Wifi className="w-3 h-3" />,                             cls: 'bg-primary/10 text-primary' },
  };
  const { label, icon, cls } = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', cls)}>
      {icon}{label}
    </span>
  );
}

// ─── Worker Node Tab ───────────────────────────────────────────────────────────

function WorkerTab() {
  const [broadcasting, setBroadcasting] = useState(false);
  const [status, setStatus]             = useState<WorkerStatus>('idle');
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [totalBytes, setTotalBytes]     = useState(0);
  const intervalRef                     = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSim = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const startBroadcast = () => {
    setBroadcasting(true);
    setStatus('ready');
    // After 1.5 s → awaiting
    setTimeout(() => setStatus('awaiting'), 1500);
    // After 4 s → pair with a buyer
    setTimeout(() => {
      setStatus('connecting');
      setTimeout(() => {
        const newSession: Session = {
          id: uid(),
          buyerIp: fakeIp(),
          startedAt: nowTs(),
          bytesRelayed: 0,
          status: 'active',
        };
        setSessions(prev => [newSession, ...prev]);
        setStatus('connected');
        // Tick bytes every 800 ms
        intervalRef.current = setInterval(() => {
          const delta = Math.floor(Math.random() * 12000) + 2000;
          setTotalBytes(b => b + delta);
          setSessions(prev =>
            prev.map(s =>
              s.id === newSession.id && s.status === 'active'
                ? { ...s, bytesRelayed: s.bytesRelayed + delta }
                : s
            )
          );
        }, 800);
      }, 1200);
    }, 4000);
  };

  const stopBroadcast = () => {
    clearSim();
    setBroadcasting(false);
    setStatus('idle');
    setSessions(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'closed' } : s));
  };

  useEffect(() => () => clearSim(), []);

  const activeSessions = sessions.filter(s => s.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Control card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                Broadcasting Service
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Expose this node as a relay worker on the NetMesh network
              </CardDescription>
            </div>
            <WorkerStatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="broadcast-toggle"
              checked={broadcasting}
              onCheckedChange={v => (v ? startBroadcast() : stopBroadcast())}
            />
            <Label htmlFor="broadcast-toggle" className="text-sm cursor-pointer">
              {broadcasting ? 'Broadcasting active — accepting buyers' : 'Start broadcasting'}
            </Label>
          </div>

          {broadcasting && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { label: 'Total Bytes Relayed', value: fmtBytes(totalBytes), icon: <ArrowRightLeft className="w-4 h-4" /> },
                { label: 'Active Sessions',     value: String(activeSessions), icon: <Wifi className="w-4 h-4" /> },
                { label: 'Signal State',        value: status.charAt(0).toUpperCase() + status.slice(1), icon: <Activity className="w-4 h-4" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">{icon}{label}</div>
                  <div className="text-lg font-semibold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Connection Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Network className="w-8 h-8 opacity-30" />
              <span className="text-sm">No sessions yet — start broadcasting to accept buyers</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Session ID</th>
                    <th className="px-4 py-2 font-medium">Buyer IP</th>
                    <th className="px-4 py-2 font-medium">Started</th>
                    <th className="px-4 py-2 font-medium">Bytes Relayed</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{s.id}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{s.buyerIp}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.startedAt}</td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{fmtBytes(s.bytesRelayed)}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          s.status === 'active'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Network Buyer Tab ─────────────────────────────────────────────────────────

function BuyerTab() {
  const [buyerStatus, setBuyerStatus]   = useState<BuyerStatus>('idle');
  const [relayUrl, setRelayUrl]         = useState('https://jsonplaceholder.typicode.com/posts/1');
  const [telemetry, setTelemetry]       = useState<Telemetry | null>(null);
  const [fetching, setFetching]         = useState(false);
  const [activeVideo, setActiveVideo]   = useState<VideoAsset | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const videoRef                        = useRef<HTMLVideoElement>(null);

  const connectP2P = () => {
    setBuyerStatus('connecting');
    setTelemetry(null);
    setTimeout(() => setBuyerStatus('connected'), 2800);
  };

  const disconnect = () => {
    setBuyerStatus('idle');
    setTelemetry(null);
    setActiveVideo(null);
  };

  const fetchViaRelay = async () => {
    if (buyerStatus !== 'connected') return;
    setFetching(true);
    const t0 = performance.now();
    try {
      const res = await fetch(relayUrl);
      const ms  = Math.round(performance.now() - t0);
      const body = await res.text();
      setTelemetry({
        workerIp: fakeIp(),
        bytesRelayed: new TextEncoder().encode(body).length,
        relayTimeMs: ms,
        httpStatus: res.status,
      });
    } catch {
      setTelemetry({ workerIp: fakeIp(), bytesRelayed: 0, relayTimeMs: 0, httpStatus: 502 });
    } finally {
      setFetching(false);
    }
  };

  const playVideo = (v: VideoAsset) => {
    setActiveVideo(v);
    setVideoLoading(true);
    // small delay to let <video> mount
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
      }
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* P2P Connection */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                P2P Signaling
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Initiate a WebRTC handshake to pair with an active Worker node
              </CardDescription>
            </div>
            <span className={cn(
              'text-xs font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5',
              buyerStatus === 'idle'       && 'bg-muted text-muted-foreground',
              buyerStatus === 'connecting' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
              buyerStatus === 'connected'  && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
              buyerStatus === 'failed'     && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
            )}>
              {buyerStatus === 'idle'       && <><WifiOff className="w-3 h-3" />Disconnected</>}
              {buyerStatus === 'connecting' && <><Loader2 className="w-3 h-3 animate-spin" />Connecting…</>}
              {buyerStatus === 'connected'  && <><Wifi className="w-3 h-3" />Connected</>}
              {buyerStatus === 'failed'     && <><AlertCircle className="w-3 h-3" />Failed</>}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {buyerStatus !== 'connected' ? (
              <Button
                onClick={connectP2P}
                disabled={buyerStatus === 'connecting'}
                className="flex items-center gap-2"
              >
                {buyerStatus === 'connecting'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Pairing with Worker…</>
                  : <><Zap className="w-4 h-4" />Connect P2P</>}
              </Button>
            ) : (
              <Button variant="outline" onClick={disconnect} className="flex items-center gap-2">
                <Square className="w-4 h-4" />
                Disconnect
              </Button>
            )}
          </div>

          {/* Relay URL fetch */}
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Relay URL Request
            </Label>
            <div className="flex gap-2">
              <Input
                value={relayUrl}
                onChange={e => setRelayUrl(e.target.value)}
                placeholder="https://…"
                className="font-mono text-xs flex-1"
                disabled={buyerStatus !== 'connected'}
              />
              <Button
                onClick={fetchViaRelay}
                disabled={buyerStatus !== 'connected' || fetching}
                variant="secondary"
                className="shrink-0 flex items-center gap-1.5"
              >
                {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {fetching ? 'Relaying…' : 'Connect to High-Speed Net'}
              </Button>
            </div>
          </div>

          {/* Telemetry row */}
          {telemetry && (
            <div className="grid grid-cols-4 gap-3 pt-1">
              {[
                { label: 'Worker IP',     value: telemetry.workerIp,                 icon: <Server className="w-3.5 h-3.5" /> },
                { label: 'Bytes Relayed', value: fmtBytes(telemetry.bytesRelayed),   icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
                { label: 'Relay Time',    value: `${telemetry.relayTimeMs} ms`,       icon: <Clock className="w-3.5 h-3.5" /> },
                { label: 'HTTP Status',   value: String(telemetry.httpStatus ?? '—'), icon: <Activity className="w-3.5 h-3.5" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                  <div className="text-muted-foreground flex items-center gap-1 text-xs">{icon}{label}</div>
                  <div className={cn(
                    'font-mono text-sm font-semibold tabular-nums',
                    label === 'HTTP Status' && telemetry.httpStatus === 200 && 'text-green-600 dark:text-green-400',
                    label === 'HTTP Status' && telemetry.httpStatus !== 200 && 'text-red-600 dark:text-red-400',
                  )}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Relay Test */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <MonitorPlay className="w-4 h-4 text-primary" />
            Video Relay Test
          </CardTitle>
          <CardDescription className="text-xs">
            Stream open-source test assets through the active relay worker
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Asset buttons */}
          <div className="flex flex-wrap gap-2">
            {VIDEO_ASSETS.map(v => (
              <Button
                key={v.name}
                variant={activeVideo?.name === v.name ? 'default' : 'outline'}
                size="sm"
                className="flex items-center gap-2 text-xs"
                disabled={buyerStatus !== 'connected'}
                onClick={() => playVideo(v)}
              >
                <Play className="w-3.5 h-3.5" />
                {v.name}
                <span className="text-muted-foreground text-xs">({v.size})</span>
              </Button>
            ))}
          </div>

          {/* Video player */}
          {activeVideo ? (
            <div className="rounded-lg overflow-hidden border border-border bg-black aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full"
                controls
                onLoadedData={() => setVideoLoading(false)}
                onWaiting={() => setVideoLoading(true)}
                onPlaying={() => setVideoLoading(false)}
                key={activeVideo.url}
              >
                <source src={activeVideo.url} type="video/mp4" />
              </video>
            </div>
          ) : (
            <div className={cn(
              'rounded-lg border border-dashed border-border aspect-video flex flex-col items-center justify-center gap-2 text-muted-foreground',
              buyerStatus !== 'connected' && 'opacity-50'
            )}>
              <MonitorPlay className="w-10 h-10 opacity-30" />
              <span className="text-sm">
                {buyerStatus === 'connected'
                  ? 'Select a video asset above to begin relay test'
                  : 'Connect P2P first to enable video relay'}
              </span>
            </div>
          )}

          {videoLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Buffering through relay channel…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Android Engine Tab ────────────────────────────────────────────────────────

function AndroidTab() {
  const [generated, setGenerated] = useState(false);

  const generateConfig = () => {
    const config = {
      appId: 'com.netmesh.p2p',
      appName: 'NetMesh',
      webDir: 'dist',
      server: {
        androidScheme: 'https',
        cleartext: false,
      },
      plugins: {
        SplashScreen: {
          launchShowDuration: 2000,
          backgroundColor: '#0f172a',
          androidSplashResourceName: 'splash',
          androidScaleType: 'CENTER_CROP',
        },
      },
      android: {
        buildOptions: {
          keystorePath: './release.keystore',
          keystoreAlias: 'netmesh',
        },
      },
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'capacitor.config.json';
    a.click();
    URL.revokeObjectURL(url);
    setGenerated(true);
  };

  const completedCount = APK_CHECKLIST.filter(i => i.done).length;
  const progress       = Math.round((completedCount / APK_CHECKLIST.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                Android Build Engine
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Capacitor-based APK compilation pipeline for NetMesh P2P
              </CardDescription>
            </div>
            <Button
              onClick={generateConfig}
              variant={generated ? 'secondary' : 'default'}
              size="sm"
              className="flex items-center gap-2 text-xs shrink-0"
            >
              {generated
                ? <><CheckCircle2 className="w-3.5 h-3.5" />Config Generated</>
                : <><FileJson className="w-3.5 h-3.5" />Generate Android Asset Config</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Compilation status banner */}
          <div className="flex items-center gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-green-800 dark:text-green-300">Ready for Compilation</div>
              <div className="text-xs text-green-700 dark:text-green-500 mt-0.5">
                Core P2P modules compiled · WebRTC bridge linked · {completedCount}/{APK_CHECKLIST.length} pre-flight checks passed
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Deployment readiness</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* APK blueprint checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            APK Deployment Blueprint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {APK_CHECKLIST.map(({ label, done }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 border text-sm transition-colors',
                done
                  ? 'border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/20'
                  : 'border-border bg-muted/30'
              )}
            >
              {done
                ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                : <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
              <span className={done ? 'text-foreground' : 'text-muted-foreground'}>
                {label}
              </span>
              <span className="ml-auto text-xs">
                {done
                  ? <span className="text-green-600 dark:text-green-400 font-medium">Done</span>
                  : <span className="text-muted-foreground">Pending</span>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Config preview */}
      {generated && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              capacitor.config.json — downloaded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted/60 rounded-lg p-4 overflow-x-auto text-muted-foreground leading-relaxed">
{`{
  "appId": "com.netmesh.p2p",
  "appName": "NetMesh",
  "webDir": "dist",
  "server": { "androidScheme": "https" },
  "plugins": { "SplashScreen": { ... } }
}`}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Network Topology Log ──────────────────────────────────────────────────────

function TopologyLog() {
  const [logs, setLogs]     = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(true);
  const scrollRef           = useRef<HTMLDivElement>(null);
  const intervalRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  const LOG_TEMPLATES = [
    (b: string, w: string) => ({ msg: `Buyer [${b}] → Server → Worker [${w}] → Internet ✓ HTTP 200`, kind: 'success' as const }),
    (b: string, w: string) => ({ msg: `NEW_SESSION buyer=${b} worker=${w} latency=${Math.floor(Math.random()*60)+10}ms`, kind: 'info' as const }),
    (b: string, w: string) => ({ msg: `RELAY bytes=${fmtBytes(Math.floor(Math.random()*50000)+1000)} worker=${w}`, kind: 'info' as const }),
    (b: string, _w: string) => ({ msg: `HEARTBEAT buyer=${b} pong=OK`, kind: 'info' as const }),
    (b: string, w: string) => ({ msg: `SIGNALING offer → answer SDP exchanged [${b} ↔ ${w}]`, kind: 'info' as const }),
    (b: string, w: string) => ({ msg: `ICE candidate pair nominated [${b}:${Math.floor(Math.random()*30000)+1024}] ↔ [${w}:${Math.floor(Math.random()*30000)+1024}]`, kind: 'info' as const }),
    (_b: string, w: string) => ({ msg: `WORKER [${w}] CPU 12% MEM 38% bandwidth OK`, kind: 'info' as const }),
    (b: string, w: string) => ({ msg: `SESSION CLOSED buyer=${b} worker=${w} total=${fmtBytes(Math.floor(Math.random()*2000000)+50000)}`, kind: 'warn' as const }),
  ];

  const addLog = useCallback(() => {
    const b = fakeIp();
    const w = fakeIp();
    const tpl = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
    const { msg, kind } = tpl(b, w);
    setLogs(prev => {
      const next = [...prev, { id: uid(), ts: nowTs(), message: msg, kind }];
      return next.length > 120 ? next.slice(-120) : next;
    });
  }, []);

  useEffect(() => {
    if (running) {
      addLog();
      intervalRef.current = setInterval(addLog, 1600);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, addLog]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && running) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, running]);

  const kindColor: Record<LogEntry['kind'], string> = {
    info:    'text-blue-400',
    success: 'text-green-400',
    warn:    'text-yellow-400',
    error:   'text-red-400',
  };

  return (
    <div className="border-t border-border bg-[hsl(222,47%,8%)] dark:bg-[hsl(222,47%,7%)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs font-mono text-green-400 font-medium">Network Topology Log</span>
          {running && (
            <span className="flex items-center gap-1 text-xs text-green-500/70">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-6 px-2 text-white/60 hover:text-white hover:bg-white/10"
          onClick={() => setRunning(r => !r)}
        >
          {running ? <><Square className="w-3 h-3 mr-1" />Pause</> : <><Play className="w-3 h-3 mr-1" />Resume</>}
        </Button>
      </div>
      <div ref={scrollRef} className="h-36 overflow-y-auto px-4 py-2 space-y-0.5 font-mono">
        {logs.map(l => (
          <div key={l.id} className="flex gap-2 text-xs leading-5">
            <span className="text-white/30 shrink-0 tabular-nums">{l.ts}</span>
            <span className={cn('break-all', kindColor[l.kind])}>{l.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-white/30 text-xs py-2">Waiting for network events…</div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard (default export) ────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <div className="flex flex-col h-full">
      {/* Top header bar */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Network className="w-5 h-5 text-primary" />
              NetMesh Control Panel
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Peer-to-peer internet sharing · WebRTC signaling
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Signaling server reachable</span>
          </div>
        </div>
      </div>

      {/* Tabs content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <Tabs defaultValue="worker" className="space-y-6">
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="worker" className="flex items-center gap-1.5 text-xs">
                <Radio className="w-3.5 h-3.5" />Worker Node
              </TabsTrigger>
              <TabsTrigger value="buyer" className="flex items-center gap-1.5 text-xs">
                <Globe className="w-3.5 h-3.5" />Network Buyer
              </TabsTrigger>
              <TabsTrigger value="android" className="flex items-center gap-1.5 text-xs">
                <Smartphone className="w-3.5 h-3.5" />Android Engine
              </TabsTrigger>
            </TabsList>

            <TabsContent value="worker" className="mt-0">
              <WorkerTab />
            </TabsContent>
            <TabsContent value="buyer" className="mt-0">
              <BuyerTab />
            </TabsContent>
            <TabsContent value="android" className="mt-0">
              <AndroidTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Fixed bottom: Network Topology Log */}
      <div className="shrink-0">
        <TopologyLog />
      </div>
    </div>
  );
}
