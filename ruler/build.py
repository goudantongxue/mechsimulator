#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 https://mechsimulator.com/tools/steel-ruler/（刻度尺 / 钢尺模拟器）抓取为
自包含的单文件 HTML，并完成：
  1. 去掉广告（AdSense / GA / 广告位 / 广告折叠 / 站点互推 / Cookie 提示）
  2. 主题改为亮色
  3. 读数结果显示区默认隐藏、点击展开
  4. 一进练习模式（以及点「换一题」）就能立刻读刻度作答
  5. 读数区单位字号放大
输出：steel-ruler-light.html      （中文版见 build_zh.py）
"""
import base64
import pathlib
import re

import estimate
import practice_ready

ROOT = pathlib.Path(__file__).parent
A = ROOT / "assets"
IMG = A / "img"
OUT = ROOT / "steel-ruler-light.html"
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
tool_css = read(A / "tools_steel-ruler_style.css")
app_js = read(A / "tools_steel-ruler_app.js")
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
# 暗色的浏览器主题色，跟着亮色主题走
html = html.replace('<meta name="theme-color" content="#0d1117" />',
                    '<meta name="theme-color" content="#eceff5" />')

# ══════════════════════════════════════════════════════════════════════
# 2. 图片内联
# ══════════════════════════════════════════════════════════════════════
IMAGES = {
    "../../brand/no_background_logo.png": IMG / "no_background_logo.png",
    "../../Icons/Vernier_caliper.png": IMG / "Vernier_caliper.png",
    "../../Icons/protractor.png": IMG / "protractor.png",
    "../../favicon.svg": IMG / "favicon.svg",
    # 作者头像用绝对路径 /brand/…，必须一并内联，否则离线是死链
    "/brand/Naseel_Photo_.JPG": IMG / "Naseel_Photo_.JPG",
    "ug-hero.webp": IMG / "ug-hero.webp",
    "screenshot.webp": IMG / "screenshot.webp",
}
for src, path in IMAGES.items():
    if src not in html:
        print("  ! 未命中图片引用:", src)
        continue
    html = html.replace(src, data_uri(path))

# ══════════════════════════════════════════════════════════════════════
# 3. 画布亮色化
#    这一页的尺身本身就是浅色钢（#dde0e3 → #f3f4f6 渐变），不用动；
#    要改的是「画布底色」和几处只在暗底上成立的叠色：
#      · 底色 #0d1117 ×4（挂孔 / draw / drawZoomed / 导出 PNG）
#      · 导出 PNG 的水印是浅灰，换到亮底上会看不见
#      · LC 徽章原来是黑底金字，投影和吸附标记的亮黄也要压深
#    替换必须在 app.js 内联之前完成。
# ══════════════════════════════════════════════════════════════════════
CANVAS_SUBS = [
    # 端头挂孔：原来直接填画布底色当「洞」，亮底上要单独给个灰才像洞
    ("// punched-through: shows the dark canvas behind the rule\n  ctx.fillStyle = '#0d1117';",
     "// punched-through: shows the paper behind the rule\n  ctx.fillStyle = '#c3ccda';"),
    # 导出 PNG 时的底色与水印（这条要在通用底色规则之前，否则会被它先吃掉）
    ("octx.fillStyle = '#0d1117';", "octx.fillStyle = '#eceff5';"),
    ("octx.fillStyle = 'rgba(220, 230, 240, 0.55)';",
     "octx.fillStyle = 'rgba(70, 85, 105, 0.55)';"),
    # 画布底色（draw / drawZoomed；`octx.` 那条上面已处理）
    ("ctx.fillStyle = '#0d1117';", "ctx.fillStyle = '#eceff5';"),
    # 最小分度值徽章：黑底金字 → 白底深金字
    ("ctx.fillStyle = 'rgba(0,0,0,0.58)';", "ctx.fillStyle = 'rgba(255,255,255,0.94)';"),
    ("ctx.strokeStyle = 'rgba(245,200,66,0.52)';", "ctx.strokeStyle = 'rgba(140,100,10,0.45)';"),
    ("ctx.fillStyle = '#f5c842';\n  ctx.fillText(txt, bx + 6, by + 9);",
     "ctx.fillStyle = '#8a5f0d';\n  ctx.fillText(txt, bx + 6, by + 9);"),
    # 吸附到常用尺寸的金色菱形：亮黄在浅底上看不清，压深
    ("ctx.fillStyle = active ? '#f5c842' : 'rgba(245,200,66,0.42)';",
     "ctx.fillStyle = active ? '#a9761a' : 'rgba(169,118,26,0.45)';"),
    # 游标三角：金色压深，光晕收敛（亮底上不需要那圈霓虹）
    ("const fill = color || '#f5c842';", "const fill = color || '#e2a20a';"),
    ("const rim  = color ? 'rgba(40, 80, 130, 0.95)' : 'rgba(140, 90, 0, 0.9)';",
     "const rim  = color ? 'rgba(40, 80, 130, 0.95)' : 'rgba(120, 78, 0, 0.85)';"),
    ("const glow = color ? 'rgba(94, 154, 217, 0.85)' : 'rgba(245, 200, 66, 0.85)';",
     "const glow = color ? 'rgba(94, 154, 217, 0.55)' : 'rgba(226, 162, 10, 0.45)';"),
    ("const stemColor = color ? 'rgba(94,154,217,0.6)' : 'rgba(245,200,66,0.65)';",
     "const stemColor = color ? 'rgba(94,154,217,0.6)' : 'rgba(180,128,10,0.7)';"),
    # 尺身侧影与钢条投影：45% / 32% 的黑在浅底上过重
    ("sideG.addColorStop(0, 'rgba(0,0,0,0.45)');", "sideG.addColorStop(0, 'rgba(52,66,88,0.20)');"),
    ("shadG.addColorStop(0, 'rgba(0,0,0,0.32)');", "shadG.addColorStop(0, 'rgba(52,66,88,0.18)');"),
]
for old, new in CANVAS_SUBS:
    if old not in app_js:
        print("  ! 画布替换未命中:", old[:60])
    app_js = app_js.replace(old, new)

# ══════════════════════════════════════════════════════════════════════
# 4. 练习模式：进入即可作答
# ══════════════════════════════════════════════════════════════════════
html, app_js = practice_ready.apply(html, app_js)

# ══════════════════════════════════════════════════════════════════════
# 4b. 估读开关（游标可停在刻度之间）
# ══════════════════════════════════════════════════════════════════════
html, app_js = estimate.apply(html, app_js)

# ══════════════════════════════════════════════════════════════════════
# 5. 站内相对链接 → 绝对链接（只动 <a>，别碰资源引用）
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
# 6. CSS 内联（含亮色覆盖）
# ══════════════════════════════════════════════════════════════════════
style_block = (
    "<style>\n/* ═══ shared/site.css ═══ */\n" + site_css
    + "\n/* ═══ tools/steel-ruler/style.css ═══ */\n" + tool_css
    + "\n/* ═══ 亮色主题覆盖 + 折叠面板样式 ═══ */\n" + light_css
    + "\n</style>\n"
)
html, n_css = re.subn(
    r"[ \t]*<link rel=\"stylesheet\" href=\"(?:\.\./\.\./shared/site\.css|style\.css)[^\"]*\"[ \t]*/?>\n",
    "", html)
assert n_css == 2, "样式表 link 数量异常"
html = html.replace("</head>", style_block + "</head>")

# ══════════════════════════════════════════════════════════════════════
# 7. JS 内联
# ══════════════════════════════════════════════════════════════════════
def js_block(code):
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


for tag, code in [
    ('<script src="app.js?v=35" defer></script>', app_js),
    ('<script src="../../shared/unit-memory.js?v=4" defer></script>', read(A / "shared_unit-memory.js")),
    ('<script src="../../shared/display-memory.js?v=1" defer></script>', read(A / "shared_display-memory.js")),
    ('<script src="../../shared/press-repeat.js?v=1" defer></script>', read(A / "shared_press-repeat.js")),
    ('<script src="../../shared/number-input-guard.js?v=1" defer></script>', read(A / "shared_number-input-guard.js")),
]:
    assert tag in html, "未找到脚本标签: " + tag
    html = html.replace(tag, js_block(code))

# ══════════════════════════════════════════════════════════════════════
# 8. 读数结果显示区：默认隐藏 + 点击展开
# ══════════════════════════════════════════════════════════════════════
INFO_OPEN = '  <div class="info-row">\n'
assert INFO_OPEN in html, "未找到 info-row"
COLLAPSE_HEAD = """  <!-- ── Reading result: hidden by default, click the header to expand ── -->
  <div class="result-collapse" id="result-collapse">
    <button type="button" class="result-toggle" id="result-toggle"
            aria-expanded="false" aria-controls="result-panel">
      <span class="rt-chevron" aria-hidden="true"></span>
      <span class="rt-title">Reading result</span>
      <span class="rt-desc">Length &middot; mm / cm / m &middot; conversion working</span>
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

OUT.write_text(html, encoding="utf-8")
print("\n生成:", OUT.name, "%.1f KB" % (len(html.encode("utf-8")) / 1024))
print("残留 adsbygoogle:", html.count("adsbygoogle"),
      "| 残留 googletagmanager:", html.count("googletagmanager"),
      "| 外链 script/link:", len(re.findall(r'<script src=|<link rel="stylesheet"', html)))
