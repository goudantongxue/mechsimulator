# -*- coding: utf-8 -*-
"""
练习模式一进去就能作答。

原来 Practice 的判分要等一次「播放 → 暂停」：既进练习模式走的是 newQuiz()，
它把 state.quizTarget 置 0（= 还没出题）并禁用「判分」；唯一解禁的地方是
stopAnim()（点暂停），那里才把当前开口定为标准答案。

但 newQuiz() 其实已经把量爪随机摆到一个开口上了，而且练习模式下量爪本来就
拖不动（canDragJaws 只放行模拟模式或已装工件的场合），所以那个开口已经是一个
稳定、可作答的题目 —— 缺的只是"认定它"这一步。

本补丁把这一步补上：newQuiz() 直接认定当前开口为题目并解禁「判分」；
「播放 / 暂停」退化成可选的换题方式（想换一个开口就再摇一次）。
startAnim() 仍会在动画期间禁用「判分」，stopAnim() 仍会重新认定答案，
所以"不能对着正在动的读数判分"这条规则不变。
「测量工件」练法完全不动：判分仍需量爪真正接触工件（syncExerciseUi 控制）。
"""
import re

# 1. 认定初始开口为题目 + 解禁判分
JS_OLD = """  state.quizTarget = 0;
  state.answered   = false;

  $('practice-input').value = '';
  $('feedback').textContent = '';
  $('feedback').className   = 'feedback';
  $('btn-check').disabled   = true;"""

JS_NEW = """  // The jaws are already parked at a random opening, and in Practice they
  // cannot be dragged (canDragJaws only lets a graded mode through when a part
  // is loaded) — so that opening IS a usable question. Commit it here and
  // unlock Check immediately; Play/Pause becomes an optional re-roll.
  state.quizTarget = state.mm;
  state.answered   = false;

  $('practice-input').value = '';
  $('feedback').textContent = '';
  $('feedback').className   = 'feedback';
  $('btn-check').disabled   = false;"""

# 2. 英文指南文案
EN_TEXT = [
    (
        "<li><strong>Play / Pause</strong> &mdash; click <em>Play</em> to animate the caliper, then <em>Pause</em> to freeze it at a random opening. Read the scale and type the total reading.</li>",
        "<li><strong>Play / Pause</strong> &mdash; the caliper is already parked at a random opening when Practice opens, so you can read the scale and type the total reading straight away. Press <em>Play</em> to animate it and <em>Pause</em> to freeze it at a fresh opening whenever you want another one.</li>",
    ),
    (
        "<em>New</em> starts the next challenge and hands the bar back to the Play drill.",
        "<em>New</em> parks the jaws at another random opening and hands the bar back to the Play drill, ready to read.",
    ),
]


def apply(app_js, html=None, english_text=True, say=print):
    if JS_OLD not in app_js:
        say("  ! 练习出题补丁未命中（源码可能已变）")
        return app_js, html
    app_js = app_js.replace(JS_OLD, JS_NEW, 1)
    say("  练习模式：进入即可作答（newQuiz 直接认定题目）")

    if english_text and html is not None:
        for old, new in EN_TEXT:
            if old not in html:
                say("  ! 英文指南未命中:", old[:60])
            html = html.replace(old, new)
    return app_js, html
