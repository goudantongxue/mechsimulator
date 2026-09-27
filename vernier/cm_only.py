# -*- coding: utf-8 -*-
"""
只保留 cm：去掉画布工具栏上的 mm 按钮，尺身固定按厘米标注。

适用两个构建（英文亮色版 build.py / 中文版 build_zh.py），所以抽成共用模块。

改动点：
  1. HTML  —— 删除 mm 按钮；cm 按钮改为默认 active；去掉 data-display-memory
              （display-memory 要求分段组至少 2 个按钮，只剩 1 个时它会跳过，
                留着这个属性没有意义）。
  2. app.js —— state.beamUnit 默认值 'mm' → 'cm'。
  3. 文案   —— 指南与正文里"两种标注可切换"的说法改为"固定按厘米标注"
              （仅英文版需要，中文版的正文来自 zh/ 下的文件）。
"""
import re

# 1. 删除 mm 按钮（含其前面的换行与缩进）
MM_BTN = re.compile(r'\s*<button[^>]*id="btn-beam-mm".*?</button>', re.S)

# cm 按钮从"未选中"变成"默认选中"
CM_OPEN_OLD = 'class="zoom-toggle seg-btn" id="btn-beam-cm"'
CM_OPEN_NEW = 'class="zoom-toggle seg-btn active" id="btn-beam-cm"'
CM_PRESSED_OLD = 'data-beam-unit="cm" aria-pressed="false"'
CM_PRESSED_NEW = 'data-beam-unit="cm" aria-pressed="true"'
WRAP_OLD = '<div data-display-memory class="beam-unit-wrap">'
WRAP_NEW = '<div class="beam-unit-wrap">'

# 2. 状态默认值
STATE_OLD = "  beamUnit: 'mm',"
STATE_NEW = "  beamUnit: 'cm',"
STATE_COMMENT_OLD = """  // so this is display only and never touches a reading. 'mm' is the default
  // because it is what this tool has always drawn."""
STATE_COMMENT_NEW = """  // so this is display only and never touches a reading. 'cm' is the only
  // option offered here; the mm/mm engraving has been removed."""

# 3. 英文正文文案
EN_TEXT = [
    (
        "<li>Switch the beam between <strong>mm</strong> and <strong>cm</strong> numbering with the pair of buttons on the canvas toolbar. Real 150&nbsp;mm calipers are sold engraved both ways &mdash; 10&nbsp;20&nbsp;30 or 1&nbsp;2&nbsp;3 on the same graduation lines &mdash; so practise on whichever matches the caliper in your hand. It is display only and changes no reading.</li>",
        "<li>The beam is numbered in <strong>centimetres</strong> &mdash; 1&nbsp;2&nbsp;3 on the same graduation lines a millimetre-engraved caliper marks 10&nbsp;20&nbsp;30. It is display only and changes no reading.</li>",
    ),
    (
        '<h4 style="margin-top:14px">mm or cm on the beam &mdash; both are correct</h4>',
        '<h4 style="margin-top:14px">the beam is numbered in cm</h4>',
    ),
    (
        "Real 150&nbsp;mm calipers ship with the beam numbered either way: <strong>10&nbsp;20&nbsp;30&hellip;</strong> in millimetres, or <strong>1&nbsp;2&nbsp;3&hellip;</strong> in centimetres with the same graduation lines. Neither is more accurate &mdash; they are the same scale with different numerals &mdash; but a student who learned on one and is handed the other will misread it by a factor of ten. The <strong>mm&nbsp;|&nbsp;cm</strong> toggle above the canvas switches the beam numbering so you can practise on whichever engraving you actually own. It is display only: it changes no reading, no least count and no answer.",
        "Real 150&nbsp;mm calipers ship with the beam numbered either way: <strong>10&nbsp;20&nbsp;30&hellip;</strong> in millimetres, or <strong>1&nbsp;2&nbsp;3&hellip;</strong> in centimetres &mdash; the same graduation lines with different numerals. Neither is more accurate, but a student who learned on one and is handed the other will misread it by a factor of ten. This simulator numbers the beam in <strong>centimetres</strong>. It is display only: it changes no reading, no least count and no answer.",
    ),
]


def apply(html, app_js, english_text=True, say=print):
    html, n_mm = MM_BTN.subn("", html, count=1)
    say("  mm 按钮移除: %d 处" % n_mm)

    for old, new in [
        (CM_OPEN_OLD, CM_OPEN_NEW),
        (CM_PRESSED_OLD, CM_PRESSED_NEW),
        (WRAP_OLD, WRAP_NEW),
    ]:
        if old not in html:
            say("  ! 未命中:", old[:60])
        html = html.replace(old, new)

    for old, new in [(STATE_OLD, STATE_NEW), (STATE_COMMENT_OLD, STATE_COMMENT_NEW)]:
        if old not in app_js:
            say("  ! app.js 未命中:", old[:50])
        app_js = app_js.replace(old, new)

    if english_text:
        for old, new in EN_TEXT:
            if old not in html:
                say("  ! 英文正文未命中:", old[:60])
            html = html.replace(old, new)
    return html, app_js
