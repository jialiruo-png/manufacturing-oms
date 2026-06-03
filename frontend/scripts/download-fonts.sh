#!/usr/bin/env bash
# 下载 4 个 Web Font 到 frontend/public/fonts/，用于 Win/Mac UI 一致性兜底。
# 来源：jsdelivr CDN（国内可访问），版本 latest 的 @fontsource-variable/* 包。
# 字体 license：均为 SIL OFL / Apache 2.0，可自由商用。
#
# 用法：
#   cd /Users/damowang/Desktop/manufacturing-oms-v5
#   bash frontend/scripts/download-fonts.sh
#
# Mac 用户：执行完毕后字体只在 Win 上生效（@font-face 通过 local() 让 Mac 不下载）。

set -e

DEST="$(cd "$(dirname "$0")/.." && pwd)/public/fonts"
mkdir -p "$DEST"

echo "→ 下载字体到 $DEST"
echo

download() {
  local url="$1"
  local out="$2"
  if [ -f "$DEST/$out" ]; then
    echo "  ✓ $out 已存在，跳过"
    return
  fi
  echo "  ⬇  $out"
  curl -fsSL --retry 3 --connect-timeout 10 "$url" -o "$DEST/$out"
  local size
  size=$(wc -c <"$DEST/$out" | tr -d ' ')
  echo "     $((size / 1024)) KB"
}

# Inter（西文正文 / Latin 主力）
download \
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2" \
  "Inter-var.woff2"

# Noto Sans SC（思源黑体简体 — 对标 PingFang SC）
# 注意：SC 没有 variable woff2 版本，分 400 / 500 / 700 三档权重下载
# 500 (Medium) 用于 Win 表格主文字加粗（解决 Win 上 14px 中文笔画偏细问题）
download \
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2" \
  "NotoSansSC-400.woff2"
download \
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-500-normal.woff2" \
  "NotoSansSC-500.woff2"
download \
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff2" \
  "NotoSansSC-700.woff2"

# Nunito（圆体数字 — 对标 SF Pro Rounded）
download \
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2" \
  "Nunito-var.woff2"

# JetBrains Mono（等宽 — 对标 SF Mono / Menlo）
download \
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2" \
  "JetBrainsMono-var.woff2"

echo
echo "✓ 全部下载完成"
echo
echo "目录大小："
du -sh "$DEST"
echo
echo "提示：这些字体已通过 .gitignore? 检查后提交（建议入库，避免每次部署重复下载）"
