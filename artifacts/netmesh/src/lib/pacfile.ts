/**
 * PAC (Proxy Auto-Config) file generator.
 *
 * Once a Buyer connects to a Worker's tunnel, they can download this PAC
 * file and configure their OS or browser to route all HTTP/HTTPS traffic
 * through the NetMesh relay.
 *
 * Usage:
 *   const pac = generatePAC('203.0.113.42', 1080);
 *   downloadPAC(pac);
 */

export function generatePAC(proxyHost: string, proxyPort: number, sessionId: string): string {
  return `// NetMesh Proxy Auto-Config (PAC) — generated ${new Date().toUTCString()}
// Session: ${sessionId}
//
// HOW TO USE:
//   macOS : System Preferences → Network → Advanced → Proxies → Auto Proxy Config → paste the URL or file path
//   Windows: Settings → Proxy → Use setup script → enter the file:// path
//   Chrome : chrome://settings/system → Open your computer's proxy settings
//   Firefox: about:preferences#general → Network Settings → Automatic proxy configuration URL

function FindProxyForURL(url, host) {
  // Always direct for loopback / link-local
  if (
    isPlainHostName(host) ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    isInNet(host, "169.254.0.0", "255.255.0.0") ||
    isInNet(host, "192.168.0.0", "255.255.0.0") ||
    isInNet(host, "10.0.0.0",   "255.0.0.0")
  ) {
    return "DIRECT";
  }

  // All other traffic → NetMesh Worker tunnel (SOCKS5) with DIRECT fallback
  return "SOCKS5 ${proxyHost}:${proxyPort}; DIRECT";
}
`.replace("${proxyHost}", proxyHost).replace("${proxyPort}", String(proxyPort));
}

export function downloadPAC(content: string, filename = "netmesh.pac") {
  const blob = new Blob([content], { type: "application/x-ns-proxy-autoconfig" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Generate a shell script that configures the OS proxy (Linux / macOS). */
export function generateProxyScript(proxyHost: string, proxyPort: number): string {
  return `#!/usr/bin/env bash
# NetMesh proxy configuration script
# Run this after connecting to set your system proxy.
# Run with --unset to restore defaults.

HOST="${proxyHost}"
PORT="${proxyPort}"

if [[ "$1" == "--unset" ]]; then
  unset http_proxy HTTP_PROXY https_proxy HTTPS_PROXY ALL_PROXY
  gsettings set org.gnome.system.proxy mode 'none' 2>/dev/null || true
  echo "✓ Proxy cleared"
  exit 0
fi

export http_proxy="socks5://$HOST:$PORT"
export HTTP_PROXY="$http_proxy"
export https_proxy="$http_proxy"
export HTTPS_PROXY="$http_proxy"
export ALL_PROXY="$http_proxy"

# GNOME (Linux)
gsettings set org.gnome.system.proxy mode 'manual' 2>/dev/null || true
gsettings set org.gnome.system.proxy.socks host "$HOST" 2>/dev/null || true
gsettings set org.gnome.system.proxy.socks port $PORT 2>/dev/null || true

# macOS
networksetup -setsocksfirewallproxy Wi-Fi "$HOST" $PORT 2>/dev/null || true
networksetup -setsocksfirewallproxystate Wi-Fi on 2>/dev/null || true

echo "✓ NetMesh proxy active — $HOST:$PORT"
echo "  Run '$0 --unset' to disable"
`.replace(/\${proxyHost}/g, proxyHost).replace(/\${proxyPort}/g, String(proxyPort));
}

export function downloadScript(content: string, filename = "netmesh-proxy.sh") {
  const blob = new Blob([content], { type: "text/x-shellscript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
