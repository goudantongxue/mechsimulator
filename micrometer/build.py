#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 https://mechsimulator.com/tools/screw-gauge/（螺旋测微器模拟器）抓取为
自包含的单文件 HTML，并完成：
  1. 去掉广告（AdSense / GA / 广告位 / 广告折叠 / 站点互推 / Cookie 提示）
  2. 主题改为亮色
  3. 读数结果显示区默认隐藏、点击展开
输出：screw-gauge-light.html      （中文版见 build_zh.py）
"""
import base64
import pathlib
import re

import screw_only

ROOT = pathlib.Path(__file__).parent
A = ROOT / "assets"
IMG = A / "img"
OUT = ROOT / "screw-gauge-light.html"
BASE = "https://mechsimulator.com"


def read(p):
    return p.read_text(encoding="utf-8")


def data_uri(path, mime=None):
    raw = path.read_bytes()
    if mime is None:
        ext = path.suffix.lower()
        mime = {
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif",
        }.get(ext, "application/octet-stream")
    return "data:%s;base64,%s" % (mime, base64.b64encode(raw).decode("ascii"))


html = read(ROOT / "original.html")
site_css = read(A / "shared_site.css")
tool_css = read(A / "tools_screw-gauge_style.css")
app_js = read(A / "tools_screw-gauge_app.js")
light_css = read(ROOT / "light-override.css")

# ══════════════════════════════════════════════════════════════════════
# 1. 去广告 / 去追踪
# ══════════════════════════════════════════════════════════════════════
KILL = [
    "  <!-- Google Analytics -->\n",
    '  <link rel="dns-prefetch" href="https://www.googletagmanager.com">\n',
    '  <link rel="preconnect" href="https://www.googletagmanager.com" crossorigin>\n',
    '  <script async src="https://www.googletagmanager.com/gtag/js?id=G-C1XEZ8132S"></script>\n',
    "  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-C1XEZ8132S');</script>\n",
    '  <meta name="google-adsense-account" content="ca-pub-8475334350760145" />\n',
    "  <!-- Google AdSense -->\n",
    '  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8475334350760145" crossorigin="anonymous"></script>\n',
]
for k in KILL:
    if k not in html:
        print("  ! 未找到（可忽略）:", k.strip()[:70])
    html = html.replace(k, "")

html, n_ad = re.subn(
    r"[ \t]*<!-- AdSense Slot \d+[^\n]*-->\n.*?<div class=\"ad-slot[^\n]*\n(?:.*?\n)*?[ \t]*</div>\n",
    "", html, flags=re.S)
print("  移除广告位块:", n_ad)

html, n_js = re.subn(
    r"^[ \t]*<script src=\"\.\./\.\./shared/(?:related|cookie-notice|ads-collapse)\.js[^\"]*\" defer></script>\n",
    "", html, flags=re.M)
print("  移除站点互推/Cookie/广告折叠脚本:", n_js)

html = re.sub(r"[ \t]*<script>\(adsbygoogle[^\n]*</script>\n", "", html)
html = re.sub(r"[ \t]*<link rel=\"manifest\"[^\n]*>\n", "", html)

# ══════════════════════════════════════════════════════════════════════
# 1b. 螺杆固定为 0.5 mm × 50（去掉「1 mm × 100」选项）
# ══════════════════════════════════════════════════════════════════════
html, app_js = screw_only.apply(html, app_js)

# ══════════════════════════════════════════════════════════════════════
# 2. 图片内联
# ══════════════════════════════════════════════════════════════════════
IMAGES = {
    "../../brand/no_background_logo.png": IMG / "no_background_logo.png",
    "../../Icons/Vernier_caliper.png": IMG / "Vernier_caliper.png",
    "../../Icons/Dial_gauge.png": IMG / "Dial_gauge.png",
    "../../favicon.svg": IMG / "favicon.svg",
    # 作者头像用绝对路径 /brand/…，必须一并内联，否则离线是死链
    "/brand/Naseel_Photo_.JPG": IMG / "Naseel_Photo_.JPG",
    "ug-hero.webp": IMG / "ug-hero.webp",
    "ug-new.webp": IMG / "ug-new.webp",
    "ug-reading.webp": IMG / "ug-reading.webp",
    "ug-zeroerror.webp": IMG / "ug-zeroerror.webp",
    "ug-zoom.webp": IMG / "ug-zoom.webp",
    "screenshot.webp?v=2": IMG / "screenshot.webp",
    "screenshot-2.webp": IMG / "screenshot-2.webp",
    "screenshot-3.webp": IMG / "screenshot-3.webp",
    "screenshot-4.webp": IMG / "screenshot-4.webp",
}
for src, path in IMAGES.items():
    if src not in html:
        print("  ! 未命中图片引用:", src)
        continue
    html = html.replace(src, data_uri(path))

SPRITES = {
    "assets/micrometer_base.png": IMG / "micrometer_base.png",
    "assets/spindle.png": IMG / "spindle.png",
    "assets/thimble.png": IMG / "thimble.png",
}
for src, path in SPRITES.items():
    if src not in app_js:
        print("  ! app.js 未命中精灵图:", src)
    app_js = app_js.replace("'" + src + "'", "'" + data_uri(path) + "'")

# ══════════════════════════════════════════════════════════════════════
# 3. 画布台面：黑花岗岩 → 浅色（与卡尺页同样的处理）
# ══════════════════════════════════════════════════════════════════════
PLATE_SUBS = [
    ("g.fillStyle = '#15191e';", "g.fillStyle = '#dee4ee';"),
    ("grain(W * H / 700, 1.0, 2.6, 'rgba(0,0,0,0.30)');",
     "grain(W * H / 700, 1.0, 2.6, 'rgba(44,56,74,0.075)');"),
    ("grain(W * H / 1400, 0.8, 2.0, 'rgba(96,106,118,0.10)');",
     "grain(W * H / 1400, 0.8, 2.0, 'rgba(255,255,255,0.55)');"),
    ("grain(W * H / 2600, 0.5, 1.3, 'rgba(176,186,198,0.20)');",
     "grain(W * H / 2600, 0.5, 1.3, 'rgba(122,136,158,0.14)');"),
    ("g.fillStyle = 'rgba(170,180,192,' + (0.03 + v * 0.07).toFixed(3) + ')';",
     "g.fillStyle = 'rgba(92,106,128,' + (0.02 + v * 0.05).toFixed(3) + ')';"),
    ("sheen.addColorStop(0, 'rgba(160,190,215,0.12)');",
     "sheen.addColorStop(0, 'rgba(255,255,255,0.60)');"),
    ("sheen.addColorStop(1, 'rgba(160,190,215,0)');",
     "sheen.addColorStop(1, 'rgba(255,255,255,0)');"),
    ("vig.addColorStop(1, 'rgba(0,0,0,0.40)');",
     "vig.addColorStop(1, 'rgba(52,66,88,0.10)');"),
]
for old, new in PLATE_SUBS:
    if old not in app_js:
        print("  ! 台面替换未命中:", old[:60])
    app_js = app_js.replace(old, new)

# ══════════════════════════════════════════════════════════════════════
# 4. 站内相对链接 → 绝对链接（只动 <a>，别碰资源引用）
# ══════════════════════════════════════════════════════════════════════
def fix_href(m):
    head, href, tail = m.group(1), m.group(2), m.group(3)
    if href.startswith(("http://", "https://", "#", "mailto:", "data:", "javascript:")):
        return m.group(0)
    if href.startswith("/"):
        return "%s%s%s%s" % (head, BASE, href, tail)
    if href.startswith("../../"):
        return "%s%s/%s%s" % (head, BASE, href[6:], tail)
    if href.startswith("../"):
        return "%s%s/tools/%s%s" % (head, BASE, href[3:], tail)
    return m.group(0)


html = re.sub(r'(<a\b[^>]*?href=")([^"]*)(")', fix_href, html)

# ══════════════════════════════════════════════════════════════════════
# 5. CSS 内联（含亮色覆盖）
# ══════════════════════════════════════════════════════════════════════
style_block = (
    "<style>\n/* ═══ shared/site.css ═══ */\n" + site_css
    + "\n/* ═══ tools/screw-gauge/style.css ═══ */\n" + tool_css
    + "\n/* ═══ 亮色主题覆盖 + 折叠面板样式 ═══ */\n" + light_css
    + "\n</style>\n"
)
html, n_css = re.subn(
    r"[ \t]*<link rel=\"stylesheet\" href=\"(?:\.\./\.\./shared/site\.css|style\.css)[^\"]*\"[ \t]*/?>\n",
    "", html)
assert n_css == 2, "样式表 link 数量异常"
html = html.replace("</head>", style_block + "</head>")

# ══════════════════════════════════════════════════════════════════════
# 6. JS 内联
# ══════════════════════════════════════════════════════════════════════
def js_block(code):
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


for tag, code in [
    ('<script src="app.js?v=39" defer></script>', app_js),
    ('<script src="../../shared/unit-memory.js?v=4" defer></script>', read(A / "shared_unit-memory.js")),
    ('<script src="../../shared/press-repeat.js?v=1" defer></script>', read(A / "shared_press-repeat.js")),
    ('<script src="../../shared/number-input-guard.js?v=1" defer></script>', read(A / "shared_number-input-guard.js")),
]:
    assert tag in html, "未找到脚本标签: " + tag
    html = html.replace(tag, js_block(code))

# ══════════════════════════════════════════════════════════════════════
# 7. 读数结果显示区：默认隐藏 + 点击展开
# ══════════════════════════════════════════════════════════════════════
INFO_OPEN = '  <div class="info-row">\n'
assert INFO_OPEN in html, "未找到 info-row"
COLLAPSE_HEAD = """  <!-- ── Reading result: hidden by default, click the header to expand ── -->
  <div class="result-collapse" id="result-collapse">
    <button type="button" class="result-toggle" id="result-toggle"
            aria-expanded="false" aria-controls="result-panel">
      <span class="rt-chevron" aria-hidden="true"></span>
      <span class="rt-title">Reading result</span>
      <span class="rt-desc">Measurement &middot; MSR / CSR / LC &middot; TR working</span>
      <span class="rt-state">Click to expand</span>
    </button>
    <div class="result-panel" id="result-panel" hidden>
"""
html = html.replace(INFO_OPEN, COLLAPSE_HEAD + INFO_OPEN, 1)
INFO_CLOSE = '  </div><!-- .info-row -->\n'
assert INFO_CLOSE in html, "未找到 info-row 结束位置"
html = html.replace(INFO_CLOSE, INFO_CLOSE + "    </div><!-- .result-panel -->\n  </div><!-- .result-collapse -->\n", 1)

COLLAPSE_JS = """
<script>
/* ── Reading-result collapse ─────────────────────────────────────
   Collapsed by default; the header toggles it. It expands itself in
   Practice / Quiz, because those modes need the answer box.      */
(function () {
  var root  = document.getElementById('result-collapse');
  var btn   = document.getElementById('result-toggle');
  var panel = document.getElementById('result-panel');
  if (!root || !btn || !panel) return;

  function setOpen(open) {
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var st = btn.querySelector('.rt-state');
    if (st) st.textContent = open ? 'Click to collapse' : 'Click to expand';
  }
  btn.addEventListener('click', function () { setOpen(panel.hidden); });
  setOpen(false);

  /* Mode changes:
     - Explore hides the reading area anyway -> hide all
     - Practice / Quiz need the answer box -> expand it and focus the input
     - Simulate -> back to collapsed by default */
  var tabs = document.getElementById('mode-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var pill = e.target.closest ? e.target.closest('.pill') : null;
      if (!pill || !tabs.contains(pill)) return;
      var v = pill.getAttribute('data-value');
      if (v === 'explore') {
        root.style.display = 'none';
        setOpen(false);
        return;
      }
      root.style.display = '';
      setOpen(v === 'practice' || v === 'quiz');
      /* expanded -> put the caret in the answer box so it can be typed at once */
      if (v === 'practice' || v === 'quiz') {
        var inp = document.getElementById('practice-input');
        if (inp) { try { inp.focus({ preventScroll: true }); } catch (err) { inp.focus(); } }
      }
    });
  }
})();
</script>
"""
html = html.replace("</body>", COLLAPSE_JS + "</body>")

OUT.write_text(html, encoding="utf-8")
print("\n生成:", OUT.name, "%.1f KB" % (len(html.encode("utf-8")) / 1024))
print("残留 adsbygoogle:", html.count("adsbygoogle"),
      "| 残留 googletagmanager:", html.count("googletagmanager"),
      "| 外链 script/link:", len(re.findall(r'<script src=|<link rel="stylesheet"', html)))
