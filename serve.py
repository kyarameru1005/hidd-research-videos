#!/usr/bin/env python3
"""
HIDD — 動作確認・展示用の簡易サーバー

標準の `python3 -m http.server` は Range リクエスト（部分取得）に対応していないため、
動画のシークができず、再生位置の復元（レジューム）が効きません。
このスクリプトは Range に対応した最小限のサーバーです。

    python3 serve.py            # http://localhost:8000/src/     本番サイト
    python3 serve.py 9000       # ポートを変える

リポジトリ全体を配信するので、次の URL で開けます。

    /src/            本番サイト
    /demo/           検討用デモの一覧
"""
import http.server
import os
import re
import socketserver
import sys

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        # 展示中に古い内容が残らないようキャッシュを抑制する
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(f.fileno()).st_size
        m = RANGE_RE.match(rng.strip())
        if not m:
            f.close()
            self.send_error(400, "Invalid Range")
            return None

        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":                      # bytes=-N（末尾 N バイト）
            length = int(end_s or 0)
            start = max(0, size - length)
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
        end = min(end, size - 1)

        if start > end or start >= size:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.end_headers()
            return None

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        f.seek(start)
        return _Limited(f, end - start + 1)


class _Limited:
    """指定バイト数だけ読ませるラッパ"""

    def __init__(self, fp, remaining):
        self.fp = fp
        self.remaining = remaining

    def read(self, n=-1):
        if self.remaining <= 0:
            return b""
        if n is None or n < 0 or n > self.remaining:
            n = self.remaining
        data = self.fp.read(n)
        self.remaining -= len(data)
        return data

    def close(self):
        self.fp.close()


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with Server(("", port), RangeHandler) as httpd:
        print("HIDD を配信中  （Ctrl+C で終了）")
        print("  本番サイト: http://localhost:%d/src/" % port)
        print("  検討用デモ: http://localhost:%d/demo/" % port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n終了しました")
