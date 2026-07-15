package com.netmesh.vpn

/**
 * JNI wrapper around a native tun2socks implementation.
 *
 * This class defines the Kotlin-side contract only. You must:
 *   1. Vendor a native tun2socks library (recommended: hev-socks5-tunnel,
 *      https://github.com/heiher/hev-socks5-tunnel — MIT licensed, small,
 *      actively maintained) under app/src/main/jni/.
 *   2. Write the C/C++ JNI glue that implements these native methods by
 *      calling into that library, matching the signatures below exactly.
 *   3. Wire the build via the CMakeLists.txt skeleton in app/src/main/jni/.
 *
 * UNBUILT / UNTESTED — no native glue code has been written or compiled.
 * The signatures below are a reasonable starting contract, not a guarantee
 * of what the library you choose actually expects; check its header/API
 * docs and adjust.
 */
object Tun2Socks {

    init {
        // The .so must be named libtun2socks.so and produced by your
        // CMake/NDK build (see app/src/main/jni/CMakeLists.txt).
        System.loadLibrary("tun2socks")
    }

    /**
     * Starts the native tun2socks engine, reading/writing raw IP packets on
     * [tunFd] (the fd from VpnService.Builder#establish()) and forwarding
     * parsed TCP/UDP connections to a SOCKS5 server at [socksHost]:[socksPort]
     * — i.e. WebRtcSocksBridge's local listener.
     *
     * @return an opaque native handle to pass to [stop], or -1 on failure.
     */
    external fun start(tunFd: Int, socksHost: String, socksPort: Int, mtu: Int): Long

    /** Stops the engine started with [start] and releases native resources. */
    external fun stop(handle: Long)
}
