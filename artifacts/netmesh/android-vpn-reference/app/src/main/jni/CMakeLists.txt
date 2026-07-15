# Skeleton native build config for the tun2socks JNI bridge.
# UNBUILT / UNTESTED — adjust paths/target names to match whichever
# tun2socks library you vendor (recommended: hev-socks5-tunnel).

cmake_minimum_required(VERSION 3.18)
project(netmesh_tun2socks)

# 1. Vendor the library, e.g.:
#      git submodule add https://github.com/heiher/hev-socks5-tunnel \
#          app/src/main/jni/hev-socks5-tunnel
add_subdirectory(hev-socks5-tunnel)

# 2. Write the actual JNI glue (e.g. jni_bridge.c) that implements
#    Java_com_netmesh_vpn_Tun2Socks_start / _stop by calling into the
#    library's public API. This file does not exist yet in this reference.
add_library(tun2socks SHARED
    jni_bridge.c
)

target_link_libraries(tun2socks
    hev-socks5-tunnel
    log
)

target_include_directories(tun2socks PRIVATE
    hev-socks5-tunnel/include
)
