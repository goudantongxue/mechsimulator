# -*- coding: utf-8 -*-
"""
0.05 mm（20 分度）游标改为按格数标注：0 5 10 15 20。

原逻辑：公制游标一律按「十分之一毫米」标注 —— 间距 = 每 0.1 mm 的格数，
即 0.02 mm(50 分度) 每 5 格一个数字、0.05 mm(20 分度) 每 2 格一个数字、
0.1 mm(10 分度) 每格一个数字；数字本身是 j/间距 % 10，所以收尾回到 0。

改成：20 分度的这一档单独走「按格数」编号（与英制 0.001″ 那一档同样的路子），
间距 5、数字直接取格号 → 0 5 10 15 20，每个数字都是整数个最小分度值
（0 / 0.25 / 0.50 / 0.75 / 1.00 mm）。0.02 与 0.1 两档不动。

VSR 提示（读数区里"= 数字 N + k 格"）读的是同一条规则 getVernierLabelRule()，
所以间距一变它就自动跟着变（例如对齐在第 13 格 → "数字 10 + 3 格"），
不需要另改一处。夹持/判分/读数算术都不涉及数字，故不受影响。
"""
import re

# 1. 编号规则：20 分度单独一支
JS_OLD = """  } else {
    // Divisions per 0.1 mm — 5, 2 and 1 for the three metric scales.
    const tenth = Math.round(0.1 / lcMm);
    vLabelGap = tenth;"""

JS_NEW = """  } else if (vsdCount === 20) {
    // The 0.05 mm vernier is numbered BY DIVISION — 0 5 10 15 20 — so every
    // numeral is a whole number of least counts (0, 0.25, 0.50, 0.75, 1.00 mm)
    // and the count reads straight off the scale instead of through a
    // tenth-of-a-millimetre conversion. The 0.02 and 0.1 mm scales below keep
    // the real tenths engraving.
    vLabelGap = 5;
    vLabelVal = j => j;
  } else {
    // Divisions per 0.1 mm — 5 and 1 for the two remaining metric scales.
    const tenth = Math.round(0.1 / lcMm);
    vLabelGap = tenth;"""

# 2. 段首说明注释
COMMENT_OLD = """//     0.02 mm (50 div) → every 5th   0.05 mm (20 div) → every 2nd
//     0.1  mm (10 div) → every division"""

COMMENT_NEW = """//     0.02 mm (50 div) → every 5th      0.1 mm (10 div) → every division
// The 0.05 mm (20-division) scale is the deliberate exception: it is numbered
// BY DIVISION, 0 5 10 15 20, so every numeral is a whole number of least
// counts and the count reads straight off the scale."""

# 3. VSR 提示处的注释
BRIDGE_OLD = """  // Bridge: the coinciding line is rarely the one carrying the VSR, because the
  // numerals count in tenths. Say where the division count came from. Always
  // rendered (never toggled) so the tile cannot change height as the jaw moves."""

BRIDGE_NEW = """  // Bridge: where the coinciding line sits relative to the printed numerals.
  // On the 0.02 and 0.1 mm scales the numerals count in tenths, so the
  // coinciding line is rarely the one carrying the VSR; on the 0.05 mm scale
  // the numerals count divisions and the bridge is short. Always rendered
  // (never toggled) so the tile cannot change height as the jaw moves."""

# 4. 英文正文：编号段落收尾 + 表格行
EN_TEXT = [
    (
        " This simulator engraves it the real way.</p>",
        " This simulator engraves the 0.02&nbsp;mm and 0.1&nbsp;mm scales the real way. The 0.05&nbsp;mm (20-division) scale is the exception: it is numbered by division, <strong>0&nbsp;5&nbsp;10&nbsp;15&nbsp;20</strong>, so every numeral is a whole number of least counts and the count reads straight off the scale.</p>",
    ),
    (
        "<tr><td>0.05 mm (20-div)</td><td>0 1 2 &hellip; 9 0</td><td>0.1 mm</td><td>1</td></tr>",
        "<tr><td>0.05 mm (20-div) &mdash; <em>as engraved in this tool</em></td><td>0 5 10 15 20</td><td>0.25 mm</td><td>4</td></tr>",
    ),
]


def apply(app_js, html=None, english_text=True, say=print):
    if JS_OLD not in app_js:
        say("  ! 0.05 分度编号补丁未命中（源码可能已变）")
        return app_js, html
    app_js = app_js.replace(JS_OLD, JS_NEW, 1)
    say("  0.05 mm 游标：改为按格数标注 0 5 10 15 20")

    for old, new in [(COMMENT_OLD, COMMENT_NEW), (BRIDGE_OLD, BRIDGE_NEW)]:
        if old not in app_js:
            say("  ! 注释未命中:", old[:50].replace("\n", "\\n"))
        app_js = app_js.replace(old, new, 1)

    if english_text and html is not None:
        for old, new in EN_TEXT:
            if old not in html:
                say("  ! 英文正文未命中:", old[:60])
            html = html.replace(old, new, 1)
    return app_js, html
