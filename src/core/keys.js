/* Spot Agent · 全局快捷键：轻按 ⌥ 切模式，⇧⌥L 兜底，Esc 逐层退出 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.keys) return;

  var U = S.util;
  var alt = { at: 0, dirty: false };
  var MAX_HOLD = 600;   // 超过这个时长视为长按，不触发

  function reset() { alt.at = 0; alt.dirty = false; }

  function markDirty() {
    if (alt.at) alt.dirty = true;
  }

  function onDown(e) {
    /* 兜底组合键：Windows 下 Alt 单独会抢菜单栏焦点 */
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (e.code === "KeyL" || e.code === "KeyD") {
        e.preventDefault();
        S.state.toggleMode();
        return;
      }
      if (e.code === "KeyX") {
        e.preventDefault();
        S.state.setPaused(!S.state.raw.paused);
        S.overlay.toast(S.state.raw.paused ? "Spot Agent 已暂停" : "Spot Agent 已启用");
        return;
      }
    }

    if (e.key === "Escape") {
      /* 队列面板开着 → 先关它；光标在自家输入框 → 先撤焦点；都轮不到才动选区 */
      if (S.ui && S.ui.queueView && S.ui.queueView.isOpen()) {
        S.ui.queueView.close();
        e.preventDefault();
        return;
      }
      if (S.ui && S.ui.composer && S.ui.composer.isFocused()) return;
      if (S.input && S.input.escape()) e.preventDefault();
      return;
    }

    /* 只认"纯 Alt"按下 */
    if (e.key === "Alt" || e.key === "AltGraph") {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) { markDirty(); return; }
      alt.at = Date.now();
      alt.dirty = false;
      return;
    }

    /* 按住 Alt 期间按了别的键 → 这次不算切换 */
    if (alt.at) markDirty();
  }

  function onUp(e) {
    if (e.key !== "Alt" && e.key !== "AltGraph") return;
    var t = alt.at, dirty = alt.dirty;
    reset();
    if (!t || dirty) return;
    if (Date.now() - t > MAX_HOLD) return;
    if (U.isTyping()) return;
    if (!S.overlay.host) return;
    S.state.toggleMode();
  }

  function install() {
    root.addEventListener("keydown", onDown, true);
    root.addEventListener("keyup", onUp, true);
    root.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) reset();
    });
  }

  S.keys = { install: install, markDirty: markDirty };
})(globalThis);
