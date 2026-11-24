/* Spot Agent · 指针拦截：Design 模式下接管点击与拖拽，Prototype 模式完全放行 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.input) return;

  var U = S.util;
  var down = null;      // {x,y,moved,id}
  var hx = 0, hy = 0, hoverRaf = 0;
  var installed = false;

  function active() { return S.state.isActive(); }

  function queueHover(x, y) {
    hx = x; hy = y;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(function () {
      hoverRaf = 0;
      if (!active()) return;
      S.state.setHover(S.hit.hover(hx, hy));
    });
  }

  function onDown(e) {
    if (!active() || U.isOwnEvent(e)) return;
    if (e.button !== 0) return;              // 右键/中键放行，保留页面菜单
    if (e.altKey) S.keys.markDirty();        // Option+拖拽不算模式切换

    down = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onMove(e) {
    if (!active()) {
      if (S.state.raw.hover) S.state.setHover(null);
      return;
    }
    if (U.isOwnEvent(e)) return;

    if (down) {
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.moved && Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
      if (down.moved) {
        S.state.setMarquee({ x: down.x, y: down.y, w: dx, h: dy });
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }

    queueHover(e.clientX, e.clientY);
  }

  function onUp(e) {
    if (!active() || !down) return;
    var d = down;
    down = null;
    if (e.button === 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    if (d.moved) {
      var res = S.hit.marquee({ x: d.x, y: d.y, w: e.clientX - d.x, h: e.clientY - d.y });
      S.state.setMarquee(null);
      if (res.list.length) {
        if (e.shiftKey || e.metaKey || e.ctrlKey) S.state.addToSelection(res.list);
        else S.state.setSelection(res.list);
        S.overlay.toast("已选 " + res.list.length + " 个元素");
      } else {
        S.overlay.toast("框内没有可识别元素");
      }
      S.hit.resetSession();
      S.keys.markDirty();
      return;
    }

    /* 单击：同一位置连续点击逐层向外，⇧ 向内 */
    var rec = S.hit.pick(e.clientX, e.clientY, e.shiftKey ? -1 : 1);
    if (!rec) return;
    if (e.metaKey || e.ctrlKey) S.state.toggleSelection(rec);
    else S.state.setSelection([rec]);
  }

  /* preventDefault 之后 click 仍会补发，必须一起吃掉，否则会触发页面的 tab 切换/下钻 */
  function onClick(e) {
    if (!active() || U.isOwnEvent(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onCancel() {
    if (!down) return;
    down = null;
    S.state.setMarquee(null);
  }

  function escape() {
    if (!active()) return false;
    if (S.state.raw.selection.length) {
      S.state.clearSelection();
      S.hit.resetSession();
      return true;
    }
    if (S.state.raw.marquee) { S.state.setMarquee(null); return true; }
    var rec = S.hit.escapeStep();
    if (rec) { S.state.setSelection([rec]); return true; }
    return false;
  }

  function install() {
    if (installed) return;
    installed = true;

    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("pointermove", onMove, true);
    root.addEventListener("pointerup", onUp, true);
    root.addEventListener("pointercancel", onCancel, true);
    root.addEventListener("click", onClick, true);
    root.addEventListener("dblclick", onClick, true);
    root.addEventListener("dragstart", onClick, true);

    document.addEventListener("selectstart", function (e) {
      if (active() && !U.isOwnEvent(e)) e.preventDefault();
    }, true);
  }

  S.input = {
    install: install,
    escape: escape,
    isActive: active,
    isInstalled: function () { return installed; }
  };
})(globalThis);
