#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
在 build.py（去广告 + 亮色主题 + 读数区折叠 + 练习即答 + 单位放大）的基础上，
再生成**中文版**：steel-ruler-light-zh.html

中文文案分三处来源：
  · zh/guide.html / zh/article.html / zh/jsonld.html —— 整节替换的长正文
  · zh/html-strings.json                            —— 静态界面词条
  · zh/js-ui.json / zh/js-explore.json              —— app.js 里动态生成的文案
"""
import ast
import base64
import json
import pathlib
import re

import estimate
import practice_ready

ROOT = pathlib.Path(__file__).parent
A = ROOT / "assets"
IMG = A / "img"
ZH = ROOT / "zh"
OUT = ROOT / "steel-ruler-light-zh.html"
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
html, n_js = re.subn(
    r"^[ \t]*<script src=\"\.\./\.\./shared/(?:related|cookie-notice|ads-collapse)\.js[^\"]*\" defer></script>\n",
    "", html, flags=re.M)
html = re.sub(r"[ \t]*<script>\(adsbygoogle[^\n]*</script>\n", "", html)
html = re.sub(r"[ \t]*<link rel=\"manifest\"[^\n]*>\n", "", html)
print("去广告：广告位 %d 块、站点脚本 %d 个" % (n_ad, n_js))

# ══════════════════════════════════════════════════════════════════════
# 1b. 练习模式：进入即可作答（英文文案补丁不套用）
# ══════════════════════════════════════════════════════════════════════
html, app_js = practice_ready.apply(html, app_js, english_text=False)

# ══════════════════════════════════════════════════════════════════════
# 1c. 估读开关（中文文案在 zh/guide.html 与 zh/html-strings.json 里）
# ══════════════════════════════════════════════════════════════════════
html, app_js = estimate.apply(html, app_js, english_text=False)

# ══════════════════════════════════════════════════════════════════════
# 2. 整节替换为中文（必须在图片内联之前，否则新写进去的 src 不会被内联）
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
    "../../Icons/Vernier_caliper.png": IMG / "Vernier_caliper.png",
    "../../Icons/protractor.png": IMG / "protractor.png",
    "../../favicon.svg": IMG / "favicon.svg",
    # 作者头像走绝对路径 /brand/…，必须一并内联，否则离线是死链
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
# 4. 画布亮色化（与 build.py 同一套替换）
# ══════════════════════════════════════════════════════════════════════
CANVAS_SUBS = [
    ("// punched-through: shows the dark canvas behind the rule\n  ctx.fillStyle = '#0d1117';",
     "// punched-through: shows the paper behind the rule\n  ctx.fillStyle = '#c3ccda';"),
    ("octx.fillStyle = '#0d1117';", "octx.fillStyle = '#eceff5';"),
    ("octx.fillStyle = 'rgba(220, 230, 240, 0.55)';",
     "octx.fillStyle = 'rgba(70, 85, 105, 0.55)';"),
    ("ctx.fillStyle = '#0d1117';", "ctx.fillStyle = '#eceff5';"),
    ("ctx.fillStyle = 'rgba(0,0,0,0.58)';", "ctx.fillStyle = 'rgba(255,255,255,0.94)';"),
    ("ctx.strokeStyle = 'rgba(245,200,66,0.52)';", "ctx.strokeStyle = 'rgba(140,100,10,0.45)';"),
    ("ctx.fillStyle = '#f5c842';\n  ctx.fillText(txt, bx + 6, by + 9);",
     "ctx.fillStyle = '#8a5f0d';\n  ctx.fillText(txt, bx + 6, by + 9);"),
    ("ctx.fillStyle = active ? '#f5c842' : 'rgba(245,200,66,0.42)';",
     "ctx.fillStyle = active ? '#a9761a' : 'rgba(169,118,26,0.45)';"),
    ("const fill = color || '#f5c842';", "const fill = color || '#e2a20a';"),
    ("const rim  = color ? 'rgba(40, 80, 130, 0.95)' : 'rgba(140, 90, 0, 0.9)';",
     "const rim  = color ? 'rgba(40, 80, 130, 0.95)' : 'rgba(120, 78, 0, 0.85)';"),
    ("const glow = color ? 'rgba(94, 154, 217, 0.85)' : 'rgba(245, 200, 66, 0.85)';",
     "const glow = color ? 'rgba(94, 154, 217, 0.55)' : 'rgba(226, 162, 10, 0.45)';"),
    ("const stemColor = color ? 'rgba(94,154,217,0.6)' : 'rgba(245,200,66,0.65)';",
     "const stemColor = color ? 'rgba(94,154,217,0.6)' : 'rgba(180,128,10,0.7)';"),
    ("sideG.addColorStop(0, 'rgba(0,0,0,0.45)');", "sideG.addColorStop(0, 'rgba(52,66,88,0.20)');"),
    ("shadG.addColorStop(0, 'rgba(0,0,0,0.32)');", "shadG.addColorStop(0, 'rgba(52,66,88,0.18)');"),
]
for old, new in CANVAS_SUBS:
    if old not in app_js:
        print("  ! 画布替换未命中:", old[:50])
    app_js = app_js.replace(old, new)

# 画布上的字要补 CJK 字体族，否则中文回退到系统默认、字形不统一
FONTS = [
    ("'bold 8.5pt sans-serif'", "'bold 8.5pt \"PingFang SC\", \"Microsoft YaHei\", sans-serif'"),
    ('"Helvetica Neue", Arial, sans-serif',
     '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'),
]
for old, new in FONTS:
    n = app_js.count(old)
    print("  字体族补 CJK: %d 处 (%s)" % (n, old[:34]))
    app_js = app_js.replace(old, new)

# ══════════════════════════════════════════════════════════════════════
# 5. 站内相对链接 → 绝对链接（只动 <a>）
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
# 6. HTML 界面文案（中文）
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

html = html.replace('<meta name="theme-color" content="#0d1117" />',
                    '<meta name="theme-color" content="#eceff5" />')

# ── app.js 文案表 ──────────────────────────────────────────────────
mapping = {}
for f in ("js-ui.json", "js-explore.json"):
    mapping.update(json.loads(read(ZH / f)))
print("JS 词表条目:", len(mapping))

# 兜底：把 JS 词表也套用到 HTML 上，收掉只出现在标记里的文案
n_extra = 0
for en, zh in mapping.items():
    if en in html:
        html = html.replace(en, zh)
        n_extra += 1
print("  兜底替换到 HTML 的词条:", n_extra)


# ══════════════════════════════════════════════════════════════════════
# 7. app.js 文案翻译
# ══════════════════════════════════════════════════════════════════════
def norm(s):
    """把 \\uD83C\\uDFAF 这类代理对还原成一个字符，好与词表里的 emoji 对上。"""
    try:
        return s.encode("utf-16", "surrogatepass").decode("utf-16")
    except Exception:
        return s


hits = {}


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
    ("`Length = ${cm} cm`", "`长度 = ${cm} cm`"),
    ("`\\u2713 Correct! &nbsp;<strong>${correctTxt}</strong>`",
     "`\\u2713 正确！ &nbsp;<strong>${correctTxt}</strong>`"),
    ("`\\u2717 Incorrect &nbsp;| You entered: <strong>${escHtml(rawInput)} ${typedUnit()}</strong> &nbsp;| Answer: <strong>${correctTxt}</strong>`",
     "`\\u2717 错误 &nbsp;| 你输入的是：<strong>${escHtml(rawInput)} ${typedUnit()}</strong> &nbsp;| 正确答案：<strong>${correctTxt}</strong>`"),
    ('`<span class="qr-qnum">Q${i + 1}</span>`',
     '`<span class="qr-qnum">第 ${i + 1} 题</span>`'),
    ('`<span class="qr-correct">Correct: <strong>${displayLen(ans.correct)}</strong></span>`',
     '`<span class="qr-correct">正确答案：<strong>${displayLen(ans.correct)}</strong></span>`'),
    ('`<span class="qr-given">Your answer: <strong>${ans.givenTxt}</strong></span>`',
     '`<span class="qr-given">你的答案：<strong>${ans.givenTxt}</strong></span>`'),
]
for en, zh in TPL:
    if en not in app_js:
        print("  ! 模板字符串未命中:", en[:60])
    app_js = app_js.replace(en, zh)

# 中文括号要与结尾配对：JS 里闭合的那个 ')' 是共用的小字面量，
# 全局替换会误伤，所以按整句锚定单独修
BRACKET = [
    ("+ impLcTxt().replace(' in', '') + ').'",
     "+ impLcTxt().replace(' in', '') + '）。'"),
    ("+ (imp ? impLcTxt() : LC + ' mm') + ')';",
     "+ (imp ? impLcTxt() : LC + ' mm') + '）';"),
]
for en, zh in BRACKET:
    n = app_js.count(en)
    print("  修正括号配对: %d 处 (%s)" % (n, en[:40]))
    app_js = app_js.replace(en, zh)

print("app.js 命中词条: %d 条；未命中的词条 %d 条" % (len(hits), len(mapping) - len(hits)))
for k in mapping:
    if k not in hits:
        print("      未用:", repr(k[:70]))

# ══════════════════════════════════════════════════════════════════════
# 8. CSS 内联（含亮色覆盖）
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
# 9. JS 内联
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
      <span class="rt-desc">长度 &middot; mm / cm / m &middot; 换算过程</span>
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
