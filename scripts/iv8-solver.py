#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
iv8 cookie 求解器（外部命令，供 fetcher 的 iv8 通道调用）

协议（与 src/lib/collect/fetcher.ts 的 solveCookiesViaIv8 对接）：
  stdin  : JSON {"url": "...", "ua": "Mozilla/5.0 ...", "html": "<可选，省略则自行 GET>", "timeout": 45000}
  stdout : JSON {"ok": true,  "cookies": [{"name","value","domain"?}], "finalUrl": "...", "note"?: "..."}
           JSON {"ok": false, "error": "中文原因"}

原理：目标站返回 200 但 body 是混淆 JS（执行后 document.cookie=计算值并刷新，
即「JS 计算型 cookie 挑战」，如瑞数系 / acw_sc__v2）。本脚本把页面 HTML 喂给
iv8（Python 原生 V8 扩展，C++ 层模拟 BOM/DOM，无需启动真实浏览器），
在补环境里执行站点 JS，取回计算出的通行 cookie，交回 fetcher 重放请求。

安装（服务器一次性）：
  pip install --upgrade iv8 -i https://pypi.org/simple
  （Python 3.9-3.14，Windows x64 / Linux x64+aarch64 / macOS，manylinux 标准轮子）

启用（fetcher 侧，二选一）：
  IV8_ENABLED=1                    —— 使用本脚本（需 python3 在 PATH）
  IV8_COMMAND="python3 /abs/iv8-solver.py"  —— 自定义命令行
本脚本自身可选设 IV8_FETCH_TIMEOUT（秒，默认 20）。
"""

import json
import re
import ssl
import sys
import time
import gzip
import io
import urllib.request
import urllib.error

MAX_HTML_BYTES = 3_000_000
COOKIE_POLL_SECONDS = 8.0
POLL_INTERVAL = 0.25

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def emit(obj):
    """唯一出口：始终输出一行 JSON，退出码恒 0（错误经 ok:false 传达，不让 fetcher 误判崩溃）"""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(0)


def fetch_html(url, ua):
    """自行 GET 挑战页（fetcher 未回传 html 时），收集 Set-Cookie 与最终 URL"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # 部分小说站证书链不规范，求解期放宽
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "text/html,*/*;q=0.8"})
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    try:
        resp = opener.open(req, timeout=20)
        raw = resp.read(MAX_HTML_BYTES + 1)
        if len(raw) > MAX_HTML_BYTES:
            raise ValueError("页面过大")
        if resp.headers.get("Content-Encoding", "").lower() == "gzip" or raw[:2] == b"\x1f\x8b":
            try:
                raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read(MAX_HTML_BYTES)
            except OSError:
                pass
        charset = "utf-8"
        ct = resp.headers.get("Content-Type", "") or ""
        m = re.search(r"charset=([\w-]+)", ct, re.I)
        if m:
            charset = m.group(1)
        else:
            head = raw[:2048].decode("ascii", "ignore")
            m2 = re.search(r'charset=["\']?([\w-]+)', head, re.I)
            if m2:
                charset = m2.group(1)
        html = raw.decode(charset, "replace")
        set_cookies = []
        for item in resp.headers.get_all("Set-Cookie") or []:
            set_cookies.append(item)
        return html, resp.geturl(), set_cookies
    except urllib.error.HTTPError as e:
        # 挑战页常伴 403/412/503：响应体仍是挑战 JS，照常喂给 iv8
        try:
            raw = e.read(MAX_HTML_BYTES + 1)
            if raw[:2] == b"\x1f\x8b":
                raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read(MAX_HTML_BYTES)
            return raw.decode("utf-8", "replace"), url, list(e.headers.get_all("Set-Cookie") or [])
        except Exception as e2:
            raise ValueError(f"HTTP {e.code} 且响应体不可读：{e2}")
    except Exception as e:
        raise ValueError(f"请求失败：{e}")


def parse_set_cookies(lines):
    out = []
    for line in lines or []:
        pair = line.split(";", 1)[0]
        if "=" in pair:
            n, v = pair.split("=", 1)
            n, v = n.strip(), v.strip()
            if n and v and v.lower() not in ("deleted", ""):
                out.append({"name": n, "value": v})
    return out


def parse_js_cookie(cookie_header):
    out = []
    for part in (cookie_header or "").split(";"):
        part = part.strip()
        if "=" in part:
            n, v = part.split("=", 1)
            n, v = n.strip(), v.strip()
            if n:
                out.append({"name": n, "value": v})
    return out


def solve_with_iv8(base_url, ua, html):
    """在 iv8 补环境里执行挑战页 JS，返回 document.cookie 计算结果"""
    import os as _os
    try:
        # iv8 的 C++ 扩展 import 时直写 fd1 打版本 banner（Python 级 redirect 压不住）
        # → OS 级把 fd1 暂时指向 /dev/null，保持 stdout 只有协议 JSON
        devnull = _os.open(_os.devnull, _os.O_WRONLY)
        saved = _os.dup(1)
        _os.dup2(devnull, 1)
        try:
            import iv8  # noqa: PLC0415（延迟导入：错误信息中文友好）
        finally:
            _os.dup2(saved, 1)
            _os.close(devnull)
            _os.close(saved)
    except ImportError:
        raise RuntimeError("iv8 未安装：请在服务器执行 pip install --upgrade iv8 -i https://pypi.org/simple")

    if not hasattr(iv8, "JSContext"):
        raise RuntimeError("iv8 包异常（缺 JSContext），请升级：pip install --upgrade iv8")

    # JSON 字符串字面量即合法 JS 字符串字面量（ensure_ascii 转 \uXXXX 最稳）
    js = (
        "window.__iv8__.page.load({"
        f"baseURL: {json.dumps(base_url)}, "
        f"userAgent: {json.dumps(ua)}, "
        f"html: {json.dumps(html)}"
        "});"
    )
    with iv8.JSContext() as ctx:
        ctx.eval(js)
        # 同步写 cookie 的脚本 load 即完成；setTimeout/事件驱动的脚本靠
        # eventLoop.advance 逻辑时间推进触发（宏任务对齐 HTML spec，
        # advance(15000) 瞬间完成，无需真实等待）。阶梯推进，取到即停。
        last = ""
        for ms in (0, 300, 1000, 5000, 15000):
            try:
                last = ctx.eval("document.cookie") or ""
            except Exception:
                last = ""
            if last.strip():
                return last
            if ms:
                for expr in (f"window.__iv8__.eventLoop.advance({ms})", "window.__iv8__.eventLoop.drainTimers()"):
                    try:
                        ctx.eval(expr)
                    except Exception:
                        pass
        return last


def selftest():
    """--selftest：内置挑战页验证补环境执行链（不依赖外网）"""
    challenge = (
        "<!DOCTYPE html><html><head><script>"
        "var t=function(s){var r='',i;for(i=0;i<s.length;i++){r+=String.fromCharCode(s.charCodeAt(i)^3)}return r};"
        "document.cookie='acw_sc__v2='+t('ABCDEFJK')+'; path=/';"
        "location.reload();"
        "</script></head><body>verify</body></html>"
    )
    cookie = solve_with_iv8("https://selftest.example.com/", DEFAULT_UA, challenge)
    ok = "acw_sc__v2=" in cookie
    emit({
        "ok": ok,
        "cookies": parse_js_cookie(cookie),
        "note": f"selftest {'PASS' if ok else 'FAIL'}，document.cookie={cookie!r}",
    })


def main():
    if "--selftest" in sys.argv:
        selftest()
        return
    try:
        raw = sys.stdin.read()
        req = json.loads(raw or "{}")
    except Exception as e:
        emit({"ok": False, "error": f"stdin JSON 解析失败：{e}"})
        return
    url = (req.get("url") or "").strip()
    if not re.match(r"^https?://", url, re.I):
        emit({"ok": False, "error": f"非法 URL：{url!r}"})
        return
    ua = (req.get("ua") or "").strip() or DEFAULT_UA

    set_cookie_lines = []
    final_url = url
    try:
        html = req.get("html")
        if html:
            # fetcher 已带回挑战页 HTML，直接用（UA 由 fetcher 保证一致）
            if not isinstance(html, str) or len(html) > MAX_HTML_BYTES:
                raise ValueError("回传 html 为空或过大")
        else:
            html, final_url, set_cookie_lines = fetch_html(url, ua)
    except Exception as e:
        emit({"ok": False, "error": str(e)})
        return

    try:
        js_cookie = solve_with_iv8(final_url, ua, html)
    except RuntimeError as e:
        emit({"ok": False, "error": str(e)})
        return
    except Exception as e:  # iv8 执行期异常（站点 JS 探测环境/语法不兼容等）
        emit({"ok": False, "error": f"iv8 执行失败：{type(e).__name__}: {str(e)[:300]}"})
        return

    cookies = parse_set_cookies(set_cookie_lines)
    seen = {c["name"] for c in cookies}
    for c in parse_js_cookie(js_cookie):
        if c["name"] not in seen:
            cookies.append(c)
            seen.add(c["name"])

    if not cookies:
        emit({
            "ok": False,
            "error": "iv8 执行完成但未产生 cookie（站点可能不依赖 JS cookie，或环境探测未通过）",
        })
        return
    emit({
        "ok": True,
        "cookies": cookies,
        "finalUrl": final_url,
        "note": f"iv8 补环境求解成功（{len(cookies)} 枚：{', '.join(c['name'] for c in cookies[:6])}）",
    })


if __name__ == "__main__":
    main()
