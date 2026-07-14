/**
 * NetMesh Dashboard — P2P Internet Tunneling
 *
 * Worker mode: acts as the internet relay (answerer).
 *   1. Registers with the signaling server → receives a session code.
 *   2. Waits for a Buyer to join.
 *   3. Completes the WebRTC handshake automatically.
 *   4. Serves HTTP proxy requests from the Buyer via its own internet.
 *   5. Keep-alive: pings the DataChannel every 20 s + Screen Wake Lock.
 *
 * Buyer mode: consumes the tunnel (offerer).
 *   1. Enters the Worker's session code → clicks Connect once.
 *   2. Completes the WebRTC handshake automatically.
 *   3. Tunnel is live — all test fetches route through the Worker.
 *   4. Downloads PAC / proxy script for OS-level routing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Wifi, WifiOff, Radio, Globe, Loader2, CheckCircle2,
  AlertCircle, Copy, Download, Terminal, Zap, Shield,
  ArrowRightLeft, Play, Square, Network, Activity,
  RefreshCw, Lock, FileCode2, Battery, SignalHigh, Gauge,
  Film, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignalClient } from '@/lib/signal';
import { WebRTCTunnel, type TunnelPhase, type LogKind } from '@/lib/tunnel';
import { KeepAliveManager } from '@/lib/keepalive';
import { generatePAC, downloadPAC, generateProxyScript, downloadScript } from '@/lib/pacfile';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  ts: string;
  msg: string;
  kind: LogKind;
}

interface TunnelStats {
  requests: number;
  bytes: number;
  startedAt: Date | null;
  uptime: string;
}

// ── Network providers ─────────────────────────────────────────────────────────
// Browsers do not expose the actual mobile carrier name to web pages (no
// public API for this, for privacy reasons) — so the Worker selects their
// own network from this list, and it's announced to the Buyer once the
// tunnel is live.

const NETWORK_PROVIDERS = ['Jio', 'Airtel', 'Vi', 'BSNL', 'Wi-Fi', 'Other'] as const;

const NETWORK_STORAGE_KEY = 'netmesh:networkProvider';

// ── Video performance test tiers ────────────────────────────────────────────
// Real, CORS-enabled sample videos of increasing size, used to test tunnel
// throughput at different bandwidths. Each is fetched by the Worker and
// streamed to the Buyer over the RTCDataChannel in 16 KB pieces.

interface VideoTier {
  key: string;
  label: string;
  approxSize: string;
  url: string;
}

const VIDEO_TIERS: VideoTier[] = [
  { key: 'ultra-low', label: 'Ultra-Low', approxSize: '~0.8 MB', url: 'https://mdn.github.io/learning-area/html/multimedia-and-embedding/video-and-audio-content/rabbit320.mp4' },
  { key: 'low',       label: 'Low',       approxSize: '~2.8 MB', url: 'https://download.samplelib.com/mp4/sample-5s.mp4' },
  { key: 'medium',    label: 'Medium',    approxSize: '~10 MB',  url: 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4' },
  { key: 'high',      label: 'High',      approxSize: '~21.6 MB', url: 'https://download.samplelib.com/mp4/sample-30s.mp4' },
  { key: 'hd',        label: 'HD',        approxSize: '~23 MB',  url: 'https://vjs.zencdn.net/v/oceans.mp4' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }
function ts()  { return new Date().toLocaleTimeString('en-US', { hour12: false }); }

function fmtBytes(n: number): string {
  if (n < 1024)    return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

/** Always in MB, per the "Usage: [X] MB" label spec. */
function fmtMB(n: number): string {
  return (n / 1048576).toFixed(2);
}

/** "Mobile Data: Airtel" or "Wi-Fi" — the shared Connection Type label. */
function fmtConnectionType(provider: string): string {
  if (!provider) return 'Unknown';
  return provider === 'Wi-Fi' ? 'Wi-Fi' : `Mobile Data: ${provider}`;
}

function fmtUptime(startedAt: Date | null): string {
  if (!startedAt) return '0s';
  const s = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string, kind: LogKind = 'info') => {
    setLogs(prev => {
      const next = [...prev, { id: uid(), ts: ts(), msg, kind }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return { logs, addLog, scrollRef };
}

// ── Phase badge ───────────────────────────────────────────────────────────────

const PHASE_META: Record<TunnelPhase | 'awaiting' | 'registering', {
  label: string; icon: React.ReactNode; cls: string;
}> = {
  idle:        { label: 'Offline',         icon: <WifiOff className="w-3 h-3" />,                cls: 'bg-muted text-muted-foreground' },
  registering: { label: 'Registering…',    icon: <Loader2 className="w-3 h-3 animate-spin" />,   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  awaiting:    { label: 'Awaiting Buyer',  icon: <Radio className="w-3 h-3 animate-pulse" />,    cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  signaling:   { label: 'Signaling…',      icon: <Loader2 className="w-3 h-3 animate-spin" />,   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  connecting:  { label: 'ICE Connecting…', icon: <Activity className="w-3 h-3 animate-pulse" />, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
  connected:   { label: 'Tunnel Live',     icon: <Wifi className="w-3 h-3" />,                   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  failed:      { label: 'Failed',          icon: <AlertCircle className="w-3 h-3" />,             cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  closed:      { label: 'Closed',          icon: <WifiOff className="w-3 h-3" />,                cls: 'bg-muted text-muted-foreground' },
};

function PhaseBadge({ phase }: { phase: keyof typeof PHASE_META }) {
  const m = PHASE_META[phase] ?? PHASE_META.idle;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', m.cls)}>
      {m.icon}{m.label}
    </span>
  );
}

// ── Log panel (shared) ────────────────────────────────────────────────────────

const LOG_COLOR: Record<LogKind, string> = {
  info:    'text-blue-400',
  success: 'text-green-400',
  warn:    'text-yellow-400',
  error:   'text-red-400',
};

function LogPanel({ logs, scrollRef }: { logs: LogEntry[]; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={scrollRef}
      className="h-44 overflow-y-auto bg-[hsl(222,47%,7%)] rounded-lg p-3 font-mono space-y-0.5"
    >
      {logs.length === 0 && (
        <span className="text-white/30 text-xs">Waiting for events…</span>
      )}
      {logs.map(l => (
        <div key={l.id} className="flex gap-2 text-xs leading-5">
          <span className="text-white/30 shrink-0 tabular-nums">{l.ts}</span>
          <span className={cn('break-all', LOG_COLOR[l.kind])}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Worker Tab ────────────────────────────────────────────────────────────────

function WorkerTab() {
  type WPhase = TunnelPhase | 'awaiting' | 'registering';

  const [phase, setPhase]         = useState<WPhase>('idle');
  const [sessionId, setSessionId] = useState('');
  const [copied, setCopied]       = useState(false);
  const [stats, setStats]         = useState<TunnelStats>({ requests: 0, bytes: 0, startedAt: null, uptime: '0s' });
  const [keepAlive, setKeepAlive] = useState({ active: false, wakeLock: false, media: false, sw: false });
  const [networkProvider, setNetworkProvider] = useState(() => localStorage.getItem(NETWORK_STORAGE_KEY) ?? 'Jio');
  const [dataUsed, setDataUsed]   = useState(0);

  const { logs, addLog, scrollRef } = useLogs();

  const signalRef         = useRef<SignalClient | null>(null);
  const tunnelRef         = useRef<WebRTCTunnel | null>(null);
  const keepAliveRef      = useRef<KeepAliveManager | null>(null);
  const uptimeRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const networkProviderRef = useRef(networkProvider);
  const dataUsedRef       = useRef(0);
  const logTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    networkProviderRef.current = networkProvider;
    localStorage.setItem(NETWORK_STORAGE_KEY, networkProvider);
  }, [networkProvider]);

  // Keep a ref mirror of dataUsed so the 5s log ticker always reads the
  // latest value without needing to be recreated on every update.
  useEffect(() => {
    dataUsedRef.current = dataUsed;
  }, [dataUsed]);

  // Print a running data-usage line into the Worker Log every 5 seconds
  // while the tunnel is live, e.g. "14:40:05  Data usage: 50.00 MB".
  useEffect(() => {
    if (phase === 'connected') {
      logTimerRef.current = setInterval(() => {
        addLog(`Data usage: ${fmtMB(dataUsedRef.current)} MB`, 'info');
      }, 5_000);
    } else if (logTimerRef.current) {
      clearInterval(logTimerRef.current);
      logTimerRef.current = null;
    }
    return () => { if (logTimerRef.current) clearInterval(logTimerRef.current); };
  }, [phase, addLog]);

  // Live uptime ticker
  useEffect(() => {
    if (phase === 'connected') {
      uptimeRef.current = setInterval(() => {
        setStats(s => ({ ...s, uptime: fmtUptime(s.startedAt) }));
      }, 1000);
    } else {
      if (uptimeRef.current) clearInterval(uptimeRef.current);
    }
    return () => { if (uptimeRef.current) clearInterval(uptimeRef.current); };
  }, [phase]);

  const teardown = useCallback(() => {
    keepAliveRef.current?.stop();
    keepAliveRef.current = null;
    tunnelRef.current?.close();
    tunnelRef.current = null;
    signalRef.current?.close();
    signalRef.current = null;
    setKeepAlive({ active: false, wakeLock: false, media: false, sw: false });
    setDataUsed(0); // resets only here — i.e. only when the session actually disconnects
    if (uptimeRef.current) clearInterval(uptimeRef.current);
  }, []);

  const start = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'failed' && phase !== 'closed') return;
    teardown();
    setPhase('registering');
    setStats({ requests: 0, bytes: 0, startedAt: null, uptime: '0s' });
    addLog('Connecting to signaling server…', 'info');

    const signal = new SignalClient();
    signalRef.current = signal;

    try {
      await signal.connect('worker');
    } catch {
      addLog('Cannot reach signaling server — is the API server running?', 'error');
      setPhase('failed');
      return;
    }

    addLog('Registered with signaling server', 'success');

    // Handle all signaling messages
    const tunnel = new WebRTCTunnel();
    tunnelRef.current = tunnel;

    tunnel.onPhaseChange = (p) => {
      if (p === 'connected') {
        const now = new Date();
        setStats(s => ({ ...s, startedAt: now }));
      }
      setPhase(p === 'connecting' ? 'connecting' : p as WPhase);
    };
    tunnel.onLog = addLog;
    tunnel.onStats = (delta) => {
      setStats(s => ({
        ...s,
        requests: s.requests + delta.requests,
        bytes: s.bytes + delta.bytes,
      }));
    };

    signal.onMessage(async (msg) => {
      if (msg.type === 'registered') {
        const id = msg.sessionId as string;
        setSessionId(id);
        setPhase('awaiting');
        addLog(`Session code: ${id}`, 'success');
        addLog('Waiting for a Buyer to connect…', 'info');
        return;
      }

      if (msg.type === 'buyer-joined') {
        addLog('Buyer joined — starting WebRTC handshake…', 'info');
        setPhase('signaling');
        return;
      }

      if (msg.type === 'offer') {
        addLog('Received SDP offer — generating answer…', 'info');
        const answer = await tunnel.answerOffer(
          msg as unknown as RTCSessionDescriptionInit,
          (ice) => signal.send({ type: 'ice', ...ice }),
        );
        signal.send({ type: answer.type, sdp: answer.sdp });
        addLog('Sent SDP answer — waiting for ICE…', 'info');
        return;
      }

      if (msg.type === 'ice') {
        await tunnel.addIceCandidate(msg as unknown as RTCIceCandidateInit);
        return;
      }

      if (msg.type === 'buyer-disconnected') {
        addLog('Buyer disconnected', 'warn');
        tunnel.close();
        setPhase('awaiting');
        return;
      }

      if (msg.type === 'error') {
        addLog(`Signaling error: ${msg.message as string}`, 'error');
        setPhase('failed');
      }
    });

    // Start keep-alive once connected
    tunnel.onPhaseChange = (p) => {
      if (p === 'connected' && !keepAliveRef.current) {
        const ka = new KeepAliveManager();
        keepAliveRef.current = ka;
        void ka.start(() => tunnel.ping()).then(() => {
          setKeepAlive({ active: true, wakeLock: ka.hasWakeLock, media: ka.hasMediaKeepAwake, sw: ka.hasServiceWorker });
        });
        const now = new Date();
        setStats(s => ({ ...s, startedAt: now }));
        // Announce our network provider to the Buyer now that the tunnel is live.
        tunnel.sendNetworkInfo(networkProviderRef.current);
      }
      if (p === 'connected') setPhase('connected');
      else if (p === 'connecting') setPhase('connecting');
      else if (p === 'failed' || p === 'closed') setPhase(p as WPhase);
    };
    tunnel.onLog = addLog;
    tunnel.onStats = (delta) => {
      setStats(s => ({
        ...s,
        requests: s.requests + delta.requests,
        bytes: s.bytes + delta.bytes,
      }));
    };
    tunnel.onDataUsage = (totalBytes) => setDataUsed(totalBytes);

    signal.onClose(() => {
      addLog('Signaling connection closed', 'warn');
    });
  }, [phase, teardown, addLog]);

  const stop = useCallback(() => {
    teardown();
    setPhase('idle');
    setSessionId('');
    addLog('Worker stopped', 'warn');
  }, [teardown, addLog]);

  const copyCode = () => {
    navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const isActive = !['idle', 'failed', 'closed'].includes(phase);

  return (
    <div className="space-y-4">
      {/* Control card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                Worker Node
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Share your internet connection as a P2P relay
              </CardDescription>
            </div>
            <PhaseBadge phase={phase} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {!isActive ? (
              <Button className="flex-1" onClick={start}>
                <Play className="w-4 h-4 mr-2" />
                Start Worker
              </Button>
            ) : (
              <Button variant="destructive" className="flex-1" onClick={stop}>
                <Square className="w-4 h-4 mr-2" />
                Stop Worker
              </Button>
            )}
          </div>

          {/* Network provider selector */}
          <div className="rounded-lg border border-border p-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Your Network Provider
            </p>
            <Select value={networkProvider} onValueChange={setNetworkProvider}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select your network" />
              </SelectTrigger>
              <SelectContent>
                {NETWORK_PROVIDERS.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Shown to the Buyer once connected, since they'll be using your mobile data.
            </p>
          </div>

          {/* Session code */}
          {sessionId && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Session Code — share with Buyer
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-2xl font-mono font-bold text-primary tracking-[0.2em]">
                  {sessionId}
                </code>
                <Button size="sm" variant="outline" onClick={copyCode}>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
          )}

          {/* Stats row */}
          {phase === 'connected' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Requests</p>
                <p className="text-lg font-mono font-semibold mt-1">{stats.requests}</p>
              </div>
              <div className="rounded-md border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Relayed</p>
                <p className="text-lg font-mono font-semibold mt-1">{fmtBytes(stats.bytes)}</p>
              </div>
              <div className="rounded-md border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Uptime</p>
                <p className="text-lg font-mono font-semibold mt-1">{stats.uptime}</p>
              </div>
            </div>
          )}

          {/* Keep-alive status */}
          {keepAlive.active && (
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md px-3 py-2 flex-wrap">
              <Battery className="w-3.5 h-3.5" />
              <span>Keep-alive active — ping every 20 s</span>
              {keepAlive.wakeLock && (
                <span className="ml-1 opacity-70">· Screen wake lock held</span>
              )}
              {keepAlive.media && (
                <span className="ml-1 opacity-70">· Media keep-awake running</span>
              )}
              {keepAlive.sw && (
                <span className="ml-1 opacity-70">· Background heartbeat registered</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Network Monitor — shared, live-synced with the Buyer over the DataChannel */}
      {phase === 'connected' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <SignalHigh className="w-3.5 h-3.5 text-muted-foreground" />
              Network Monitor
            </CardTitle>
            <CardDescription className="text-xs">
              Shared live with the Buyer — both screens show identical numbers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wifi className="w-3.5 h-3.5" />Connection Type
              </span>
              <Badge variant="secondary">{fmtConnectionType(networkProvider)}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gauge className="w-3.5 h-3.5" />Total Data Shared
              </span>
              <span className="text-sm font-mono font-semibold">{fmtBytes(dataUsed)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Measured live from the WebRTC tunnel and synced to the Buyer in real time — resets only when the Worker stops or the Buyer disconnects.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Total Data Used — small always-visible box above the log */}
      {phase === 'connected' && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Gauge className="w-3.5 h-3.5" />Total Data Used
          </span>
          <span className="text-base font-mono font-bold text-primary">{fmtBytes(dataUsed)}</span>
        </div>
      )}

      {/* Live log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            Worker Log
          </CardTitle>
          <CardDescription className="text-xs">
            Logs a running data-usage line every 5 seconds while the tunnel is live
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogPanel logs={logs} scrollRef={scrollRef} />
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-dashed">
        <CardContent className="pt-5 pb-4 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />How Worker mode works
          </p>
          <ul className="space-y-1 ml-5 list-disc">
            <li>Registers with the signaling server and receives a session code.</li>
            <li>When a Buyer connects, a WebRTC DataChannel tunnel is established automatically.</li>
            <li>All HTTP requests from the Buyer are fetched using this device's internet and returned through the tunnel.</li>
            <li>Keep-alive pings prevent the WebRTC connection from being dropped, even when the phone screen is off.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Buyer Tab ─────────────────────────────────────────────────────────────────

function BuyerTab() {
  type BPhase = TunnelPhase | 'signaling';

  const [phase, setPhase]         = useState<BPhase>('idle');
  const [code, setCode]           = useState('');
  const [testUrl, setTestUrl]     = useState('https://api.ipify.org?format=json');
  const [testResult, setTestResult] = useState<{ status: number; body: string } | null>(null);
  const [testing, setTesting]     = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [connectedNetwork, setConnectedNetwork] = useState('');
  const [dataUsed, setDataUsed]   = useState(0);

  // Video performance test — Buyer-only
  const [activeTier, setActiveTier]   = useState<string | null>(null);
  const [videoUrl, setVideoUrl]       = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ received: number; total: number } | null>(null);
  const [videoError, setVideoError]   = useState<string | null>(null);

  const { logs, addLog, scrollRef } = useLogs();

  const signalRef = useRef<SignalClient | null>(null);
  const tunnelRef = useRef<WebRTCTunnel | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  const clearVideo = useCallback(() => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    setVideoUrl(null);
    setActiveTier(null);
    setVideoProgress(null);
    setVideoError(null);
  }, []);

  const teardown = useCallback(() => {
    tunnelRef.current?.close();
    tunnelRef.current = null;
    signalRef.current?.close();
    signalRef.current = null;
    setConnectedNetwork('');
    setDataUsed(0); // resets only here — i.e. only when the session actually disconnects
    clearVideo();
  }, [clearVideo]);

  const connect = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    if (phase !== 'idle' && phase !== 'failed' && phase !== 'closed') return;

    teardown();
    setPhase('signaling');
    setTestResult(null);
    addLog(`Connecting to session ${trimmed}…`, 'info');

    const signal = new SignalClient();
    signalRef.current = signal;

    try {
      await signal.connect('buyer', trimmed);
    } catch {
      addLog('Cannot reach signaling server — is the API server running?', 'error');
      setPhase('failed');
      return;
    }

    const tunnel = new WebRTCTunnel();
    tunnelRef.current = tunnel;

    tunnel.onPhaseChange = (p) => {
      if (p === 'connected') {
        setPhase('connected');
        addLog('Tunnel is live — traffic routing through Worker ✓', 'success');
      } else if (p === 'connecting') {
        setPhase('connecting');
      } else if (p === 'failed' || p === 'closed') {
        setPhase(p);
        addLog(`Tunnel ${p}`, 'warn');
      }
    };
    tunnel.onLog = addLog;
    tunnel.onDataUsage = (totalBytes) => setDataUsed(totalBytes);
    tunnel.onNetworkInfo = (provider) => {
      setConnectedNetwork(provider);
      addLog(`Connected to network: ${provider}`, 'info');
    };

    signal.onMessage(async (msg) => {
      if (msg.type === 'joined') {
        const sid = msg.sessionId as string;
        setSessionId(sid);
        addLog(`Joined session ${sid} — creating offer…`, 'info');

        // Create offer and kick off the handshake automatically
        const offer = await tunnel.createOffer(
          (ice) => signal.send({ type: 'ice', ...ice }),
        );
        signal.send({ type: offer.type, sdp: offer.sdp });
        addLog('Sent SDP offer — waiting for Worker answer…', 'info');
        return;
      }

      if (msg.type === 'answer') {
        addLog('Received SDP answer — completing handshake…', 'info');
        await tunnel.setRemoteAnswer(msg as unknown as RTCSessionDescriptionInit);
        return;
      }

      if (msg.type === 'ice') {
        await tunnel.addIceCandidate(msg as unknown as RTCIceCandidateInit);
        return;
      }

      if (msg.type === 'worker-disconnected') {
        addLog('Worker disconnected', 'warn');
        setPhase('closed');
        teardown();
        return;
      }

      if (msg.type === 'error') {
        addLog(`Error: ${msg.message as string}`, 'error');
        setPhase('failed');
        teardown();
      }
    });

    signal.onClose(() => addLog('Signaling connection closed', 'warn'));
  }, [code, phase, teardown, addLog]);

  const disconnect = useCallback(() => {
    teardown();
    setPhase('idle');
    setSessionId('');
    addLog('Disconnected', 'warn');
  }, [teardown, addLog]);

  const runTest = useCallback(async () => {
    if (!tunnelRef.current || phase !== 'connected') return;
    setTesting(true);
    setTestResult(null);
    addLog(`Test fetch → ${testUrl}`, 'info');
    try {
      const res = await tunnelRef.current.fetch(testUrl);
      setTestResult({ status: res.status, body: res.body.slice(0, 2000) });
      addLog(`← ${res.status} ${res.statusText} (${res.body.length} bytes)`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Test failed: ${msg}`, 'error');
      setTestResult({ status: 0, body: `Error: ${msg}` });
    } finally {
      setTesting(false);
    }
  }, [testUrl, phase, addLog]);

  const runVideoTest = useCallback(async (tier: VideoTier) => {
    if (!tunnelRef.current || phase !== 'connected') return;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    setVideoUrl(null);
    setVideoError(null);
    setActiveTier(tier.key);
    setVideoProgress({ received: 0, total: 0 });
    addLog(`Video test [${tier.label}] → streaming via Worker's connection…`, 'info');

    try {
      const blob = await tunnelRef.current.fetchBinary(tier.url, (received, total) => {
        setVideoProgress({ received, total });
      });
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
      addLog(`Video test [${tier.label}] complete — ${fmtBytes(blob.size)} streamed through tunnel ✓`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setVideoError(msg);
      setActiveTier(null);
      addLog(`Video test [${tier.label}] failed: ${msg}`, 'error');
    }
  }, [phase, addLog]);

  const handleDownloadPAC = () => {
    const content = generatePAC('127.0.0.1', 1080, sessionId);
    downloadPAC(content);
    addLog('PAC file downloaded', 'info');
  };

  const handleDownloadScript = () => {
    const content = generateProxyScript('127.0.0.1', 1080);
    downloadScript(content);
    addLog('Proxy script downloaded', 'info');
  };

  const isConnecting = phase === 'signaling' || phase === 'connecting';
  const isConnected  = phase === 'connected';
  const isActive     = isConnecting || isConnected;

  return (
    <div className="space-y-4">
      {/* Connection card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Network Buyer
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Route your traffic through a Worker's internet connection
              </CardDescription>
            </div>
            <PhaseBadge phase={phase} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Session code  e.g. ALPHA-4821"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && !isActive && connect()}
              disabled={isActive}
              className="font-mono tracking-wider"
            />
            {!isConnected ? (
              <Button
                className="shrink-0"
                onClick={connect}
                disabled={isConnecting || !code.trim()}
              >
                {isConnecting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting…</>
                  : <><Wifi className="w-4 h-4 mr-2" />Connect</>}
              </Button>
            ) : (
              <Button variant="destructive" className="shrink-0" onClick={disconnect}>
                <WifiOff className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            )}
          </div>

          {/* Connected state: tunnel active indicator */}
          {isConnected && (
            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-medium">Tunnel live</span>
              <span className="opacity-70">· HTTP traffic routing through Worker · Session {sessionId}</span>
            </div>
          )}

          {/* Connected-to network label — required format: "Connected to [Worker's Network Name] | Usage: [X] MB" */}
          {isConnected && (
            <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
              <SignalHigh className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono">
                Connected to {connectedNetwork || 'Awaiting network info…'} | Usage: {fmtMB(dataUsed)} MB
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Network Monitor — same figures as the Worker, synced live over the DataChannel */}
      {isConnected && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <SignalHigh className="w-3.5 h-3.5 text-muted-foreground" />
              Network Monitor
            </CardTitle>
            <CardDescription className="text-xs">
              Shared live with the Worker — both screens show identical numbers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wifi className="w-3.5 h-3.5" />Connection Type
              </span>
              <Badge variant="secondary">{fmtConnectionType(connectedNetwork)}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gauge className="w-3.5 h-3.5" />Total Data Shared
              </span>
              <span className="text-sm font-mono font-semibold">{fmtBytes(dataUsed)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Live from the WebRTC connection — this counts against the Worker's mobile data plan.
              Resets only when you disconnect.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Test request panel — shown only when connected */}
      {isConnected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
              Tunnel Test — Fetch via Worker
            </CardTitle>
            <CardDescription className="text-xs">
              Send a real HTTP request through the DataChannel tunnel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://api.ipify.org?format=json"
                className="font-mono text-xs"
              />
              <Button size="sm" onClick={runTest} disabled={testing}>
                {testing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
                <span className="ml-1.5">{testing ? 'Fetching…' : 'Fetch'}</span>
              </Button>
            </div>

            {testResult && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className={cn(
                  'px-3 py-1.5 text-xs font-mono font-medium flex items-center gap-2',
                  testResult.status >= 200 && testResult.status < 300
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
                )}>
                  <Zap className="w-3 h-3" />
                  HTTP {testResult.status} — via WebRTC DataChannel ✓
                </div>
                <pre className="p-3 text-xs font-mono bg-muted/30 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                  {testResult.body}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* OS proxy config — shown only when connected */}
      {isConnected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-primary" />
              OS-Level Proxy Config
            </CardTitle>
            <CardDescription className="text-xs">
              Route all device traffic through the tunnel using a PAC file or proxy script
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm" className="flex gap-2" onClick={handleDownloadPAC}>
                <Download className="w-3.5 h-3.5" />
                Download PAC File
              </Button>
              <Button variant="outline" size="sm" className="flex gap-2" onClick={handleDownloadScript}>
                <FileCode2 className="w-3.5 h-3.5" />
                Download Proxy Script
              </Button>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2 text-xs">
              <p className="font-medium">Manual proxy settings (applies to browsers):</p>
              <div className="font-mono space-y-1 text-muted-foreground">
                <div className="flex gap-2"><span className="text-foreground w-14">SOCKS5</span> 127.0.0.1 : 1080</div>
                <div className="flex gap-2"><span className="text-foreground w-14">HTTP</span>  127.0.0.1 : 8118</div>
              </div>
              <Separator />
              <p className="text-muted-foreground">
                The PAC file routes all non-local traffic through the Worker.
                The shell script configures system-level proxy on macOS / Linux.
                For Android: Settings → Wi-Fi → Proxy → Manual.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Performance Test — Buyer-only: streams real sample videos of
          increasing size through the WebRTC tunnel to gauge throughput. */}
      {isConnected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-primary" />
              Video Performance Test
            </CardTitle>
            <CardDescription className="text-xs">
              Play a sample video at each quality tier to test the Worker's real bandwidth
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {VIDEO_TIERS.map(tier => {
                const isLoadingThis = activeTier === tier.key && !videoUrl && !videoError;
                const isLoadingOther = activeTier !== null && activeTier !== tier.key && !videoUrl && !videoError;
                return (
                  <Button
                    key={tier.key}
                    size="sm"
                    variant={activeTier === tier.key ? 'default' : 'outline'}
                    className="flex flex-col h-auto py-2 gap-0.5"
                    disabled={isLoadingOther}
                    onClick={() => runVideoTest(tier)}
                  >
                    {isLoadingThis
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <span className="text-xs font-semibold">{tier.label}</span>}
                    <span className="text-[10px] opacity-70">{tier.approxSize}</span>
                  </Button>
                );
              })}
            </div>

            {/* Download progress while the tunnel is streaming the file */}
            {activeTier && !videoUrl && !videoError && videoProgress && (
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: videoProgress.total > 0
                        ? `${Math.min(100, (videoProgress.received / videoProgress.total) * 100)}%`
                        : '15%',
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Streaming via tunnel… {fmtBytes(videoProgress.received)}
                  {videoProgress.total > 0 && ` / ${fmtBytes(videoProgress.total)}`}
                </p>
              </div>
            )}

            {videoError && (
              <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Stream failed: {videoError}</span>
              </div>
            )}

            {videoUrl && (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden border border-border bg-black">
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    autoPlay
                    className="w-full max-h-64"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2 h-7 w-7 p-0"
                    onClick={clearVideo}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {/* Required label: makes explicit that playback is powered by the tunnel */}
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground">
                  Streaming Quality Test | Data being used from Worker's connection
                  <div className="mt-0.5 text-foreground">
                    Streaming via Worker: {connectedNetwork || "Unknown"}
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Every byte of the video is fetched by the Worker and relayed to you over the
              same encrypted DataChannel — it counts toward the Worker's data usage above.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Live log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            Buyer Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LogPanel logs={logs} scrollRef={scrollRef} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Dashboard (default export) ────────────────────────────────────────────────

type Mode = 'worker' | 'buyer';

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>('worker');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Network className="w-5 h-5 text-primary" />
              NetMesh · P2P Internet Tunnel
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              WebRTC DataChannel · End-to-end encrypted · No central server
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs text-muted-foreground">Signaling server online</span>
          </div>
        </div>
      </div>

      {/* Mode selector */}
      <div className="px-6 pt-5 pb-0 shrink-0">
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button
            onClick={() => setMode('worker')}
            className={cn(
              'flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all',
              mode === 'worker'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40',
            )}
          >
            <div className="flex items-center gap-2">
              <Radio className={cn('w-4 h-4', mode === 'worker' ? 'text-primary' : 'text-muted-foreground')} />
              <span className="text-sm font-semibold">Worker</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Share your internet · Act as the relay node
            </p>
          </button>

          <button
            onClick={() => setMode('buyer')}
            className={cn(
              'flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all',
              mode === 'buyer'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40',
            )}
          >
            <div className="flex items-center gap-2">
              <Globe className={cn('w-4 h-4', mode === 'buyer' ? 'text-primary' : 'text-muted-foreground')} />
              <span className="text-sm font-semibold">Buyer</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use shared internet · Connect to a Worker
            </p>
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {mode === 'worker' ? <WorkerTab /> : <BuyerTab />}
      </div>
    </div>
  );
}
