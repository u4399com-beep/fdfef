#!/bin/bash
# curl 会话 + VLM 识别 GoEdge 验证码（带重试）：获取通行 cookie 后触发采集
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
JAR=/tmp/kelex-jar.txt
TARGET="https://www.kelexs.com/book/B00JIGK.html"
rm -f $JAR
CHALLENGE_URL=$(curl -sL -c $JAR -b $JAR -A "$UA" -o /tmp/captcha-page.html -w "%{url_effective}" --max-time 20 "$TARGET")
echo "挑战页: ${CHALLENGE_URL:0:80}..."
for i in 1 2 3 4 5; do
  IMG_URL=$(grep -o 'id="ui-captcha-image"[^>]*src="[^"]*"' /tmp/captcha-page.html | grep -o 'src="[^"]*"' | sed 's/src="//;s/"$//' | sed 's/&amp;/\&/g')
  CAP_ID=$(grep -o 'GOEDGE_WAF_CAPTCHA_ID" value="[^"]*"' /tmp/captcha-page.html | sed 's/.*value="//;s/"//')
  [ -z "$IMG_URL" ] && { echo "无验证码页"; break; }
  case "$IMG_URL" in http*) ;; *) IMG_URL="https://www.kelexs.com$IMG_URL";; esac
  curl -s -b $JAR -c $JAR -A "$UA" -o /tmp/captcha.png --max-time 20 "$IMG_URL"
  CODE=$(z-ai vision -p "识别图片验证码中的全部字符（数字与字母，区分大小写，注意 0/O、1/l/I 易混）。只输出验证码字符本身，不要任何其他文字。" -i /tmp/captcha.png 2>/dev/null | sed -n '/^{/,$p' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'], end='')" | tr -cd 'a-zA-Z0-9' | head -c 8)
  echo "[尝试$i] captcha=$CAP_ID 识别=$CODE"
  [ -z "$CODE" ] && continue
  # 表单无 action → 提交到挑战页自身（含完整 query）
  curl -s -b $JAR -c $JAR -A "$UA" -e "$CHALLENGE_URL" -o /tmp/captcha-post.html -w "[尝试$i] POST HTTP %{http_code} | " --max-time 20 -d "GOEDGE_WAF_CAPTCHA_ID=$CAP_ID&GOEDGE_WAF_CAPTCHA_CODE=$CODE" "$CHALLENGE_URL"
  curl -s -b $JAR -c $JAR -A "$UA" -o /tmp/after-verify.html -w "复测 HTTP %{http_code} %{size_download}B\n" --max-time 20 "$TARGET"
  SIZE=$(stat -c%s /tmp/after-verify.html)
  if [ "$SIZE" -gt 5000 ] && ! grep -q "GOEDGE_WAF" /tmp/after-verify.html; then
    echo "✓ 验证通过！通行 cookie："
    grep -v "^#" $JAR | awk '{print $6"="$7}'
    echo "JAR_FILE=$JAR"
    exit 0
  fi
  # 失败：重新拉验证页刷新验证码
  CHALLENGE_URL=$(curl -sL -b $JAR -c $JAR -A "$UA" -o /tmp/captcha-page.html -w "%{url_effective}" --max-time 20 "$TARGET")
done
echo "5 次尝试均失败"
exit 1
