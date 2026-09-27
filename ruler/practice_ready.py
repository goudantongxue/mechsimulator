"""刻度尺页补丁：一进练习模式（以及点「换一题」）就能立刻作答

原页把「判分」按钮锁住，只有 `stopAnim()` 会解锁 —— 也就是必须先跑一次
播放→暂停，工具才「认定」题目。和卡尺页 `vernier/practice_ready.py` 同一个毛病。

实际上 `newPractice()` 一进来就已经把题目定死了：

    state.barMM = randomBarMM();        // 这就是答案

练习模式下量尺的游标拖不动（`onPointerMove` 里只有 `free` 模式会改
`state.cursorMM`，其它模式拖动只改 `state.scrollMM` 滚动视图），
`measuredMM()` 也是 `state.mode === 'free' ? cursorMM : barMM` ——
所以开口一直是工具定的，学生只是不必再按一次播放来「确认出题」。

本页比卡尺页还多一处：S-7 场景模式把 `newPractice` 包了一层，
自己复制了一遍「锁住判分」的代码（`btn-check.disabled = true`），
两处都要改，否则打开「场景」开关又会退回旧行为。

另外：这一页**根本没有播放/暂停按钮** —— `startAnim()` 定义了但没有任何
调用点，`state.playing` 恒为 false。所以第 5 条需求在这里退化成"删掉判分
闸门"即可，`startAnim`/`stopAnim` 一律不动。

用法：
    html, app_js = practice_ready.apply(html, app_js)
"""

# ══════════════════════════════════════════════════════════════════════
# 两处「锁住判分」→ 放开。都用上下文锚定，避免误伤同名代码。
# 判分按钮的空值保护仍在：practice-input 的 input 事件里
# (`disabled = value === ''`) 会随输入同步，所以进题时按钮可点、
# 输入为空时点它得到的是「Enter a number first.」提示，不会误判。
# ══════════════════════════════════════════════════════════════════════
SUBS = [
    # newPractice() —— 常规出题
    ("  $('dr-label').textContent          = 'Your Reading';\n"
     "  $('btn-check').disabled = true;\n"
     "\n"
     "  setTimeout(() => $('practice-input').focus(), 50);",
     "  $('dr-label').textContent          = 'Your Reading';\n"
     "  $('btn-check').disabled = false;\n"
     "\n"
     "  setTimeout(() => $('practice-input').focus(), 50);"),

    # S-7 场景模式包装过的那份 newPractice()
    ("    $('dr-label').textContent          = 'Your Reading';\n"
     "    $('btn-check').disabled = true;\n"
     "    setTimeout(() => $('practice-input').focus(), 50);",
     "    $('dr-label').textContent          = 'Your Reading';\n"
     "    $('btn-check').disabled = false;\n"
     "    setTimeout(() => $('practice-input').focus(), 50);"),
]


def apply(html, app_js, english_text=True, say=print):
    """返回 (html, app_js)。english_text 参数为与其它补丁模块保持签名一致。"""
    say('练习模式改为进入即可作答：')
    for old, new in SUBS:
        n = app_js.count(old)
        say('  解锁判分: %d 处 (%s…)' % (n, old.strip().splitlines()[1].strip()[:44]))
        if n != 1:
            say('  ! 预期命中 1 处，请检查原页结构是否变化')
        app_js = app_js.replace(old, new)
    return html, app_js
