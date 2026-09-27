"""刻度尺页补丁：估读（Estimate）—— 游标可以停在两条刻线之间

原页把游标钉死在分度网格上（`grid()` = LC 或 1/IMP_DEN"），所以不管怎么拖，
读数永远是 42 或 42.5，不需要估读。本补丁加一个默认打开的「估读」开关：

  打开（默认）  落位网格细化到 0.1 mm —— 最小分度值 0.5 mm 的 1/5，
                也正是读数区本来就支持的位数（mm 一位小数、cm 两位小数）
  关闭          回到原来的手感：游标只停在分度上

只改「游标能停在哪」，不动刻线本身、不动 LC 的定义、不动单位换算式：
实现在 `grid()` 一处 —— 游标、尺条、题目池都从这张网格取值，所以改它一个
地方，拖动 / 滚轮 / 方向键 / 出题 / 吸附就都跟着走。另外：

  · 判分容差从「半个分度」改成按估读步进给（±0.15 mm），否则 0.1 mm 的
    目标值会变成 ±0.06 mm 的苛刻判定
  · 节拍声改成「跨过分度才响」—— 否则每挪 0.1 mm 响一声会变噪音
  · 练习/测验的题目池也按新网格出，估读才有得练

英制不参与：1/16" 的分数读数表达不了估读位，仍吸附到分度。
"""

CHIP = ('      <button class="opt-chip rb-tgl" id="opt-estimate" type="button" '
        'aria-pressed="true" title="Let the cursor stop between graduations and estimate '
        'the last digit (0.1 mm)">&#177;&nbsp;Estimate</button>\n')

ANCHOR_CHIP = '      <button class="opt-chip rb-tgl" id="opt-snap" type="button" aria-pressed="false" title="Snap cursor to common fastener / workshop sizes">&#8633;&nbsp;Snap</button>\n'

GRID_OLD = '''const grid    = () => state.system === 'imp' ? impStep() : LC;
const snapMM  = v  => Math.round(v / grid()) * grid();
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));'''

GRID_NEW = '''const EST_STEP   = 0.1;      // 估读步进：最小分度值的 1/5
const estimating = () => state.estimate === true && state.system !== 'imp';
const round4     = v  => Math.round(v * 1e4) / 1e4;
const grid    = () => estimating() ? EST_STEP
                 : (state.system === 'imp' ? impStep() : LC);
const snapMM  = v  => round4(Math.round(v / grid()) * grid());
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));'''

BOUNDS_OLD = '''const gridLo  = v  => Math.ceil (v / grid() - 1e-9) * grid();
const gridHi  = v  => Math.floor(v / grid() + 1e-9) * grid();
const clampG  = (v, lo, hi) => clamp(v, gridLo(lo), gridHi(hi));'''

BOUNDS_NEW = '''const gridLo  = v  => round4(Math.ceil (v / grid() - 1e-9) * grid());
const gridHi  = v  => round4(Math.floor(v / grid() + 1e-9) * grid());
const clampG  = (v, lo, hi) => clamp(v, gridLo(lo), gridHi(hi));

// 判分容差：估读时按估读步进给（±0.15 mm），否则仍是「半个分度」。
// 容差跟着 grid() 走会把 0.1 mm 的题目判成 ±0.06 mm，那是在考校准不是考研读。
const gradeTol = () => estimating() ? EST_STEP * 1.5
                                    : (state.system === 'imp' ? impStep() : LC) / 2 + 0.01;'''

TICK_OLD = '''function tickIfChanged() {
  const cur = state.mode === 'free' ? state.cursorMM : state.barMM;
  if (cur !== state.prevMM) {
    state.prevMM = cur;
    if (state.dragging) playTickSoft();
  }
}'''

TICK_NEW = '''function tickIfChanged() {
  const cur = state.mode === 'free' ? state.cursorMM : state.barMM;
  // 节拍声按「跨过一条分度」响，不按数值变化响 —— 开了估读之后每挪
  // 0.1 mm 响一声就成了噪音，而分度上的咔哒声才是它本来要模仿的东西。
  const gi  = Math.round(cur / (state.system === 'imp' ? impStep() : LC));
  if (gi !== state.prevMM) {
    state.prevMM = gi;
    if (state.dragging) playTickSoft();
  }
}'''

POOL_OLD = '''  } else {
    for (let m = BAR_MIN; m <= BAR_MAX; m++) pool.push(m);
  }
  return pool;'''

POOL_NEW = '''  } else {
    // 估读打开时题目也落在刻度之间，学生必须估读最后一位
    const st = grid();
    for (let i = Math.ceil(BAR_MIN / st - 1e-9); i <= Math.floor(BAR_MAX / st + 1e-9); i++)
      pool.push(round4(i * st));
  }
  return pool;'''

TOL_OLD = 'const ok      = Math.abs(inputMM - correct) < grid() / 2 + 0.01 || // within half a LC'
TOL_NEW = 'const ok      = Math.abs(inputMM - correct) < gradeTol() ||             // ±0.15 mm estimating, else half a LC'

STEP_OLD = '  if (inp && !imp) inp.step = String(LC);'
STEP_NEW = '  if (inp && !imp) inp.step = String(grid());   // 0.1 mm when estimating'

HANDLER_OLD = """$('opt-snap').addEventListener('click', function () {
  state.snapCommon = !state.snapCommon;
  this.setAttribute('aria-pressed', state.snapCommon ? 'true' : 'false');
  if (state.snapCommon && state.mode === 'free') {
    state.cursorMM = snapDist(state.cursorMM);
  }
  render();
});"""

HANDLER_NEW = HANDLER_OLD + """

// 估读开关：细化 / 复原落位网格。网格一变，游标和尺条都要重新对齐，
// 进行中的练习题作废重出（否则答案会在学生眼皮底下被改掉）；
// 测验中途不重出 —— 那 5 道题是按原来的网格发的。
$('opt-estimate').addEventListener('click', function () {
  state.estimate = !state.estimate;
  this.setAttribute('aria-pressed', state.estimate ? 'true' : 'false');
  state.cursorMM  = clampG(snapMM(state.cursorMM),  0, RULER_MM);
  state.cursor2MM = clampG(snapMM(state.cursor2MM), 0, RULER_MM);
  if (state.mode === 'quiz') { render(); return; }
  if (state.mode === 'practice') { showStepsBanner('practice', false); newPractice(); return; }
  state.barMM = clampG(snapMM(state.barMM), BAR_MIN, BAR_MAX);
  render();
});"""

# ── 英文文档：指南第 3 节补一句说明（中文对应文案在 zh/guide.html 里）──
EN_GUIDE_OLD = ('A subtle click sound confirms each snap to a graduation. Understanding these '
                'graduations is essential for accurate reading.</p>')
EN_GUIDE_NEW = ('A subtle click sound confirms each snap to a graduation. Understanding these '
                'graduations is essential for accurate reading.</p>\n'
                '        <p><strong>Estimate</strong> (on by default) also lets the cursor stop '
                '<em>between</em> two graduations, and the readout then carries one estimated '
                'digit &mdash; 0.1&nbsp;mm, a fifth of the millimetre graduation, which is the '
                'usual workshop convention. Practice answers are dealt on that same 0.1&nbsp;mm '
                'grid and are marked within &plusmn;0.15&nbsp;mm. Turn the option off to practise '
                'reading to the nearest graduation only.</p>')


def apply(html, app_js, english_text=True, say=print):
    """返回 (html, app_js)。"""
    say('估读开关（游标可停在刻度之间，0.1 mm）：')

    # ── app.js ──────────────────────────────────────────────────────
    for old, new, label in [
        ('  snapCommon  : false,     // snap to common fastener sizes\n',
         '  snapCommon  : false,     // snap to common fastener sizes\n'
         '  estimate    : true,      // 允许游标停在两条刻线之间（估读最后一位）\n',
         'state.estimate'),
        (GRID_OLD, GRID_NEW, 'grid/snapMM'),
        (BOUNDS_OLD, BOUNDS_NEW, 'gridLo/gridHi/clampG + gradeTol'),
        (TICK_OLD, TICK_NEW, 'tickIfChanged'),
        (POOL_OLD, POOL_NEW, 'barPool'),
        (TOL_OLD, TOL_NEW, '判分容差 ×2'),
        (STEP_OLD, STEP_NEW, 'input.step'),
        (HANDLER_OLD, HANDLER_NEW, '开关监听'),
    ]:
        n = app_js.count(old)
        say('  %-22s %d 处' % (label, n))
        if n == 0:
            say('  ! 未命中:', old[:60].replace('\n', '\\n'))
        app_js = app_js.replace(old, new)

    # ── HTML 新开关 ─────────────────────────────────────────────────
    if ANCHOR_CHIP not in html:
        say('  ! 未找到 Snap 按钮，开关无法插入')
    else:
        html = html.replace(ANCHOR_CHIP, ANCHOR_CHIP + CHIP, 1)
        say('  插入「估读」开关: 1 处')

    # ── 英文文档 ────────────────────────────────────────────────────
    if english_text:
        n = html.count(EN_GUIDE_OLD)
        say('  指南第 3 节补说明: %d 处' % n)
        if n == 0:
            say('  ! 英文指南段落未命中')
        html = html.replace(EN_GUIDE_OLD, EN_GUIDE_NEW)

    return html, app_js
