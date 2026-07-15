# NetMesh Android VPN — Reference Implementation

**Status: unbuilt, untested reference source.** This folder is documentation and
source code only. Replit's Expo/Android tooling cannot compile or run a custom
native module (see "Why this can't live in the main Expo app" below), so
nothing here is wired into a Replit workflow, and none of it has been compiled
or exercised. Take it into Android Studio (or another real native Android
build environment) to build, sign, and test it.

## What this gives you

A real Android `VpnService` that:
1. Captures **all** device traffic into a TUN interface (`10.0.0.2/32`, default
   route `0.0.0.0/0`, DNS `1.1.1.1`/`8.8.8.8`).
2. Feeds raw IP packets into a proven native tun2socks stack, which turns them
   into ordinary SOCKS5 TCP/UDP connections (see "Native tun2socks dependency").
3. Runs a small local SOCKS5 server in Kotlin that accepts those connections
   and multiplexes each one as a logical stream over the **same WebRTC
   DataChannel** NetMesh's web app already establishes between Buyer and
   Worker — using a new stream-multiplex extension to the existing protocol
   (see `StreamProtocol.kt` and "Protocol extension" below).

## ⚠️ The Worker-side gap — read this before building

NetMesh's existing Worker is a **website running in a browser tab**
(`artifacts/netmesh`, using `fetch()` inside `tunnel.ts`). Browsers have no
API to open a raw TCP or UDP socket to an arbitrary host:port — `fetch` only
speaks HTTP(S) to whatever URL you give it. That's a hard sandboxing rule of
every browser engine, not a missing feature.

That means: even with this Android app perfectly capturing and multiplexing
every packet on the device, **today's browser-based Worker can only serve the
streams it already knows how to handle — HTTP(S) fetches** — not "any TCP
connection to any host/port" the way YouTube, other apps, or raw DNS/QUIC
traffic need.

To make the "route everything through the Worker's connection" promise real
end-to-end, the Worker side also needs to stop being a browser tab and become
a process that can open real sockets — e.g. a small Node.js relay app running
on the Worker's machine. That piece is NOT included here, but unlike this
Android code, it's fully buildable and testable inside Replit (Node can open
real `net.Socket`/`dgram.Socket` connections). It's a natural next step once
this Android client exists — ask if you want it built.

Without that upgrade, wiring this Android app to the *current* web Worker
will only successfully proxy plain HTTP(S) requests the Worker's `fetch()` can
serve, not arbitrary system-wide traffic.

## Why this can't live in the main Expo/Replit app

- `VpnService` is a native Android API. Using it requires compiled
  Kotlin/Java baked into the app binary — a "custom native module."
- Expo Go (the only way to run/preview an Expo app inside this Replit
  workspace) cannot load custom native modules under any circumstances.
- Building a custom native module normally means an EAS Build (cloud) or a
  local Android Studio/Gradle build. EAS CLI commands are disabled in this
  environment, and Replit's Expo Launch publishing flow only submits to the
  iOS App Store — Android native builds aren't supported here at all.

So this is plain Kotlin/Android source, structured as a standalone Android
Studio project skeleton, meant to be built entirely outside Replit.

## Native tun2socks dependency

Writing a correct, production-safe userspace TCP/IP stack (retransmission,
congestion control, out-of-order delivery, UDP) from scratch is a multi-month
undertaking and an easy place to introduce subtle, hard-to-detect bugs. Every
real shipping app that does this (WireGuard, Shadowsocks-Android, V2rayNG)
embeds a battle-tested native library instead of hand-rolling one. This
reference follows that same practice rather than pretending a from-scratch
implementation is production-ready:

- Recommended library: [`hev-socks5-tunnel`](https://github.com/heiher/hev-socks5-tunnel)
  (small, permissive MIT license, actively maintained, used by several
  shipping Android VPN apps).
- `Tun2Socks.kt` is a thin JNI wrapper around it. You'll need to:
  1. Add the library as a git submodule or vendored source under `app/src/main/jni/hev-socks5-tunnel/`.
  2. Wire it up via the provided `CMakeLists.txt` skeleton.
  3. Confirm the native method signatures in `Tun2Socks.kt` match the JNI
     bridge you generate (this reference sketches the expected shape; you
     will need to write the actual `.c`/`.cpp` glue that calls into the
     library and exposes it to `Tun2Socks.kt`'s `external fun`s).

## Files

| File | Responsibility |
|---|---|
| `AndroidManifest.snippet.xml` | Permission + service declaration to merge into your manifest |
| `MainActivity.kt` | Requests the VPN permission dialog (`VpnService.prepare`), starts/stops the service |
| `NetMeshVpnService.kt` | Establishes the TUN interface, runs the foreground notification, starts tun2socks + the SOCKS bridge |
| `Tun2Socks.kt` | JNI wrapper around the native tun2socks library |
| `WebRtcSocksBridge.kt` | Local Kotlin SOCKS5 server; multiplexes each accepted connection onto the WebRTC DataChannel |
| `StreamProtocol.kt` | Message shapes for the new stream-multiplex protocol extension |
| `app/src/main/jni/CMakeLists.txt` | Skeleton native build config for the tun2socks JNI bridge |

## Protocol extension

The existing `tunnel.ts` protocol handles one JSON request/response at a time
plus a single binary transfer. Real TCP proxying needs many concurrent
streams, so this reference defines new message types (mirrored in
`StreamProtocol.kt`):

```
Buyer → Worker:
  { type: 'stream-open',  id, host, port, proto: 'tcp' | 'udp' }
  { type: 'stream-data',  id }               // followed by a raw binary frame on the same channel, first 16 bytes = stream id (UTF-8, padded)
  { type: 'stream-close', id }

Worker → Buyer:
  { type: 'stream-opened', id }
  { type: 'stream-data',   id }              // + binary frame, same framing
  { type: 'stream-error',  id, error }
  { type: 'stream-closed', id }
```

This is a specification only — the Worker side (`tunnel.ts`) does not yet
implement these message types. It currently only proxies single HTTP
request/response pairs and the one-shot video binary transfer used by the
Video Performance Test. Implementing the Worker side of this protocol is part
of the Node relay upgrade described above.

## Build steps (outside Replit)

1. Create a new Android Studio project (Kotlin, min SDK 24+).
2. Copy `app/src/main/java/com/netmesh/vpn/*.kt` into your project's package.
3. Merge `AndroidManifest.snippet.xml` into `app/src/main/AndroidManifest.xml`.
4. Add a WebRTC dependency capable of running on the JVM/Android — e.g.
   `implementation("io.github.webrtc-sdk:android:125.6422.06.1")` (or the
   `org.webrtc:google-webrtc` artifact) — to open a DataChannel to the same
   signaling server NetMesh's web app uses.
5. Vendor `hev-socks5-tunnel` under `app/src/main/jni/` and wire it via the
   provided `CMakeLists.txt` skeleton; write the JNI glue matching
   `Tun2Socks.kt`'s external function signatures.
6. Point `WebRtcSocksBridge` at your signaling server URL (the same one
   `artifacts/api-server` runs) and the session code shown in the web
   Worker's UI.
7. Build, install on a physical device or emulator with Play Services, and
   test manually — none of this has been run.
