/* Spot Agent · 启动器：装配覆盖层、UI、快捷键与失效重建 */
(function (root) {
  "use strict";

  var S = root.__SPOT__;
  if (!S) return;
  if (S.booted) return;

  var U = S.util;

  /* 已经挂过就别重复注入（扩展热重载 / 书签脚本重复点击） */
  if (document.getElementById(U.HOST_ID)) { S.booted = true; return; }
  if (!document.documentElement) return;
  S.booted = true;

  var scrollTimer = 0;

  function rescan() {
    if (S.state.raw.mode !== "design") { S.render.draw(); return; }
    S.scan.run();
    S.render.draw();
    S.ui.composer.sync();
  }

  var debouncedRescan = U.debounce(rescan, 180);

  function onScroll() {
    /* 页面一动就把浮窗收成小牌，别一直悬着一大块；点它才展开 */
    if (window.scrollY > 24 && S.ui.panel) S.ui.panel.fold();
    if (!S.state.isActive()) return;
    /* 滚动时先清空，避免结构框钉在旧位置产生鬼影 */
    S.overlay.clear();
    S.overlay.domLayer.textContent = "";
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(rescan, 80);
  }

  var onResize = U.debounce(function () {
    S.overlay.size();
    rescan();
    if (S.ui.panel) S.ui.panel.applyPos();
    if (S.ui.queueView) S.ui.queueView.place();
  }, 120);

  function onState(type) {
    /* 输入卡关心模式、选区、队列三样，统一在入口刷一次 */
    if (type !== "render" && S.ui.composer) S.ui.composer.sync();
    if (type === "mode") {
      S.overlay.setModeAttr(S.state.raw.mode);
      S.hit.resetSession();
      if (S.state.raw.mode === "design") S.scan.run();
      S.render.draw();
      S.ui.panel.sync();
      return;
    }
    if (type === "density") { rescan(); S.ui.panel.sync(); return; }
    if (type === "paused") { S.render.draw(); S.ui.panel.sync(); return; }
    if (type === "records") { S.ui.panel.sync(); return; }
    if (type === "selection") { S.ui.panel.sync(); return; }
    if (type === "queue") {
      S.ui.panel.sync();
      if (S.ui.queueView) S.ui.queueView.sync();
      return;
    }
    if (type === "render") { S.render.schedule(); return; }
  }

  function watch() {
    /* 页面自己改 DOM（切 tab、下钻、翻页）后重建快照 */
    if (root.MutationObserver) {
      var mo = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var t = records[i].target;
          if (t && t.nodeType === 1 && t.id === U.HOST_ID) continue;
          if (S.state.raw.mode !== "design") return;
          debouncedRescan();
          return;
        }
      });
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden"]
      });
    }

    root.addEventListener("scroll", onScroll, { passive: true, capture: true });
    root.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) S.render.draw();
    });
  }

  /* 页面内自检：控制台运行 __SPOT__.selfTest() */
  S.selfTest = function () {
    var out = [];
    function check(name, ok, extra) {
      out.push({ name: name, ok: !!ok, extra: extra === undefined ? null : extra });
    }
    check("host 已挂载", !!document.getElementById(U.HOST_ID));
    check("ShadowRoot 可用", !!(S.overlay.shadow && S.overlay.shadow.querySelector(".sa-panel")));
    check("canvas 已按 DPR 放大", S.overlay.canvas.width >= S.overlay.vw, S.overlay.canvas.width + "px");
    check("指针层存在", !!S.overlay.domLayer);

    var before = S.state.raw.mode;
    S.state.setMode("design");
    var t = S.scan.run();
    check("扫描出元素", t.count > 20, t.count + " 个 / " + t.ms + "ms");
    check("Design 模式已生效", S.state.raw.mode === "design");
    check("结构框可绘制", S.overlay.ctx.getImageData(1, 1, 1, 1) !== null);

    S.state.setMode(before === "design" ? "design" : "prototype");

    var pass = true;
    for (var i = 0; i < out.length; i++) if (!out[i].ok) pass = false;
    return { pass: pass, checks: out };
  };

  function boot() {
    var step = "overlay";
    try {
      S.overlay.mount();
      step = "panel";
      S.ui.panel.mount();
      step = "queue";
      S.ui.queueView.mount();
      step = "composer";
      S.ui.composer.mount();
      step = "keys";
      S.keys.install();
      step = "input";
      S.input.install();
      step = "state";
      S.state.on(onState);
      step = "watch";
      watch();
      step = "store";
    } catch (e) {
      S.bootError = step + ": " + (e && e.message ? e.message : String(e));
      console.error("[Spot] 启动失败", S.bootError, e);
      try { S.overlay.toast("Spot Agent 启动失败：" + S.bootError); } catch (ignore) { /* noop */ }
      return;
    }

    S.store.init().then(function () {
      S.state.hydrate();
      S.overlay.setModeAttr(S.state.raw.mode);
      if (S.state.raw.mode === "design") S.scan.run();
      S.render.draw();
      S.ui.panel.sync();
      S.ui.queueView.sync();
      S.ui.composer.sync();
      S.ui.composer.ping();
      S.overlay.toast("Spot Agent 就绪 · 轻按 ⌥ 进入 Design");
    }).catch(function (e) {
      S.bootError = "store: " + (e && e.message ? e.message : String(e));
      console.error("[Spot] 状态回填失败", S.bootError, e);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(globalThis);
