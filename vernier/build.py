#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 https://mechsimulator.com/tools/vernier-caliper 抓取为一个自包含的单文件 HTML，
并完成三项改造：
  1. 去掉广告（AdSense / GA / 广告位 / 广告折叠脚本 / 站点互推脚本 / Cookie 提示）
  2. 主题改为亮色（覆盖 CSS 变量 + 修补硬编码暗色 + 亮色台面 / 亮色 LCD 读数）
  3. 游标卡尺读数结果显示区默认隐藏、点击展开
"""
import base64
import pathlib
import re

import cm_only
import practice_ready
import vernier_20div

ROOT = pathlib.Path(__file__).parent
A = ROOT / "assets"
IMG = A / "img"
OUT = ROOT / "vernier-caliper-light.html"


def read(p):
    return (p).read_text(encoding="utf-8")


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
tool_css = read(A / "tools_vernier-caliper_style.css")
app_js = read(A / "tools_vernier-caliper_app.js")
js_unit = read(A / "shared_unit-memory.js")
js_disp = read(A / "shared_display-memory.js")
js_press = read(A / "shared_press-repeat.js")
js_num = read(A / "shared_number-input-guard.js")

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

# 广告位（画布上方 AdSense 单元）
ad_slot = re.compile(
    r"[ \t]*<!-- AdSense Slot \d+[^\n]*-->\n.*?<div class=\"ad-slot[^\n]*\n(?:.*?\n)*?[ \t]*</div>\n",
    re.S,
)
html, n_ad = ad_slot.subn("", html)
print("  移除广告位块:", n_ad)

# 站点互推 / Cookie 提示 / 广告折叠脚本
html, n_js = re.subn(
    r"^[ \t]*<script src=\"\.\./\.\./shared/(?:related|cookie-notice|ads-collapse)\.js[^\"]*\" defer></script>\n",
    "", html, flags=re.M)
print("  移除站点互推/Cookie/广告折叠脚本:", n_js)

# 残留的 adsbygoogle 引用清一遍
html = re.sub(r"[ \t]*<script>\(adsbygoogle[^\n]*</script>\n", "", html)

# 尺身标注只保留 cm（删除 mm 按钮 + 默认值改 cm + 正文口径同步）
print("尺身标注改为只保留 cm：")
html, app_js = cm_only.apply(html, app_js)

# 练习模式：一进去就能作答（不必先播放→暂停）
print("练习模式改为进入即可作答：")
app_js, html = practice_ready.apply(app_js, html)

# 0.05 mm（20 分度）游标改为按格数标注 0 5 10 15 20
print("0.05 分度游标编号：")
app_js, html = vernier_20div.apply(app_js, html)

# ══════════════════════════════════════════════════════════════════════
# 2. 资源内联（CSS / JS / 图片）
# ══════════════════════════════════════════════════════════════════════
# --- 图片 ---
IMAGES = {
    "../../brand/no_background_logo.png": IMG / "no_background_logo.png",
    "/brand/Naseel_Photo_.JPG": IMG / "Naseel_Photo_.JPG",
    "../../Icons/screw_gauge.png": IMG / "screw_gauge.png",
    "../../Icons/height-gauge.svg": IMG / "height-gauge.svg",
    "../../Icons/dial-caliper.svg": IMG / "dial-caliper.svg",
    "ug-hero.webp": IMG / "ug-hero.webp",
    "screenshot.webp?v=2": IMG / "screenshot.webp",
    "screenshot-2.webp?v=2": IMG / "screenshot-2.webp",
    "screenshot-3.webp?v=2": IMG / "screenshot-3.webp",
    "screenshot-4.webp": IMG / "screenshot-4.webp",
    "screenshot-5.webp": IMG / "screenshot-5.webp",
}
for src, path in IMAGES.items():
    uri = data_uri(path)
    if src in html:
        html = html.replace(src, uri)
    else:
        print("  ! HTML 中未找到图片引用:", src)

SPRITES = {
    "assets/vernier1.png": IMG / "vernier1.png",
    "assets/vernier2.png": IMG / "vernier2.png",
    "assets/vernier3.png": IMG / "vernier3.png",
    "assets/vernier_base.png": IMG / "vernier_base.png",
    "assets/blade.png": IMG / "blade.png",
}
for src, path in SPRITES.items():
    uri = data_uri(path)
    if src not in app_js:
        print("  ! app.js 中未找到精灵图:", src)
    app_js = app_js.replace("'" + src + "'", "'" + uri + "'")

# --- 画布台面：黑花岗岩 → 浅色台面（必须在内联之前改 app.js）---
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
    ("sheen.addColorStop(0, 'rgba(160,190,215,0.13)');",
     "sheen.addColorStop(0, 'rgba(255,255,255,0.60)');"),
    ("sheen.addColorStop(1, 'rgba(160,190,215,0)');",
     "sheen.addColorStop(1, 'rgba(255,255,255,0)');"),
    ("vig.addColorStop(1, 'rgba(0,0,0,0.42)');",
     "vig.addColorStop(1, 'rgba(52,66,88,0.10)');"),
]
for old, new in PLATE_SUBS:
    if old not in app_js:
        print("  ! 台面替换未命中:", old[:60])
    app_js = app_js.replace(old, new)

# --- CSS 内联 ---
light_css = read(ROOT / "light-override.css")

style_block = (
    "<style>\n/* ═══ shared/site.css ═══ */\n" + site_css
    + "\n/* ═══ tools/vernier-caliper/style.css ═══ */\n" + tool_css
    + "\n/* ═══ 亮色主题覆盖 + 折叠面板样式 ═══ */\n" + light_css
    + "\n</style>\n"
)
html, n_css = re.subn(
    r"[ \t]*<link rel=\"stylesheet\" href=\"(?:\.\./\.\./shared/site\.css|style\.css)[^\"]*\"[ \t]*/?>\n",
    "", html)
print("  移除样式表 link:", n_css)
assert n_css == 2, "样式表 link 数量异常"
html = html.replace("</head>", style_block + "</head>")

# --- JS 内联 ---
def js_block(code):
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


for tag, code in [
    ('<script src="app.js?v=86" defer></script>', app_js),
    ('<script src="../../shared/unit-memory.js?v=4" defer></script>', js_unit),
    ('<script src="../../shared/display-memory.js?v=1" defer></script>', js_disp),
    ('<script src="../../shared/press-repeat.js?v=1" defer></script>', js_press),
    ('<script src="../../shared/number-input-guard.js?v=1" defer></script>', js_num),
]:
    assert tag in html, "未找到脚本标签: " + tag
    html = html.replace(tag, js_block(code))

# ══════════════════════════════════════════════════════════════════════
# 3. 读数结果显示区：默认隐藏 + 点击展开
# ══════════════════════════════════════════════════════════════════════
INFO_OPEN = '  <!-- ── INFO ROW: Readout | MSR VSR LC cells | TR Formula | Zoom ── -->\n  <div class="info-row">\n'
if INFO_OPEN not in html:
    # 容错：只按 div 匹配
    INFO_OPEN = '  <div class="info-row">\n'
assert INFO_OPEN in html, "未找到 info-row 起始位置"

COLLAPSE_HEAD = """  <!-- ── Reading result: hidden by default, click the header to expand ── -->
  <div class="result-collapse" id="result-collapse">
    <button type="button" class="result-toggle" id="result-toggle"
            aria-expanded="false" aria-controls="result-panel">
      <span class="rt-chevron" aria-hidden="true"></span>
      <span class="rt-title">Reading result</span>
      <span class="rt-desc">Measurement &middot; MSR / VSR / LC &middot; TR working</span>
      <span class="rt-state">Click to expand</span>
    </button>
    <div class="result-panel" id="result-panel" hidden>
"""
html = html.replace(INFO_OPEN, COLLAPSE_HEAD + '  <div class="info-row">\n')

INFO_CLOSE = '  </div><!-- .info-row -->\n'
assert INFO_CLOSE in html, "未找到 info-row 结束位置"
html = html.replace(INFO_CLOSE, INFO_CLOSE + "    </div><!-- .result-panel -->\n  </div><!-- .result-collapse -->\n")

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
     - Explore hides the reading area anyway (original behaviour) -> hide all
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

# ══════════════════════════════════════════════════════════════════════
# 5. 站内相对链接改绝对链接（本地打开时不至于失效）
# ══════════════════════════════════════════════════════════════════════
BASE = "https://mechsimulator.com"


def fix_href(m):
    href = m.group("q")
    if href.startswith(("http://", "https://", "#", "mailto:", "data:", "javascript:")):
        return m.group(0)
    if href.startswith("/"):
        return 'href="%s%s"' % (BASE, href)
    if href.startswith("../../"):
        return 'href="%s/%s"' % (BASE, href[6:])
    if href.startswith("../"):
        return 'href="%s/tools/%s"' % (BASE, href[3:])
    return m.group(0)


html = re.sub(r'href="(?P<q>[^"]*)"', fix_href, html)
# 还原被误改的 data: URI 之外的样式属性（本页 href 仅用于 <a>，安全）
html = html.replace('href="%s"></a>' % BASE, 'href="%s/"></a>' % BASE)

# ══════════════════════════════════════════════════════════════════════
# 6. 站内相对链接改绝对链接（本地打开时不至于失效）
# ══════════════════════════════════════════════════════════════════════
OUT.write_text(html, encoding="utf-8")
print("\n生成:", OUT.name, "%.1f KB" % (len(html.encode("utf-8")) / 1024))
print("残留 adsbygoogle:", html.count("adsbygoogle"))
print("残留 googletagmanager:", html.count("googletagmanager"))
