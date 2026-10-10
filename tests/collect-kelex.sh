#!/bin/bash
# kelexs 增量采集守护：探测解封 → 自动启动任务（每 8 分钟一轮，最多 10 轮）
for i in $(seq 1 10); do
  R=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" "https://www.kelexs.com/book/B00JIGK.html" 2>/dev/null)
  echo "[$(date '+%H:%M:%S')] 内页探测: HTTP $R"
  if [ "$R" = "200" ]; then
    cd /home/z/my-project && bun tests/create-kelex-task-final.ts
    exit 0
  fi
  sleep 480
done
echo "等待超时"
exit 1
