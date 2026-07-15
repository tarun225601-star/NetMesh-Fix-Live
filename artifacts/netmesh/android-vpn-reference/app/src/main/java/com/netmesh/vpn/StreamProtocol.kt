package com.netmesh.vpn

/**
 * Mirrors the stream-multiplex protocol extension documented in
 * ../../../README.md ("Protocol extension"). The existing web tunnel
 * (`artifacts/netmesh/src/lib/tunnel.ts`) does not implement this yet — these
 * are the message shapes a Node-based native Worker relay would need to
 * speak to interoperate with `WebRtcSocksBridge`.
 *
 * Framing: JSON control messages and raw binary data frames share the same
 * RTCDataChannel, exactly like the existing binary-video-transfer protocol in
 * tunnel.ts. Binary "stream-data" frames are NOT plain JSON — they are:
 *
 *   [ 16 bytes: stream id, UTF-8, space-padded ][ remaining bytes: payload ]
 *
 * so the receiver can demultiplex without parsing JSON on the hot path.
 */

const val STREAM_ID_HEADER_BYTES = 16

sealed class StreamControlMessage {
    abstract val type: String
    abstract val id: String

    /** Buyer → Worker: open a new logical connection. */
    data class StreamOpen(
        override val id: String,
        val host: String,
        val port: Int,
        val proto: String, // "tcp" | "udp"
    ) : StreamControlMessage() {
        override val type = "stream-open"
    }

    /** Worker → Buyer: the destination connection succeeded. */
    data class StreamOpened(override val id: String) : StreamControlMessage() {
        override val type = "stream-opened"
    }

    /** Either direction: announces a binary data frame is coming (or has
     *  arrived, depending on which side sends it) for this stream id. Some
     *  implementations may skip this and rely purely on the binary header;
     *  it's kept here for symmetry with the existing binary-video protocol's
     *  binary-start/binary-end control messages. */
    data class StreamData(override val id: String) : StreamControlMessage() {
        override val type = "stream-data"
    }

    /** Worker → Buyer: the destination connection failed. */
    data class StreamError(override val id: String, val error: String) : StreamControlMessage() {
        override val type = "stream-error"
    }

    /** Either direction: the logical connection ended. */
    data class StreamClosed(override val id: String) : StreamControlMessage() {
        override val type = "stream-closed"
    }
}
