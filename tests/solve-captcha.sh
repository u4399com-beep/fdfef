#!/bin/bash
# curl 会话 + VLM 识别 GoEdge 验证码：获取通行 cookie
set -e
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
JAR=/tmp/kelex-jar.txt
TARGET="https://www.kelexs.com/book/B00JIGK.html"
rm -f $JAR
# 1) 访问内页 → 307 → 验证页（保留 session）
FINAL=$(curl -sL -c $JAR -b $JAR -A "$UA" -o /tmp/captcha-page.html -w "%{url_effective}" --max-time 20 "$TARGET")
echo "挑战页: $FINAL"
# 2) 提取 captcha 图片地址与 captcha id
IMG_URL=$(grep -o 'id="ui-captcha-image"[^>]*src="[^"]*"' /tmp/captcha-page.html | grep -o 'src="[^"]*"' | sed 's/src="//;s/"$//' | sed 's/&amp;/\&/g')
CAP_ID=$(grep -o 'GOEDGE_WAF_CAPTCHA_ID" value="[^"]*"' /tmp/captcha-page.html | sed 's/.*value="//;s/"//')
echo "captcha id: $CAP_ID"
[ -z "$IMG_URL" ] && echo "未找到验证码图" && exit 1
case "$IMG_URL" in http*) ;; *) IMG_URL="https://www.kelexs.com$IMG_URL";; esac
# 3) 下载验证码图片
curl -s -b $JAR -c $JAR -A "$UA" -o /tmp/captcha.png --max-time 20 "$IMG_URL"
echo "captcha img: $(stat -c%s /tmp/captcha.png) bytes"
# 4) VLM 识别
CODE=$(z-ai vision -p "识别图片验证码中的全部字符（数字与字母，区分大小写，注意 0/O、1/l/I 易混）。只输出验证码字符本身，不要任何其他文字。" -i /tmp/captcha.png 2>/dev/null | sed -n '/^{/,$p' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'], end='')" | tr -cd 'a-zA-Z0-9' | head -c 8)
echo "VLM 识别: $CODE"
[ -z "$CODE" ] && exit 1
# 5) 提交验证
curl -s -b $JAR -c $JAR -A "$UA" -o /tmp/captcha-post.html -w "POST: HTTP %{http_code}\n" --max-time 20 -d "GOEDGE_WAF_CAPTCHA_ID=$CAP_ID&GOEDGE_WAF_CAPTCHA_CODE=$CODE" "$FINAL"
# 6) 验证内页
curl -s -b $JAR -c $JAR -A "$UA" -o /tmp/after-verify.html -w "内页复测: HTTP %{http_code} %{size_download}B\n" --max-time 20 "$TARGET"
grep -o "<title>[^<]*</title>" /tmp/after-verify.html | head -1
echo "JAR:"; cat $JAR
