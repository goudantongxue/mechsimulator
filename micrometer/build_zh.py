#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
在 build.py（去广告 + 亮色主题 + 读数区折叠）的基础上，再生成**中文版**：
  · HTML 界面文案替换（含 title/meta/结构化数据）
  · 「使用指南」与正文技术文章整节替换为中文
  · app.js 内所有用户可见字符串按词表翻译（含画布上绘制的字幕）
输出：screw-gauge-light-zh.html
"""
import ast
import base64
import json
import pathlib
import re

import screw_only

ROOT = pathlib.Path(__file__).parent
A = ROOT / "assets"
IMG = A / "img"
ZH = ROOT / "zh"
OUT = ROOT / "screw-gauge-light-zh.html"
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
    html = html.replace(k, "")

html, n_ad = re.subn(
    r"[ \t]*<!-- AdSense Slot \d+[^\n]*-->\n.*?<div class=\"ad-slot[^\n]*\n(?:.*?\n)*?[ \t]*</div>\n",
    "", html, flags=re.S)
html, n_js = re.subn(
    r"^[ \t]*<script src=\"\.\./\.\./shared/(?:related|cookie-notice|ads-collapse)\.js[^\"]*\" defer></script>\n",
    "", html, flags=re.M)
html = re.sub(r"[ \t]*<script>\(adsbygoogle[^\n]*</script>\n", "", html)
html = re.sub(r"[ \t]*<link rel=\"manifest\"[^\n]*>\n", "", html)
print("去广告：广告位 %d 块、站点脚本 %d 个" % (n_ad, n_js))

# ══════════════════════════════════════════════════════════════════════
# 1b. 螺杆固定为 0.5 mm × 50（去掉「1 mm × 100」选项）
#     中文文案在 zh/guide.html、zh/article.html、zh/jsonld.html 里
# ══════════════════════════════════════════════════════════════════════
html, app_js = screw_only.apply(html, app_js, english_text=False)

# ══════════════════════════════════════════════════════════════════════
# 2. 整节替换为中文（必须在图片内联之前）
# ══════════════════════════════════════════════════════════════════════
s = html.index('  <!-- ═══ USER GUIDE')
e = html.index('  <!-- ── SEO How-to article ── -->')
html = html[:s] + read(ZH / "guide.html").rstrip("\n") + "\n\n" + html[e:]

s = html.index('  <!-- ── SEO How-to article ── -->')
e = html.index('  <!-- ── Site Footer ── -->')
html = html[:s] + read(ZH / "article.html").rstrip("\n") + "\n\n" + html[e:]

html, n_faq = re.subn(
    r'<script type="application/ld\+json">\s*\{\s*"@context":\s*"https://schema\.org",\s*"@type":\s*"FAQPage".*?</script>',
    read(ZH / "jsonld.html").strip(), html, flags=re.S)
print("FAQ 结构化数据替换:", n_faq)

# ══════════════════════════════════════════════════════════════════════
# 3. 图片内联
# ══════════════════════════════════════════════════════════════════════
IMAGES = {
    "../../brand/no_background_logo.png": IMG / "no_background_logo.png",
    "/brand/Naseel_Photo_.JPG": IMG / "no_background_logo.png",   # 占位，稍后覆盖
    "../../Icons/Vernier_caliper.png": IMG / "Vernier_caliper.png",
    "../../Icons/Dial_gauge.png": IMG / "Dial_gauge.png",
    "../../favicon.svg": IMG / "favicon.svg",
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
# 作者照片：这一页与卡尺页共用同一张，若本地没有就沿用卡尺页下载的那张
author = IMG / "Naseel_Photo_.JPG"
IMAGES["/brand/Naseel_Photo_.JPG"] = author if author.exists() else (
    ROOT.parent / "vernier" / "assets" / "img" / "Naseel_Photo_.JPG")

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
# 4. 站内相对链接 → 绝对链接（只动 <a>）
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
# 5. HTML 界面文案（中文）
# ══════════════════════════════════════════════════════════════════════
html_strings = json.loads(read(ZH / "html-strings.json"))
miss_html = []
for en, zh in html_strings.items():
    if en not in html:
        miss_html.append(en[:60])
        continue
    html = html.replace(en, zh)
if miss_html:
    print("  ! HTML 词条未命中 %d 条：" % len(miss_html))
    for m in miss_html[:20]:
        print("      ", repr(m))

# 结构化数据里的字段
for en, zh in [
    ('"name": "Micrometer Screw Gauge Simulator"', '"name": "螺旋测微器（千分尺）模拟器"'),
    ('"name":"Home"', '"name":"首页"'),
    ('"name":"Micrometer Screw Gauge Simulator","item"', '"name":"螺旋测微器模拟器","item"'),
    ('<meta name="theme-color" content="#0d1117" />', '<meta name="theme-color" content="#ffffff" />'),
]:
    if en not in html:
        print("  ! 结构化数据未命中:", en[:50])
    html = html.replace(en, zh)

# 兜底：把 JS 词表也套用到 HTML 上
mapping = {}
for f in ("js-ui.json", "js-obj.json", "js-explore.json", "js-parts.json"):
    mapping.update(json.loads(read(ZH / f)))
print("词表条目:", len(mapping))
n_extra = 0
for en, zh in mapping.items():
    if en in html:
        html = html.replace(en, zh)
        n_extra += 1
print("  兜底替换到 HTML 的词条:", n_extra)

# ══════════════════════════════════════════════════════════════════════
# 6. app.js 文案翻译（先翻译，再内联）
# ══════════════════════════════════════════════════════════════════════
# 中文没有单复数：先把英文的复数拼接整段拆掉
PLURAL = "' division' + (br.rem === 1 ? '' : 's') + ' from it to the datum: CSR = '"
if PLURAL in app_js:
    app_js = app_js.replace(PLURAL, "'格，数到基准线，CSR = '")
    print("  处理单复数拼接: 1 处")
else:
    print("  ! 单复数拼接未命中")

hits = {}


def norm(s):
    """把 \\uD83C\\uDFAF 这类代理对还原成一个字符，好与词表里的 emoji 对上。"""
    try:
        return s.encode("utf-16", "surrogatepass").decode("utf-16")
    except Exception:
        return s


def translate_js(src, mp):
    """翻译 JS 字符串字面量：分单引号/双引号两遍（单引号串里常嵌 HTML 双引号）。"""
    def make_sub(q, lookbehind=""):
        pat = re.compile(lookbehind + re.escape(q) + r"((?:[^" + re.escape(q) + r"\\\n]|\\.)*)" + re.escape(q))

        def repl(m):
            body = m.group(1)
            try:
                decoded = ast.literal_eval(q + body + q)
            except Exception:
                return m.group(0)
            if not isinstance(decoded, str):
                return m.group(0)
            key = norm(decoded)
            if key not in mp:
                return m.group(0)
            hits[key] = hits.get(key, 0) + 1
            inner = json.dumps(mp[key], ensure_ascii=False)[1:-1]
            if q == "'":
                inner = inner.replace("'", "\\'")
            return q + inner + q

        return lambda s: pat.sub(repl, s)

    src = make_sub("'", r"(?<![\w$])")(src)
    src = make_sub('"')(src)
    return src


app_js = translate_js(app_js, mapping)

# 模板字符串（反引号）
TPL = [
    ("`&#10003; Correct! &nbsp;<strong>${correctStr} ${uLabel()}</strong>`",
     "`&#10003; 正确！ &nbsp;<strong>${correctStr} ${uLabel()}</strong>`"),
    ("`&#10007; Incorrect &nbsp;|&nbsp; You entered: <strong>${escHtml(raw)} ${uLabel()}</strong> &nbsp;|&nbsp; Answer: <strong>${correctStr} ${uLabel()}</strong>`",
     "`&#10007; 错误 &nbsp;|&nbsp; 你输入的是：<strong>${escHtml(raw)} ${uLabel()}</strong> &nbsp;|&nbsp; 正确答案：<strong>${correctStr} ${uLabel()}</strong>`"),
]
for en, zh in TPL:
    if en not in app_js:
        print("  ! 模板串未命中:", en[:50])
    app_js = app_js.replace(en, zh)

unused = [k for k in mapping if k not in hits]
print("app.js 命中词条: %d 条；未命中的词条 %d 条" % (len(hits), len(unused)))
for k in unused[:12]:
    print("      未用:", repr(k[:70]))

# ══════════════════════════════════════════════════════════════════════
# 7. 亮色台面 + 画布中文字体
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
        print("  ! 台面替换未命中:", old[:50])
    app_js = app_js.replace(old, new)

for size in ("bold 12pt", "bold 11pt", "bold 10pt", "bold 9.5pt", "bold 9pt",
             "bold 8.5pt", "bold 8pt", "9pt", "8.5pt", "8pt"):
    app_js = app_js.replace("'%s sans-serif'" % size,
                            "'%s \"PingFang SC\", \"Microsoft YaHei\", sans-serif'" % size)

# ══════════════════════════════════════════════════════════════════════
# 8. CSS 内联（含亮色覆盖）
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
# 9. JS 内联
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
# 10. 读数结果显示区：默认隐藏 + 点击展开
# ══════════════════════════════════════════════════════════════════════
INFO_OPEN = '  <div class="info-row">\n'
assert INFO_OPEN in html, "未找到 info-row"
COLLAPSE_HEAD = """  <!-- ── 读数结果显示区：默认隐藏，点击标题展开 ── -->
  <div class="result-collapse" id="result-collapse">
    <button type="button" class="result-toggle" id="result-toggle"
            aria-expanded="false" aria-controls="result-panel">
      <span class="rt-chevron" aria-hidden="true"></span>
      <span class="rt-title">读数结果</span>
      <span class="rt-desc">测量值 &middot; MSR / CSR / LC &middot; TR 计算过程</span>
      <span class="rt-state">点击展开</span>
    </button>
    <div class="result-panel" id="result-panel" hidden>
"""
html = html.replace(INFO_OPEN, COLLAPSE_HEAD + INFO_OPEN, 1)
INFO_CLOSE = '  </div><!-- .info-row -->\n'
assert INFO_CLOSE in html, "未找到 info-row 结束位置"
html = html.replace(INFO_CLOSE, INFO_CLOSE + "    </div><!-- .result-panel -->\n  </div><!-- .result-collapse -->\n", 1)

COLLAPSE_JS = """
<script>
/* ── 读数结果折叠控制 ────────────────────────────────────────────
   默认收起；点击标题栏展开/收起。切到 练习 / 测验 模式时自动展开，
   因为这两种模式需要在读数区里输入答案。                        */
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
    if (st) st.textContent = open ? '点击收起' : '点击展开';
  }
  btn.addEventListener('click', function () { setOpen(panel.hidden); });
  setOpen(false);

  /* 模式切换：
     - 浏览模式本身不显示读数区 → 整块隐藏
     - 练习 / 测验需要在读数区里输入答案 → 自动展开并聚焦
     - 模拟 → 恢复默认收起 */
  var tabs = document.getElementById('mode-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var pill = e.target.closest ? e.target.closest('.pill') : null;
      if (!pill || !tabs.contains(pill)) return;
      var v = pill.getAttribute('data-value');
      if (v === 'explore') { root.style.display = 'none'; setOpen(false); return; }
      root.style.display = '';
      setOpen(v === 'practice' || v === 'quiz');
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

html = html.replace('<html lang="en">', '<html lang="zh-CN">')

OUT.write_text(html, encoding="utf-8")
print("\n生成:", OUT.name, "%.1f KB" % (len(html.encode("utf-8")) / 1024))
print("残留 adsbygoogle:", html.count("adsbygoogle"),
      "| 残留 googletagmanager:", html.count("googletagmanager"),
      "| 外链 script/link:", len(re.findall(r'<script src=|<link rel="stylesheet"', html)))
