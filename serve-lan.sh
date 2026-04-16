#!/usr/bin/env bash
# 在本机启动静态服务并监听所有网卡（0.0.0.0），便于手机/同一局域网其他电脑访问。
# 用法：在仓库根目录执行  ./serve-lan.sh
# 或指定端口：PORT=9000 ./serve-lan.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
PORT="${PORT:-8080}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo ""
  echo "【错误】端口 ${PORT} 已被占用（Address already in use）。"
  echo "当前占用："
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
  echo ""
  echo "解决任选其一："
  echo "  ① 结束旧进程：kill 上表中的 PID（多为之前未关的 python http.server）"
  echo "  ② 换端口启动：PORT=8081 ./serve-lan.sh"
  echo ""
  exit 1
fi

echo ""
echo "======== 局域网访问说明 ========"
echo "127.0.0.1 只有本机能打开。其他设备请使用下面带 192.168.x.x 的地址。"
echo ""
LAN_IPS=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2}' | sort -u || true)
if [ -n "${LAN_IPS:-}" ]; then
  echo "可在局域网访问（任选一条）："
  while IFS= read -r IP; do
    [ -n "$IP" ] || continue
    echo "  http://${IP}:${PORT}/index.html"
  done <<< "$LAN_IPS"
else
  echo "未自动识别到局域网 IP。可手动执行：ifconfig | grep 'inet '"
fi
echo ""
echo "本机预览: http://127.0.0.1:${PORT}/index.html"
echo ""
echo "若仍打不开：① 手机与电脑同一 Wi‑Fi ② 系统设置 → 网络 → 防火墙 允许 python3 传入连接"
echo "③ 使用 Supabase 时：Supabase 控制台 → Authentication → URL 配置 → Redirect URLs"
echo "   添加 http://你的局域网IP:${PORT}/**"
echo ""
exec python3 -m http.server "$PORT" --bind 0.0.0.0
