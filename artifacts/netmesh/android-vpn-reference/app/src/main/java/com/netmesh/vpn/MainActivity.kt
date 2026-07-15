package com.netmesh.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Minimal reference UI: a session-code field, an "Activate VPN Mode" button,
 * and a status line. Wire this up to match NetMesh's actual design system —
 * this is deliberately bare-bones so the VpnService permission flow is easy
 * to follow.
 *
 * UNBUILT / UNTESTED — see ../../README.md.
 */
class MainActivity : Activity() {

    companion object {
        private const val REQUEST_VPN_PERMISSION = 100
    }

    private lateinit var sessionCodeInput: EditText
    private lateinit var statusLabel: TextView
    private lateinit var toggleButton: Button

    private var vpnActive = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Simple programmatic layout — replace with the real NetMesh UI/theme.
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        sessionCodeInput = EditText(this).apply { hint = "Session code, e.g. ALPHA-4821" }
        statusLabel = TextView(this).apply { text = "System Status: Idle" }
        toggleButton = Button(this).apply { text = "Activate VPN Mode" }

        toggleButton.setOnClickListener { onToggleClicked() }

        root.addView(sessionCodeInput)
        root.addView(statusLabel)
        root.addView(toggleButton)
        setContentView(root)
    }

    private fun onToggleClicked() {
        if (vpnActive) {
            stopVpn()
            return
        }

        val sessionCode = sessionCodeInput.text.toString().trim()
        if (sessionCode.isEmpty()) {
            statusLabel.text = "Enter a session code first"
            return
        }

        // Android's VPN permission dialog — the OS-level consent screen that
        // tells the user "NetMesh wants to set up a VPN connection that can
        // monitor network traffic." VpnService.prepare() returns null if
        // permission is already granted, or an Intent to launch otherwise.
        val prepareIntent = VpnService.prepare(this)
        if (prepareIntent != null) {
            startActivityForResult(prepareIntent, REQUEST_VPN_PERMISSION)
        } else {
            startVpn(sessionCode)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_VPN_PERMISSION) {
            if (resultCode == Activity.RESULT_OK) {
                startVpn(sessionCodeInput.text.toString().trim())
            } else {
                statusLabel.text = "VPN permission denied"
            }
        }
    }

    private fun startVpn(sessionCode: String) {
        statusLabel.text = "System Status: Initializing..."
        val intent = Intent(this, NetMeshVpnService::class.java).apply {
            action = NetMeshVpnService.ACTION_START
            putExtra(NetMeshVpnService.EXTRA_SESSION_CODE, sessionCode)
        }
        startForegroundService(intent)
        vpnActive = true
        toggleButton.text = "Deactivate VPN Mode"
        // NetMeshVpnService should broadcast/callback real status changes
        // (Initializing → Tunnel Active → failover, mirroring the web
        // dashboard's SystemStatusBanner) — wire that here instead of this
        // placeholder line once the service's status channel exists.
        statusLabel.text = "System Status: Tunnel Active - Routing via Worker"
    }

    private fun stopVpn() {
        val intent = Intent(this, NetMeshVpnService::class.java).apply {
            action = NetMeshVpnService.ACTION_STOP
        }
        startService(intent)
        vpnActive = false
        toggleButton.text = "Activate VPN Mode"
        statusLabel.text = "System Status: Idle"
    }
}
