"""Tell Bing (which ChatGPT and Copilot search read from), Yandex and other
IndexNow engines that KHEL-O's public pages changed, so they recrawl now
instead of in weeks.

    python scripts/ops/indexnow.py            # every URL in the live sitemap
    python scripts/ops/indexnow.py /gta6 ...  # just these paths

Run it after a prod deploy that changes public pages. The key file
frontend/public/<KEY>.txt must already be live on khel-o.com.
"""
import json
import re
import sys
import urllib.request

HOST = "khel-o.com"
KEY = "9a719b35303ed3675454ab6a05294b35"
UA = {"User-Agent": "KHEL-O-indexnow/1.0"}


def sitemap_urls() -> list[str]:
    req = urllib.request.Request(f"https://{HOST}/sitemap.xml", headers=UA)
    xml = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def main() -> None:
    urls = [f"https://{HOST}{p}" for p in sys.argv[1:]] or sitemap_urls()
    key_url = f"https://{HOST}/{KEY}.txt"
    live = urllib.request.urlopen(urllib.request.Request(key_url, headers=UA), timeout=30).read().decode().strip()
    if live != KEY:
        sys.exit(f"key file at {key_url} does not match; deploy it first")
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": key_url, "urlList": urls[:10000]}).encode()
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=body,
        headers={**UA, "Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"IndexNow: {r.status} for {len(urls)} URLs")


if __name__ == "__main__":
    main()
