package com.netmesh.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log

/**
 * The core VPN service. Establishes the TUN interface, starts the native
 * tun2socks engine pointed at it, and starts the local SOCKS5 bridge that
 * forwards resulting connections over the WebRTC DataChannel to a Worker.
 *
 * This class implements the four requested behaviors from the web dashboard's
 * "Smart Network Manager" spec, at the OS level this time instead of the UI
 * simulation in Dashboard.tsx:
 *   - Initialization: mobile data is untouched until establish() succeeds.
 *   - Auto-switch: the TUN interface (and thus system-wide routing) is only
 *     brought up once the WebRTC DataChannel actually reports "open".
 *   - Smart failover: if the DataChannel drops, tear down the TUN interface
 *     so the OS immediately falls back to its normal default route — no
 *     explicit "switch back" step is needed once the VPN interface is gone,
 *     which is what makes the <2s target achievable here.
 *
 * UNBUILT / UNTESTED — see ../../../README.md, especially the Worker-side gap.
 */
class NetMeshVpnService : VpnService() {

    companion object {
        const val ACTION_START = "com.netmesh.vpn.action.START"
        const val ACTION_STOP = "com.netmesh.vpn.action.STOP"
        const val EXTRA_SESSION_CODE = "session_code"

        private const val TAG = "NetMeshVpnService"
        private const val NOTIFICATION_CHANNEL_ID = "netmesh_vpn"
        private const val NOTIFICATION_ID = 1
        private const val LOCAL_SOCKS_PORT = 1080
        private const val TUN_MTU = 1500
    }

    private var tunInterface: ParcelFileDescriptor? = null
    private var tun2socksHandle: Long = -1
    private var socksBridge: WebRtcSocksBridge? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val sessionCode = intent.getStringExtra(EXTRA_SESSION_CODE).orEmpty()
                startForeground(NOTIFICATION_ID, buildNotification("Initializing..."))
                connect(sessionCode)
            }
            ACTION_STOP -> disconnect()
        }
        return START_STICKY
    }

    /**
     * Initialization Phase + Auto-Switch Trigger: connect the WebRTC
     * DataChannel first, keep the OS on its normal default route the whole
     * time, and only call establish() — which is what actually starts
     * capturing system traffic — once the DataChannel reports "open".
     */
    private fun connect(sessionCode: String) {
        val bridge = WebRtcSocksBridge(
            localPort = LOCAL_SOCKS_PORT,
            sessionCode = sessionCode,
            onDataChannelOpen = { onTunnelReady() },
            onDataChannelClosed = { onTunnelDropped() },
        )
        socksBridge = bridge
        bridge.connect() // signals + WebRTC handshake, mirrors tunnel.ts's Buyer flow
    }

    /** Auto-Switch Trigger fired: DataChannel is open, bring up the TUN interface. */
    private fun onTunnelReady() {
        val fd = establishTunInterface() ?: run {
            Log.e(TAG, "Failed to establish TUN interface")
            stopSelf()
            return
        }
        tunInterface = fd
        tun2socksHandle = Tun2Socks.start(fd.fd, "127.0.0.1", LOCAL_SOCKS_PORT, TUN_MTU)
        updateNotification("Tunnel Active - Routing via Worker")
    }

    /**
     * Smart Failover: the DataChannel dropped. Tear the TUN interface down
     * immediately so the device falls back to its normal (mobile data) route
     * without waiting on any additional timer — closing the interface is
     * itself the failover action, which keeps this comfortably under the
     * 2-second target from the web dashboard's failover behavior.
     */
    private fun onTunnelDropped() {
        updateNotification("Connection Lost - Reverting to Mobile Data...")
        teardownTun()
        updateNotification("Mobile Data (Fallback Active)")
    }

    private fun establishTunInterface(): ParcelFileDescriptor? {
        return Builder()
            .setSession("NetMesh VPN")
            .addAddress("10.0.0.2", 32)
            .addRoute("0.0.0.0", 0)   // route everything — this is the "global routing" step
            .addDnsServer("1.1.1.1")
            .addDnsServer("8.8.8.8")
            .setMtu(TUN_MTU)
            .establish()
    }

    private fun teardownTun() {
        if (tun2socksHandle != -1L) {
            Tun2Socks.stop(tun2socksHandle)
            tun2socksHandle = -1
        }
        tunInterface?.close()
        tunInterface = null
    }

    private fun disconnect() {
        teardownTun()
        socksBridge?.close()
        socksBridge = null
        updateNotification("Idle")
        stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        teardownTun()
        socksBridge?.close()
        super.onDestroy()
    }

    // ── Foreground notification (required by Android for any VpnService) ──────

    private fun buildNotification(status: String): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID, "NetMesh VPN", NotificationManager.IMPORTANCE_LOW,
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        return Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("NetMesh VPN")
            .setContentText("System Status: $status")
            .setSmallIcon(android.R.drawable.ic_lock_lock) // replace with a real app icon
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(status: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(status))
    }
}
