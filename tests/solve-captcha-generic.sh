#!/bin/bash
# 通用 GoEdge WAF 验证码求解器：curl 会话 + VLM 识别（带重试）
# 用法: solve-captcha-generic.sh <domain> <target-url> [jar-file]
# 示例: solve-captcha-generic.sh www.cunshu.la "https://www.cunshu.la/library.php?sort=latest&page=1"
set -u
DOMAIN="${1:?usage: solve-captcha-generic.sh <domain> <target-url> [jar]}"
TARGET="${2:?usage: solve-captcha-generic.sh <domain> <target-url> [jar]}"
JAR="${3:-/tmp/waf-${DOMAIN//./_}.txt}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
PAGES=/tmp/waf-page-$$.html
rm -f "$JAR"

# 首次访问拿到挑战页
CHALLENGE_URL=$(curl -sL -c "$JAR" -b "$JAR" -A "$UA" -o "$PAGES" -w "%{url_effective}" --max-time 20 "$TARGET")
echo "挑战页: ${CHALLENGE_URL:0:90}"

for i in 1 2 3 4 5 6; do
  IMG_URL=$(grep -o 'id="ui-captcha-image"[^>]*src="[^"]*"' "$PAGES" | grep -o 'src="[^"]*"' | sed 's/src="//;s/"$//;s/&amp;/\&/g')
  CAP_ID=$(grep -o 'GOEDGE_WAF_CAPTCHA_ID" value="[^"]*"' "$PAGES" | sed 's/.*value="//;s/"//')
  if [ -z "$IMG_URL" ]; then
    # 可能已直接通过
    SIZE=$(stat -c%s "$PAGES" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 5000 ] && ! grep -q "GOEDGE_WAF" "$PAGES"; then
      echo "✓ 无需验证，直接访问成功"
      echo "JAR_FILE=$JAR"
      rm -f "$PAGES"; exit 0
    fi
    echo "页面无验证码图片，重拉挑战页"
    CHALLENGE_URL=$(curl -sL -b "$JAR" -c "$JAR" -A "$UA" -o "$PAGES" -w "%{url_effective}" --max-time 20 "$TARGET")
    continue
  fi
  case "$IMG_URL" in http*) ;; *) IMG_URL="https://$DOMAIN$IMG_URL";; esac
  curl -s -b "$JAR" -c "$JAR" -A "$UA" -o /tmp/waf-captcha.png --max-time 20 "$IMG_URL"
  CODE=$(z-ai vision -p "识别图片验证码中的全部字符（数字与字母，区分大小写，注意 0/O、1/l/I 易混）。只输出验证码字符本身，不要任何其他文字。" -i /tmp/waf-captcha.png 2>/dev/null | sed -n '/^{/,$p' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'], end='')" | tr -cd 'a-zA-Z0-9' | head -c 8)
  echo "[尝试$i] captcha_id=${CAP_ID:0:12}… 识别=$CODE"
  [ -z "$CODE" ] && { CHALLENGE_URL=$(curl -sL -b "$JAR" -c "$JAR" -A "$UA" -o "$PAGES" -w "%{url_effective}" --max-time 20 "$TARGET"); continue; }
  # GoEdge 表单无 action → 提交到挑战页自身（含完整 query）
  curl -s -b "$JAR" -c "$JAR" -A "$UA" -e "$CHALLENGE_URL" -o /dev/null -w "[尝试$i] POST HTTP %{http_code} | " --max-time 20 \
    -d "GOEDGE_WAF_CAPTCHA_ID=$CAP_ID&GOEDGE_WAF_CAPTCHA_CODE=$CODE" "$CHALLENGE_URL"
  curl -s -b "$JAR" -c "$JAR" -A "$UA" -o "$PAGES" -w "复测 HTTP %{http_code} %{size_download}B\n" --max-time 20 "$TARGET"
  SIZE=$(stat -c%s "$PAGES")
  if [ "$SIZE" -gt 5000 ] && ! grep -q "GOEDGE_WAF" "$PAGES"; then
    echo "✓ 验证通过！通行 cookie："
    grep -v "^#" "$JAR" | awk '{print $6"="$7}'
    echo "JAR_FILE=$JAR"
    rm -f "$PAGES"; exit 0
  fi
  # 失败：重新拉验证页刷新验证码
  CHALLENGE_URL=$(curl -sL -b "$JAR" -c "$JAR" -A "$UA" -o "$PAGES" -w "%{url_effective}" --max-time 20 "$TARGET")
done
echo "6 次尝试均失败"
rm -f "$PAGES"
exit 1
