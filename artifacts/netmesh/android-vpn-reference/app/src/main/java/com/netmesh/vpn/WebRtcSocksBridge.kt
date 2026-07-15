package com.netmesh.vpn

import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * A local SOCKS5 server (no-auth, CONNECT only) that native tun2socks talks
 * to. Each accepted SOCKS connection becomes one multiplexed logical stream
 * sent over a single WebRTC DataChannel to a Worker, using the protocol in
 * StreamProtocol.kt.
 *
 * IMPORTANT: this class sketches the Kotlin-side control flow and framing.
 * The actual WebRTC PeerConnection/DataChannel setup (creating the offer,
 * exchanging SDP through the same signaling server tunnel.ts's SignalClient
 * uses, handling ICE candidates) is intentionally left as TODOs — porting
 * that handshake logic from tunnel.ts (TypeScript) to a JVM WebRTC binding
 * (e.g. io.github.webrtc-sdk:android) is mechanical but non-trivial, and
 * doing it correctly requires a real device/emulator to test ICE
 * connectivity against, which isn't available in this environment.
 *
 * UNBUILT / UNTESTED — see ../../../README.md.
 */
class WebRtcSocksBridge(
    private val localPort: Int,
    private val sessionCode: String,
    private val onDataChannelOpen: () -> Unit,
    private val onDataChannelClosed: () -> Unit,
) {
    private val executor = Executors.newCachedThreadPool()
    private var serverSocket: ServerSocket? = null
    private val openStreams = ConcurrentHashMap<String, Socket>()

    /**
     * Mirrors BuyerTab's `connect()` in Dashboard.tsx / WebRTCTunnel.createOffer
     * in tunnel.ts:
     *   1. Connect to the signaling server as a "buyer" with [sessionCode].
     *   2. Create a WebRTC offer, exchange SDP + ICE candidates.
     *   3. On DataChannel open → start the local SOCKS5 listener and call
     *      [onDataChannelOpen] (which triggers establish() in NetMeshVpnService).
     *   4. On DataChannel close/failed → call [onDataChannelClosed].
     *
     * TODO: implement using a JVM WebRTC binding. This method currently only
     * starts the local SOCKS listener so the class compiles as a structural
     * reference — it does not actually reach a Worker yet.
     */
    fun connect() {
        startSocksListener()
        // TODO: real WebRTC signaling handshake goes here. Call
        // onDataChannelOpen() only once dc.onopen actually fires, exactly
        // like tunnel.ts's wireDataChannel — do not call it eagerly.
    }

    private fun startSocksListener() {
        val socket = ServerSocket(localPort, 50, java.net.InetAddress.getByName("127.0.0.1"))
        serverSocket = socket
        executor.execute {
            while (!socket.isClosed) {
                val client = try { socket.accept() } catch (e: Exception) { break }
                executor.execute { handleSocksClient(client) }
            }
        }
    }

    /** SOCKS5 handshake: no-auth negotiation + CONNECT command parsing. */
    private fun handleSocksClient(client: Socket) {
        val input = client.getInputStream()
        val output = client.getOutputStream()

        // Greeting: VER(1)=5, NMETHODS(1), METHODS(NMETHODS)
        val greeting = ByteArray(2)
        if (input.read(greeting) != 2) { client.close(); return }
        val nMethods = greeting[1].toInt()
        input.skip(nMethods.toLong())
        output.write(byteArrayOf(0x05, 0x00)) // VER=5, METHOD=no-auth

        // Request: VER(1)=5, CMD(1)=1 (CONNECT), RSV(1)=0, ATYP(1), DST.ADDR, DST.PORT(2)
        val header = ByteArray(4)
        if (input.read(header) != 4) { client.close(); return }
        val atyp = header[3].toInt()
        val host = readSocksAddress(input, atyp) ?: run { client.close(); return }
        val portBytes = ByteArray(2)
        input.read(portBytes)
        val port = ((portBytes[0].toInt() and 0xFF) shl 8) or (portBytes[1].toInt() and 0xFF)

        val streamId = (System.nanoTime().toString() + client.port).take(StreamProtocol_ID_LEN)
            .padEnd(StreamProtocol_ID_LEN)

        openStreams[streamId] = client
        sendStreamOpen(streamId, host, port)

        // Reply: VER=5, REP=0 (succeeded — optimistic; a real implementation
        // should wait for stream-opened/stream-error from the Worker before
        // replying, matching genuine SOCKS5 semantics).
        output.write(byteArrayOf(0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0))

        pumpSocketToDataChannel(streamId, client, input, output)
    }

    private fun readSocksAddress(input: InputStream, atyp: Int): String? = when (atyp) {
        0x01 -> { // IPv4
            val b = ByteArray(4); input.read(b)
            b.joinToString(".") { (it.toInt() and 0xFF).toString() }
        }
        0x03 -> { // domain name
            val len = input.read()
            val b = ByteArray(len); input.read(b)
            String(b, Charsets.UTF_8)
        }
        else -> null // IPv6 (0x04) omitted from this reference for brevity
    }

    /**
     * TODO: send a `stream-open` control message (StreamProtocol.kt) over the
     * DataChannel, then read bytes from [client]'s InputStream and forward
     * each chunk as a `STREAM_ID_HEADER_BYTES`-prefixed binary frame, exactly
     * mirroring tunnel.ts's sendBinaryBytes/handleBinaryChunk pattern but
     * keyed by stream id instead of being a single in-flight transfer.
     */
    private fun sendStreamOpen(streamId: String, host: String, port: Int) {
        // Not implemented — depends on the WebRTC DataChannel from connect().
    }

    /**
     * TODO: pump bytes bidirectionally between the local SOCKS socket and the
     * DataChannel stream identified by [streamId], until either side closes.
     * Incoming binary frames for this id (parsed by header) get written to
     * [output]; bytes read from [input] get framed and sent outbound.
     */
    private fun pumpSocketToDataChannel(
        streamId: String,
        client: Socket,
        input: InputStream,
        output: OutputStream,
    ) {
        // Not implemented — depends on the WebRTC DataChannel from connect().
    }

    fun close() {
        openStreams.values.forEach { it.close() }
        openStreams.clear()
        serverSocket?.close()
        executor.shutdownNow()
        onDataChannelClosed()
    }

    companion object {
        private const val StreamProtocol_ID_LEN = STREAM_ID_HEADER_BYTES
    }
}
