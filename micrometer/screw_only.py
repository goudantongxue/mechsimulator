"""螺旋测微器页补丁：螺杆固定为 0.5 mm × 50

原页的「螺杆」是一对二选一按钮：

    0.5 mm × 50   → 螺距 0.5 mm，50 分度微分筒，套筒标整毫米 + 半毫米
    1 mm × 100    → 螺距 1 mm，100 分度微分筒，套筒只标整毫米

本次去掉 1 mm × 100 那一项，只留车间标准的 0.5 mm × 50，与卡尺页
「尺身固定按 cm 标注」（vernier/cm_only.py）是同一类改动。

引擎侧不需要动：`state.thimble100` 初始为 false，而唯一的写入点是
`setThimble()`，它只由 #thimble-toggle 里那个按钮的 click 事件触发
（已确认全文件仅此一处）。按钮删掉之后该状态不可能再变成 true，
`is100()` 恒为 false，因此 SI100 常数、100 分度的刻线间距等分支
自然失效但不影响任何一条现有路径 —— 保留它们是为了让这个补丁
可以整份删掉就回到原状。

用法：
    html, app_js = screw_only.apply(html, app_js)                    # 英文版
    html, app_js = screw_only.apply(html, app_js, english_text=False) # 中文版
"""

import re

# ══════════════════════════════════════════════════════════════════════
# 1. 删掉「1 mm × 100」这颗按钮（两种语言版本都做）
# ══════════════════════════════════════════════════════════════════════
PILL = re.compile(r'[ \t]*<button class="pill" data-value="100"[^>]*>[^<]*</button>\n')


def _drop_pill(html, say):
    html, n = PILL.subn('', html)
    say('  移除「1 mm × 100」按钮: %d 处' % n)
    if n != 1:
        say('  ! 预期命中 1 处，请检查原页结构是否变化')
    return html


# ══════════════════════════════════════════════════════════════════════
# 2. 英文版文档：不再承诺「两把公制螺杆可以切换」
# ══════════════════════════════════════════════════════════════════════
EN_SUBS = [
    # 7 节开头：三把外径千分尺 → 两把（公制 + 英制），并补上内径
    ('This simulator includes three fully independent <em>outside</em> micrometers '
     '&mdash; plus a depth micrometer on the <strong>Instrument</strong> pills (see&nbsp;7b):',
     'This simulator includes two fully independent <em>outside</em> micrometers &mdash; metric '
     'and imperial &mdash; plus depth and inside micrometers on the <strong>Instrument</strong> '
     'pills (see&nbsp;7b&ndash;7c):'),

    # 切换说明：螺杆不再是可切换项，改成交代「装的是哪一套」
    ('<p>Toggle units with the <strong>SI / Imperial</strong> pills and the metric screw with the '
     '<strong>Screw</strong> pills. The entire scale, tick marks, labels, readouts, formula, and '
     'practice/quiz answers update automatically. The Screw pills are hidden in Imperial: there is '
     'no 100-division inch thimble, because 0.025&Prime; &divide; 100 = 0.00025&Prime; is not a '
     'graduation anyone makes.</p>',
     '<p>Toggle units with the <strong>SI / Imperial</strong> pills. The entire scale, tick marks, '
     'labels, readouts, formula, and practice/quiz answers update automatically. The simulator '
     'fits the workshop-standard <strong>0.5&nbsp;mm&nbsp;&times;&nbsp;50</strong> metric screw, '
     'and the <strong>Screw</strong> readout beside it just names what is fitted. It is hidden in '
     'Imperial, and on the depth and inside micrometers &mdash; those are all built on that same '
     '0.5&nbsp;mm screw.</p>'),

    # 7b 节：深度模式下螺杆标注消失的原因
    ('The <strong>Screw</strong> pills disappear in Depth mode &mdash; a depth micrometer is built on the\n'
     '        0.5&nbsp;mm screw and there is no 1&nbsp;mm version to fit.',
     'The <strong>Screw</strong> readout disappears in Depth mode &mdash; a depth micrometer is built\n'
     '        on the 0.5&nbsp;mm screw.'),

    # 讲解第 1 步：字幕分支里不再有 1 mm 螺杆那一支
    ('The caption names the trap for the screw you have fitted &mdash; the half-millimetre marks on '
     'the 0.5&nbsp;mm screw, their absence on the 1&nbsp;mm&nbsp;&times;&nbsp;100 one, the '
     '0.025&Prime; divisions in Imperial.',
     'The caption names the trap for the screw you have fitted &mdash; the half-millimetre marks on '
     'the 0.5&nbsp;mm screw, or the 0.025&Prime; divisions in Imperial.'),

    ('The caption names the trap for the instrument you are holding: on the 0.5&nbsp;mm screw it '
     'reminds you that the marks <em>below</em> the datum are the half-millimetres; on the '
     '1&nbsp;mm&nbsp;&times;&nbsp;100 screw it points out there are no half-millimetre marks to miss '
     'at all.',
     'The caption names the trap for the instrument you are holding: on the 0.5&nbsp;mm screw it '
     'reminds you that the marks <em>below</em> the datum are the half-millimetres; in Imperial it '
     'points at the 0.025&Prime; sleeve divisions instead.'),

    # 正文里「两把之间切换」的说法
    ('and this instrument cannot make it. Switch between the two with the '
     '<strong>Screw</strong> pills and watch the barrel reading move while the total stays where '
     'it is.</p>',
     'and this instrument cannot make it. The simulator is built on the 0.5&nbsp;mm screw, so that '
     'is the version of the reading you get to practise.</p>'),

    # 结构化数据（FAQ）
    ('works on the 0.5 mm x 50, 1 mm x 100 and 40 TPI screws and on the depth and inside instruments',
     'works on the 0.5 mm x 50 metric and 40 TPI imperial screws and on the depth and inside '
     'instruments'),

    ('This simulator includes three fully independent instruments. SI (Metric): Pitch = 0.5 mm, '
     '50 thimble divisions, LC = 0.01 mm, range 0\u201315 mm, with whole millimetres above the datum '
     'line and half millimetres below. SI (1 mm screw): Pitch = 1 mm, 100 thimble divisions, '
     'LC = 0.01 mm \u2014 the same least count, but the sleeve carries only whole-millimetre marks. '
     'Imperial (Inch): Pitch = 0.025\u2033, 25 thimble divisions, LC = 0.001\u2033, range 0\u20131\u2033, '
     'barrel divided into 40ths of an inch. Use the SI / Imperial pills and the Screw pills.',
     'This simulator includes two fully independent outside micrometers. SI (Metric): Pitch = '
     '0.5 mm, 50 thimble divisions, LC = 0.01 mm, range 0\u201315 mm, with whole millimetres above the '
     'datum line and half millimetres below. Imperial (Inch): Pitch = 0.025\u2033, 25 thimble '
     'divisions, LC = 0.001\u2033, range 0\u20131\u2033, barrel divided into 40ths of an inch. Depth and '
     'inside micrometers are fitted with the Instrument pills. Toggle units with the SI / Imperial '
     'pills.'),

    ('and 5.00 + (73 \u00d7 0.01) on the 1 mm screw. The 1 mm screw also has a practical advantage '
     'for learners: because the spindle advances a whole millimetre per turn, the sleeve carries '
     'only whole-millimetre graduations, so there is no half-millimetre mark to overlook.',
     'and 5.00 + (73 \u00d7 0.01) on the 1 mm screw. The simulator is built on the 0.5 mm screw, so '
     'the half-millimetre trap is the one it teaches.'),
]

# 整段替换（用正则吃整段，避开正文里的各种弯引号）
EN_PARA_DROP = (
    re.compile(r'[ \t]*<li><strong>SI \(Metric\), 1&nbsp;mm &times; 100:</strong>[^\n]*</li>\n'),
    re.compile(r'<p><strong>Why a second metric screw\?</strong>.*?</p>', re.S),
)
EN_PARA_NEW = (
    '',
    '<p><strong>Why 0.5&nbsp;mm and not 1&nbsp;mm?</strong> A micrometer with a 1&nbsp;mm pitch and '
    '100 thimble divisions reads to exactly the same 0.01&nbsp;mm, but 0.5&nbsp;mm &times; 50 is the '
    'instrument you will actually pick up &mdash; and it is the one that can be misread. '
    'Half-millimetre marks sit <em>below</em> the datum line, and overlooking one &mdash; reporting '
    '5.23&nbsp;mm for a part that measures 5.73&nbsp;mm &mdash; is the commonest metric micrometer '
    'error there is. So the simulator fits the screw that can make that mistake rather than the one '
    'that cannot; the 1&nbsp;mm &times; 100 instrument is worked through in the article below.</p>',
)


def _apply_en(html, say):
    for old, new in EN_SUBS:
        n = html.count(old)
        if n == 0:
            say('  ! 英文文案未命中: %s…' % old[:56].replace('\n', '\\n'))
        html = html.replace(old, new)
    for pat, new in zip(EN_PARA_DROP, EN_PARA_NEW):
        html, n = pat.subn(new, html, count=1)
        say('  英文整段替换: %d 处 (%s…)' % (n, pat.pattern[:44]))
    return html


# app.js 里也有一处承诺「可以切螺杆」——浏览模式那张 1 mm × 100 卡片的建议框。
# （中文版对应文案在 zh/js-explore.json 的那条 value 里）
EN_JS_SUBS = [
    ('Switch between the two with the <strong>Screw</strong> pills and watch the barrel reading '
     'jump while the total stays put.',
     'Both screws land on the same total &mdash; only the split between the two scales changes.'),
]


def _apply_en_js(app_js, say):
    for old, new in EN_JS_SUBS:
        n = app_js.count(old)
        if n == 0:
            say('  ! app.js 英文文案未命中: %s…' % old[:56])
        app_js = app_js.replace(old, new)
    return app_js


# ══════════════════════════════════════════════════════════════════════
# 3. 中文版只需删按钮，文案在 zh/ 下的源文件里改
# ══════════════════════════════════════════════════════════════════════
def apply(html, app_js, english_text=True, say=print):
    """返回 (html, app_js)。"""
    say('螺杆固定为 0.5 mm × 50：')
    html = _drop_pill(html, say)
    if english_text:
        html = _apply_en(html, say)
        app_js = _apply_en_js(app_js, say)
    else:
        say('  （中文文案在 zh/guide.html、zh/article.html、zh/jsonld.html、zh/js-explore.json 里）')
    return html, app_js
