/* Spot Agent · 右上角控制浮窗：只有"我是谁 + 当前模式 + 两个开关" */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  var UI = (S.ui = S.ui || {});
  if (UI.panel) return;

  var P = {
    root: null, stat: null, seg: null, dens: null, clear: null, queue: null, qn: null,
    folded: false, pos: null
  };
  /* pos 为 null 时沿用 CSS 的右上角定位；一旦拖过就改成 left/top 自由摆放 */
  var DRAG = { on: false, moved: false, dx: 0, dy: 0, sx: 0, sy: 0 };

  /* 品牌贴纸三角（与 icons/icon.svg 同几何），直接内联，不额外发请求 */
  var MARK =
    '<svg viewBox="0 0 1024 1024" width="18" height="18" aria-hidden="true">' +
      '<defs><clipPath id="sa-tile"><rect width="1024" height="1024" rx="230"/></clipPath></defs>' +
      '<g clip-path="url(#sa-tile)">' +
        '<rect width="1024" height="1024" fill="#F29922"/>' +
        '<g transform="translate(328.53 98.52) scale(1.22)">' +
          '<path d="M83.17 9.41 L5.94 1149.97 C5.94 1149.97 434.62 724.54 929.59 778.22 Z" fill="#FFC516"/>' +
          '<circle cx="157.71" cy="394.33" r="88" fill="#FFFFFF"/>' +
          '<circle cx="148.71" cy="382" r="55" fill="#110E0B"/>' +
          '<rect x="673.52" y="522.73" width="170" height="170" rx="47" fill="#FFFFFF" transform="translate(-240.4 -476.52) rotate(18.08)"/>' +
          '<circle cx="279.28" cy="309.94" r="55" fill="#110E0B"/>' +
        '</g>' +
      '</g>' +
    '</svg>';

  P.mount = function () {
    if (P.root || !S.overlay.uiLayer) return;

    var box = document.createElement("div");
    box.className = "sa-panel";

    box.innerHTML =
      '<div class="sa-head">' +
        '<span class="sa-mark">' + MARK + '</span>' +
        '<span class="sa-name">Spot Agent</span>' +
        '<b class="sa-qn" title="队列条数">0</b>' +
        '<span class="sa-live" title="Design 模式指示"></span>' +
      '</div>' +
      '<div class="sa-seg" role="group" aria-label="模式">' +
        '<button type="button" data-mode="prototype">Prototype</button>' +
        '<button type="button" data-mode="design">Design</button>' +
      '</div>' +
      '<div class="sa-meta"><span class="sa-stat">原型模式</span></div>' +
      '<div class="sa-row">' +
        '<button type="button" class="sa-dens" aria-pressed="false">全部元素</button>' +
        '<button type="button" class="sa-clear">清空</button>' +
        '<button type="button" class="sa-qbtn">队列 0</button>' +
      '</div>';

    S.overlay.uiLayer.appendChild(box);

    P.root = box;
    P.stat = box.querySelector(".sa-stat");
    P.seg = box.querySelector(".sa-seg");
    P.dens = box.querySelector(".sa-dens");
    P.clear = box.querySelector(".sa-clear");
    P.queue = box.querySelector(".sa-qbtn");
    P.qn = box.querySelector(".sa-qn");

    P.seg.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      S.state.setMode(btn.getAttribute("data-mode"));
    });

    P.dens.addEventListener("click", function () {
      S.state.setDensity(S.state.raw.density === "all" ? "skeleton" : "all");
    });

    P.clear.addEventListener("click", function () {
      S.state.clearSelection();
      S.hit.resetSession();
    });

    P.queue.addEventListener("click", function () {
      if (S.ui.queueView) S.ui.queueView.toggle();
    });

    /* 收起态：拖着走就是移动位置，原地松手就是展开 */
    box.addEventListener("pointerdown", function (e) {
      if (!P.folded || e.button !== 0) return;
      var r = box.getBoundingClientRect();
      DRAG.on = true;
      DRAG.moved = false;
      DRAG.dx = e.clientX - r.left;
      DRAG.dy = e.clientY - r.top;
      DRAG.sx = e.clientX;
      DRAG.sy = e.clientY;
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有真实指针 */ }
    });

    box.addEventListener("pointermove", function (e) {
      if (!DRAG.on) return;
      if (!DRAG.moved) {
        if (Math.abs(e.clientX - DRAG.sx) + Math.abs(e.clientY - DRAG.sy) < 4) return;
        DRAG.moved = true;
        box.setAttribute("data-drag", "1");
      }
      P.setPos(e.clientX - DRAG.dx, e.clientY - DRAG.dy, false);
    });

    box.addEventListener("pointerup", function (e) {
      if (!DRAG.on) return;
      DRAG.on = false;
      box.removeAttribute("data-drag");
      try { box.releasePointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
      if (DRAG.moved) P.setPos(e.clientX - DRAG.dx, e.clientY - DRAG.dy, true);
    });

    /* 指针被系统抢走（切窗口、触控中断）时收尾，别留下半拖拽状态 */
    box.addEventListener("pointercancel", function (e) {
      if (!DRAG.on) return;
      DRAG.on = false;
      box.removeAttribute("data-drag");
      try { box.releasePointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
    });

    /* 拖完松手会补一个 click，得把它吃掉，否则一拖就展开 */
    box.addEventListener("click", function (e) {
      if (!P.folded) return;
      if (DRAG.moved) { DRAG.moved = false; return; }
      e.stopPropagation();
      P.unfold();
    });

    var saved = S.store ? S.store.get("panelPos", null) : null;
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") P.pos = saved;

    P.sync();
    P.applyPos();
  };

  /* 把 pos 夹进视口：小牌可以停在任意角落，但不能有一半跑出屏幕 */
  P.applyPos = function () {
    if (!P.root) return;
    if (!P.pos) {
      P.root.style.left = "";
      P.root.style.top = "";
      P.root.style.right = "";
      return;
    }
    var w = P.root.offsetWidth || 60;
    var h = P.root.offsetHeight || 36;
    var vw = S.overlay.vw, vh = S.overlay.vh;
    var x = Math.max(6, Math.min(P.pos.x, vw - w - 6));
    var y = Math.max(6, Math.min(P.pos.y, vh - h - 6));
    P.root.style.right = "auto";
    P.root.style.left = Math.round(x) + "px";
    P.root.style.top = Math.round(y) + "px";
  };

  P.setPos = function (x, y, persist) {
    P.pos = { x: x, y: y };
    P.applyPos();
    if (persist && S.store) S.store.set("panelPos", P.pos);
  };

  /* 回到默认的右上角 */
  P.resetPos = function () {
    P.pos = null;
    P.applyPos();
    if (S.store) S.store.set("panelPos", null);
  };

  P.isFolded = function () { return P.folded; };

  /* 页面一滚就收成一枚小牌，不再一直悬着一大块。
     队列窗口不跟着收：它是独立开的窗口，滚动不该把它弄没，只有 × / Esc 才关 */
  P.fold = function () {
    if (P.folded || !P.root) return;
    P.folded = true;
    P.root.setAttribute("data-fold", "1");
    P.applyPos();
  };

  P.unfold = function () {
    if (!P.folded || !P.root) return;
    P.folded = false;
    P.root.removeAttribute("data-fold");
    P.applyPos();
  };

  P.toggleFold = function () {
    if (P.folded) P.unfold();
    else P.fold();
  };

  P.sync = function () {
    if (!P.root) return;
    var st = S.state.raw;

    P.root.setAttribute("data-mode", st.mode);

    var btns = P.seg.querySelectorAll("button[data-mode]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-mode") === st.mode ? "true" : "false");
    }

    P.dens.setAttribute("aria-pressed", st.density === "all" ? "true" : "false");
    P.dens.textContent = st.density === "all" ? "结构视图" : "全部元素";

    var qn = S.queue ? S.queue.count() : 0;
    P.queue.textContent = "队列 " + qn;
    /* 收起成小牌时也要看得见队列条数；0 条时压暗，不抢眼 */
    if (P.qn) {
      P.qn.textContent = qn;
      P.qn.setAttribute("data-hot", qn > 0 ? "1" : "0");
    }

    if (st.paused) {
      P.stat.textContent = "已暂停 · ⇧⌥X 恢复";
    } else if (st.mode === "design") {
      P.stat.innerHTML = "<b>" + S.util.fmt(st.records.length) + "</b> 个元素 · 已选 " + st.selection.length;
    } else {
      P.stat.textContent = "原型模式";
    }
  };

  UI.panel = P;
})(globalThis);
