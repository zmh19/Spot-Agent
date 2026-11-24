/* Spot Agent · 无头回归脚本
   被 dev/verify.sh 注入到 dashboard 的临时副本里执行，结果写进 document.title，
   由 headless Chrome 的 --dump-dom 抓回。不截图、不打开用户浏览器、不改动目标项目。 */
window.__SPOT_ERRS = [];
window.addEventListener("error", function (e) {
  window.__SPOT_ERRS.push(String(e.message) + " @" + e.lineno + ":" + e.colno);
});
window.addEventListener("unhandledrejection", function (e) {
  window.__SPOT_ERRS.push("reject:" + String(e.reason));
});

window.addEventListener("load", function () {
  setTimeout(function () {
    var out = [];
    var fails = [];
    function log(k, v) { out.push(k + "=" + v); }
    function expect(k, cond, extra) {
      log(k, (cond ? "PASS" : "FAIL") + (extra === undefined ? "" : "(" + extra + ")"));
      if (!cond) fails.push(k);
    }

    var S = window.__SPOT__;
    if (!S) { document.title = "SPOTTEST NO_NAMESPACE"; return; }

    try {
      if (window.__SPOT_ERRS.length) out.push("ERRS:" + window.__SPOT_ERRS.join(" ~ "));

      /* ---------- 1. 挂载与自检 ---------- */
      var r = S.selfTest();
      expect("selfTest", r.pass, r.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; }).join(","));
      expect("bootError", !S.bootError, S.bootError || "-");
      expect("pointerInstalled", S.input.isInstalled());
      expect("defaultMode", S.state.raw.mode === "prototype", S.state.raw.mode);

      var host = document.getElementById("__spot_host");
      expect("shadowMounted", !!(host && host.shadowRoot && host.shadowRoot.querySelector(".sa-panel")));
      expect("canvasSized", S.overlay.canvas.width >= S.overlay.vw, S.overlay.canvas.width + "x" + S.overlay.canvas.height);

      /* ---------- 1b. ⌥ 轻按切换 ---------- */
      var panelEl = host.shadowRoot.querySelector(".sa-panel");
      var pr0 = panelEl.getBoundingClientRect();
      expect("panelTopRight", pr0.width > 200 && pr0.right <= window.innerWidth + 1 && pr0.top < 40,
        Math.round(pr0.width) + "w @" + Math.round(pr0.top) + "," + Math.round(pr0.right));

      /* ---------- 1a. 品牌视觉：中性黑玻璃（不掺暖灰）+ 黄药丸 ---------- */
      var pcs = getComputedStyle(panelEl);
      var pbg = pcs.backgroundColor || "";
      var nums = (pbg.match(/[\d.]+/g) || []).map(Number);
      var alpha = nums.length === 4 ? nums[3] : 1;
      expect("panelGlass", nums.length === 4 && nums[0] === nums[1] && nums[1] === nums[2] &&
        nums[0] < 24 && alpha > 0.4 && alpha < 0.72,
        pbg + " a=" + alpha);
      expect("panelBlur", String(pcs.backdropFilter || pcs.webkitBackdropFilter || "").indexOf("blur") >= 0,
        pcs.backdropFilter);
      var pressedBtn = panelEl.querySelector('.sa-seg button[aria-pressed="true"]');
      var pbgc = pressedBtn ? getComputedStyle(pressedBtn).backgroundColor : "";
      expect("segBrandYellow", pbgc === "rgb(255, 197, 22)", pbgc);
      var mark = panelEl.querySelector(".sa-mark svg");
      expect("brandMark", !!mark && !!mark.querySelector("path") &&
        mark.querySelectorAll("circle").length >= 3 &&
        getComputedStyle(mark.querySelector("g > rect")).fill === "rgb(242, 153, 34)",
        mark ? mark.querySelectorAll("circle").length + " 个圆 / 橘砖 " +
          getComputedStyle(mark.querySelector("g > rect")).fill : "无图标");
      expect("noHintLine", panelEl.querySelector(".sa-hint") === null && panelEl.querySelectorAll("div").length <= 4,
        panelEl.querySelectorAll("div").length + " 个 div");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
      expect("altTogglesDesign", S.state.raw.mode === "design", S.state.raw.mode);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
      expect("altTogglesBack", S.state.raw.mode === "prototype", S.state.raw.mode);

      /* ---------- 1c. 滚动收起成小牌 / 点击展开 ---------- */
      window.scrollTo(0, 400);
      window.dispatchEvent(new Event("scroll"));
      var canScroll = window.scrollY > 24;
      expect("foldOnScroll", !canScroll || panelEl.getAttribute("data-fold") === "1",
        "scrollY=" + Math.round(window.scrollY) + " fold=" + panelEl.getAttribute("data-fold"));
      if (panelEl.getAttribute("data-fold") === "1") {
        var pf = panelEl.getBoundingClientRect();
        expect("foldedTiny", pf.width < 64 && pf.right <= window.innerWidth + 1 && pf.top < 40,
          Math.round(pf.width) + "x" + Math.round(pf.height) + " @" + Math.round(pf.top));
        expect("foldedHidesSeg", getComputedStyle(panelEl.querySelector(".sa-seg")).display === "none");
        panelEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        expect("clickUnfolds", panelEl.getAttribute("data-fold") !== "1" &&
          getComputedStyle(panelEl.querySelector(".sa-seg")).display !== "none",
          "fold=" + panelEl.getAttribute("data-fold"));
      }
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("scroll"));

      /* ---------- 1d. 收起态可自由拖动 ---------- */
      S.ui.panel.fold();
      var pb = panelEl.getBoundingClientRect();
      var px0 = pb.left + 8, py0 = pb.top + 8;
      function pev(type, x, y) {
        panelEl.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true,
          clientX: x, clientY: y, button: 0, buttons: type === "pointermove" ? 1 : 0,
          pointerId: 7, isPrimary: true, pointerType: "mouse"
        }));
      }
      pev("pointerdown", px0, py0);
      pev("pointermove", px0 - 280, py0 + 260);
      pev("pointerup", px0 - 280, py0 + 260);

      var pb2 = panelEl.getBoundingClientRect();
      expect("foldDraggable", Math.abs(pb2.left - (pb.left - 280)) < 3 &&
        Math.abs(pb2.top - (pb.top + 260)) < 3,
        Math.round(pb.left) + "," + Math.round(pb.top) + " → " +
        Math.round(pb2.left) + "," + Math.round(pb2.top));
      expect("dragStaysFolded", panelEl.getAttribute("data-fold") === "1");
      expect("dragPosSaved", !!S.store.get("panelPos", null),
        JSON.stringify(S.store.get("panelPos", null)));

      /* 拖完那一下的 click 不能把面板弹开 */
      panelEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect("dragClickSwallowed", panelEl.getAttribute("data-fold") === "1");
      panelEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect("secondClickUnfolds", panelEl.getAttribute("data-fold") !== "1");
      S.ui.panel.resetPos();

      /* ---------- 2. Design 模式：结构框 ---------- */
      S.state.setMode("design");
      var scan = S.scan.run();
      expect("designOn", S.state.raw.mode === "design");
      expect("scanCount", scan.count > 100, scan.count + " 个 / " + scan.ms + "ms");
      var px = S.overlay.ctx.getImageData(0, 0, 320, 320).data;
      var ink = 0;
      for (var pi = 3; pi < px.length; pi += 4) if (px[pi] > 0) ink++;
      expect("boxesDrawn", ink > 200, ink + " px 上墨");

      /* ---------- 3. 命中：单击 / 向外 / 向内 ---------- */
      function fire(type, x, y, opts) {
        var target = document.elementFromPoint(x, y) || document.body;
        var base = {
          bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
          button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true,
          buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0
        };
        if (opts) for (var k in opts) base[k] = opts[k];
        target.dispatchEvent(new PointerEvent(type, base));
        return target;
      }
      function clickAt(x, y, opts) {
        fire("pointerdown", x, y, opts);
        fire("pointerup", x, y, opts);
      }
      function selName(i) {
        var s = S.state.raw.selection;
        return s.length > (i || 0) ? S.snapshot.selector(s[i || 0].el) : "none";
      }

      S.state.clearSelection();
      clickAt(760, 420);
      expect("clickSelect", S.state.raw.selection.length === 1, selName(0));
      var first = selName(0);

      clickAt(760, 420);
      expect("clickOutward", selName(0) !== first, first + " → " + selName(0));

      var beforeIn = selName(0);
      clickAt(760, 420, { shiftKey: true });
      expect("shiftInward", selName(0) !== beforeIn, beforeIn + " → " + selName(0));

      /* ---------- 3b. 文字级元素必须选得到（以前只能选到容器） ---------- */
      var textEl = null, textPt = null;
      var cands = document.querySelectorAll("p, span, b, em, strong, li, h2, h3, small, code");
      for (var ci = 0; ci < cands.length; ci++) {
        var cel = cands[ci];
        var node = null;
        for (var cn = cel.firstChild; cn; cn = cn.nextSibling) {
          if (cn.nodeType === 3 && cn.textContent.trim().length > 4) { node = cn; break; }
        }
        if (!node) continue;
        var rg = document.createRange();
        rg.selectNodeContents(node);
        var box = rg.getClientRects()[0];
        if (!box || box.width < 12 || box.height < 8) continue;
        if (box.top < 120 || box.bottom > window.innerHeight - 260 || box.left < 20) continue;
        textEl = cel;
        textPt = { x: box.left + Math.min(6, box.width / 3), y: box.top + box.height / 2 };
        break;
      }
      if (textEl) {
        expect("textPickable", S.scan.pickable(textEl) === true, S.scan.label(S.scan.one(textEl) || {}));
        var stack = S.hit.layersAt(textPt.x, textPt.y);
        expect("textInLayers", stack.length > 0 && (stack[0] === textEl || textEl.contains(stack[0])),
          "最内层 " + (stack[0] ? stack[0].tagName : "无") + " · 目标 " + textEl.tagName);
        expect("textNoClassNeeded", !!S.state.raw.records.filter(function (r) {
          return r.role === "text" && !r.cls && r.tag !== "DIV";
        }).length, "细粒度记录存在");
        S.state.clearSelection();
        clickAt(textPt.x, textPt.y);
        var picked = S.state.raw.selection[0];
        expect("clickSelectsText", !!picked && (picked.el === textEl || textEl.contains(picked.el)) &&
          picked.el !== S.scan.scope(), "选中 " + (picked ? S.scan.label(picked) : "无"));
        S.hit.resetSession();
      } else {
        expect("textPickable", false, "没找到可点的文字");
      }

      /* ---------- 4. 拖拽框选 + 同层归约 ---------- */
      S.state.clearSelection();
      fire("pointerdown", 700, 380);
      fire("pointermove", 1000, 700);
      fire("pointerup", 1000, 700);
      var mq = S.state.raw.selection;
      expect("marqueeMulti", mq.length > 1 && mq.length <= 50, mq.length + " 个");
      var nested = mq.filter(function (a) {
        return mq.some(function (b) { return a !== b && a.el.contains(b.el); });
      });
      expect("reduceDropsAncestors", nested.length <= 1, "祖先残留 " + nested.length);

      /* 请求卡不再长在浮窗里，而是贴在选区旁边 */
      var compEl = host.shadowRoot.querySelector(".sa-compose");
      var cr = compEl.getBoundingClientRect();
      expect("composerPlaced", compEl.getAttribute("data-on") === "1" && cr.width > 200 &&
        cr.left >= 0 && cr.right <= window.innerWidth + 1 && cr.top >= 0 && cr.bottom <= window.innerHeight + 1,
        Math.round(cr.width) + "x" + Math.round(cr.height) + " @" + Math.round(cr.left) + "," + Math.round(cr.top));

      /* ---------- 5. 上下文产物 ---------- */
      var text = S.snapshot.md(S.snapshot.build(mq));
      expect("mdHasSelector", text.indexOf("选择器") > 0 && text.indexOf("## 请求") > 0, text.length + " 字符");
      expect("mdHasPage", text.indexOf(location.href) > 0);

      /* 提交时间要跟系统时钟同一个说法：本地墙上时间，不是 UTC 的 ISO 串 */
      var job = S.snapshot.task(S.snapshot.build(mq), "时间格式", { id: "sa-test", createdAt: "2026-11-23T03:23:15.510Z" });
      var got = (job.match(/- 提交时间：(.*)/) || [])[1] || "";
      var d = new Date("2026-11-23T03:23:15.510Z");
      var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      var want = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " +
        p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
      expect("mdTimeIsLocal", got === want, got + " vs " + want);
      expect("mdTimeNoIso", !/\dT\d{2}:\d{2}:\d{2}/.test(got) && got.slice(-1) !== "Z", got);

      /* ---------- 6. Esc 分层退出 ---------- */
      S.input.escape();
      expect("escClears", S.state.raw.selection.length === 0);

      /* ---------- 7. 模式隔离：原型模式不拦截页面点击 ---------- */
      function nativeClick(el) {
        var b = el.getBoundingClientRect();
        var x = b.left + b.width / 2, y = b.top + b.height / 2;
        var o = {
          bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
          button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1
        };
        el.dispatchEvent(new PointerEvent("pointerdown", o));
        el.dispatchEvent(new MouseEvent("mousedown", o));
        o.buttons = 0;
        el.dispatchEvent(new PointerEvent("pointerup", o));
        el.dispatchEvent(new MouseEvent("mouseup", o));
        el.dispatchEvent(new MouseEvent("click", o));
      }
      function pageOn(id) {
        var el = document.getElementById(id);
        return !!(el && el.classList.contains("on"));
      }

      var tabSelf = document.querySelector('.nav-tab[data-tab="self"]');
      var tabUsage = document.querySelector('.nav-tab[data-tab="usage"]');

      S.state.setMode("prototype");
      expect("protoNotActive", !S.input.isActive());
      nativeClick(tabSelf);
      expect("protoClickWorks", pageOn("page-self"), "page-self " + (pageOn("page-self") ? "on" : "off"));

      S.state.setMode("design");
      nativeClick(tabUsage);
      expect("designClickBlocked", !pageOn("page-usage"), "page-usage " + (pageOn("page-usage") ? "on" : "off"));

      S.state.setMode("prototype");
      nativeClick(tabUsage);
      expect("protoRecovered", pageOn("page-usage"));
      expect("canvasCleared", S.overlay.ctx.getImageData(2, 2, 1, 1).data[3] === 0);
    } catch (e) {
      fails.push("EXCEPTION");
      out.push("ERROR:" + e.message + " @" + String(e.stack || "").split("\n")[1]);
    }

    function finish() {
      out.unshift("SUMMARY " + (fails.length ? "FAIL " + fails.join(",") : "ALL_PASS"));
      out.push("errors=" + window.__SPOT_ERRS.length);
      /* 跑完之后才冒出来的错误也要看得见，否则只留一个数字没法查 */
      if (window.__SPOT_ERRS.length) out.push("ERRS:" + window.__SPOT_ERRS.join(" ~ "));
      document.title = "SPOTTEST " + out.join(" ;; ");
    }

    /* ---------- 8. 页面内输入「请求」→ 本地队列（异步；桥不在要能降级） ---------- */
    Promise.resolve().then(function () {
      var sr = host.shadowRoot;
      var compose = sr.querySelector(".sa-compose");
      expect("composerMounted", !!compose);
      expect("composerNotInPanel", sr.querySelector(".sa-panel .sa-compose") === null);

      S.state.setMode("design");
      S.state.clearSelection();
      clickAt(760, 420);

      var input = sr.querySelector(".sa-input");
      var ctxEl = sr.querySelector(".sa-ctx");
      expect("composerCtx", (ctxEl.textContent || "").indexOf("已选 1") === 0, ctxEl.textContent);
      expect("sendDisabledNoText", sr.querySelector(".sa-send").disabled === true);
      expect("inputFontBig", parseFloat(getComputedStyle(input).fontSize) >= 13, getComputedStyle(input).fontSize);

      /* 高频需求：一级分类 chip → 二级下拉 → 点一条填进输入框，且能改 */
      function chips() { return sr.querySelectorAll(".sa-chip[data-cat]"); }
      function rows() { return sr.querySelectorAll(".sa-needrow"); }
      function names() {
        return Array.prototype.map.call(rows(), function (r) { return r.querySelector("b").textContent; }).join("|");
      }
      function pick(key) {
        var r = sr.querySelector('[data-need="' + key + '"]');
        if (r) r.click();
        return !!r;
      }
      var labels = Array.prototype.map.call(chips(), function (c) { return c.textContent; }).join("|");
      expect("needsCats", labels === "视觉 11|功能 8|文案 3|数据 6|去AI化 8", labels);
      var clip = Array.prototype.filter.call(chips(), function (c) { return c.scrollWidth > c.clientWidth + 1; });
      expect("chipLabelsFit", clip.length === 0,
        clip.length + " 个被截断 · 每个宽 " + Math.round(chips()[0].getBoundingClientRect().width));

      chips()[0].click();
      expect("needsSecondLevel", rows().length === 11 && !!sr.querySelector(".sa-needs[data-on='1']"),
        rows().length + " 行");
      var lb = sr.querySelector(".sa-needs").getBoundingClientRect();
      expect("needsInside", lb.left >= 0 && lb.right <= window.innerWidth + 1 && lb.bottom <= window.innerHeight + 1,
        Math.round(lb.left) + "-" + Math.round(lb.right) + " bottom " + Math.round(lb.bottom) + "/" + window.innerHeight);
      expect("needsGenericFirst", names().indexOf("通用|间距") === 0, names().slice(0, 12));

      pick("视觉/间距");
      expect("needInserts", input.value === "把这块的留白和卡片间距调匀。", input.value);

      chips()[0].click();
      pick("视觉/对齐");
      expect("needReplaces", input.value === "把区域内的标题、正文、按钮对到同一条线。", input.value);

      /* 改一句 → 再点同一类型，回来的应该是改过的那句 */
      input.value = "把这块留白调匀，卡片间距 8。";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      chips()[0].click();
      pick("视觉/对齐");
      expect("needKeepsEdit", input.value === "把这块留白调匀，卡片间距 8。", input.value);

      /* 数据：示例数据 / 可视化规范都在 */
      chips()[3].click();
      var dn = names();
      expect("dataHasSample", dn.indexOf("示例数据") > 0 && dn.indexOf("可视化规范") > 0 &&
        dn.indexOf("空态加载") > 0, dn);
      chips()[3].click();

      /* 去 AI 味：独立分类，8 条，通用打头 */
      chips()[4].click();
      expect("deAiCategory", rows().length === 8 && names().indexOf("通用|渐变|玻璃拟态|emoji") === 0, names());
      chips()[4].click();

      chips()[0].click();
      chips()[0].click();
      expect("needTogglesClosed", !sr.querySelector(".sa-needs[data-on='1']") && rows().length === 0);
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      /* 窄元素：卡片必须贴在它左/右两侧之一，不许压在它身上 */
      var narrow = S.state.raw.records.filter(function (r) {
        return r.w > 40 && r.w < 260 && r.y > 140 && r.y < window.innerHeight - 300;
      })[0];
      if (narrow) {
        S.state.setSelection([narrow]);
        var cn = compose.getBoundingClientRect();
        expect("composerBesideSel", cn.left >= narrow.x + narrow.w - 1 || cn.right <= narrow.x + 1,
          "卡片@" + Math.round(cn.left) + "-" + Math.round(cn.right) +
          " 选区@" + Math.round(narrow.x) + "-" + Math.round(narrow.x + narrow.w));
        clickAt(760, 420);
      } else {
        expect("composerBesideSel", false, "没找到窄元素可测");
      }

      /* 滚动后选中记录必须换成新坐标，否则浮卡钉在旧位置 */
      var s0 = S.state.raw.selection[0];
      if (s0) {
        var y0 = s0.y;
        window.scrollTo(0, 300);
        S.scan.run();
        var s1 = S.state.raw.selection[0];
        expect("selectionFollowsScroll", !!s1 && s1.el === s0.el && Math.abs(s1.y - (y0 - 300)) < 4,
          "y " + Math.round(y0) + " → " + (s1 ? Math.round(s1.y) : "丢失"));
        window.scrollTo(0, 0);
        S.scan.run();
      }

      /* 选中框走 rAF 重绘，无头环境不一定出帧，这里同步画一次再量颜色 */
      S.render.draw();
      var selEl = sr.querySelector(".spot-sel");
      var selColor = selEl ? getComputedStyle(selEl).borderTopColor : "none";
      expect("selBrandYellow", selColor === "rgb(255, 197, 22)", selColor);
      var selHalo = selEl ? getComputedStyle(selEl).boxShadow : "";
      expect("selInkHalo", /17,\s*14,\s*11/.test(selHalo), selHalo);

      input.value = "把这一块的左右间距统一成 16";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect("sendEnabledWithText", sr.querySelector(".sa-send").disabled === false);

      var before = S.queue.count();
      /* Enter 直接提交（Shift+Enter 才是换行） */
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

      return new Promise(function (res) { setTimeout(res, 1500); }).then(function () {
        var after = S.queue.count();
        var item = S.queue.list()[0] || {};
        expect("enterSubmits", after === before + 1, before + " → " + after);
        expect("queueHasRequest", String(item.request || "").indexOf("统一成 16") >= 0);
        expect("queueHasMd", String(item.md || "").indexOf("## 请求") > 0 &&
          String(item.md || "").indexOf("统一成 16") > 0, String(item.md || "").length + " 字符");
        expect("bridgeDegraded", item.status === "local" || item.status === "queued", item.status);
        expect("composerCleared", input.value === "");
        expect("sendDisabledAgain", sr.querySelector(".sa-send").disabled === true);

        /* 队列必须看得见 */
        expect("panelQueueCount", /队列\s*1/.test(sr.querySelector(".sa-qbtn").textContent),
          sr.querySelector(".sa-qbtn").textContent);
        sr.querySelector(".sa-q").click();
        var qv = sr.querySelector(".sa-queue");
        var row = qv.querySelector(".sa-qrow b");
        expect("queueViewOpens", qv.getAttribute("data-on") === "1" &&
          qv.querySelectorAll(".sa-qrow").length === 1,
          qv.querySelectorAll(".sa-qrow").length + " 行");
        expect("queueRowShowsRequest", (row ? row.textContent : "").indexOf("统一成 16") >= 0,
          row ? row.textContent : "无行");
        expect("queueShowsWhere", /storage|\.spot/.test(qv.querySelector(".sa-qfoot").textContent),
          qv.querySelector(".sa-qfoot").textContent);

        /* ---------- 队列窗口：居中、可拖、可关、逐条改 ---------- */
        var qr = qv.getBoundingClientRect();
        expect("queueWide", qr.width > 520, Math.round(qr.width) + "px 宽");
        expect("queueCentered", Math.abs((qr.left + qr.right) / 2 - S.overlay.vw / 2) <= 2,
          Math.round((qr.left + qr.right) / 2) + " vs " + Math.round(S.overlay.vw / 2));
        expect("queueRowActions", qv.querySelectorAll(".sa-qacts .sa-qact").length === 4,
          qv.querySelectorAll(".sa-qacts .sa-qact").length + " 个动作");
        expect("queueHasClose", !!qv.querySelector(".sa-qx"));

        var qhd = qv.querySelector(".sa-qhead");
        function qev(type, x, y) {
          qhd.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, button: 0, buttons: type === "pointermove" ? 1 : 0,
            pointerId: 9, isPrimary: true, pointerType: "mouse"
          }));
        }
        var hx = qr.left + 30, hy = qr.top + 8;
        qev("pointerdown", hx, hy);
        qev("pointermove", hx - 120, hy + 90);
        qev("pointerup", hx - 120, hy + 90);
        var qr2 = qv.getBoundingClientRect();
        expect("queueDraggable", Math.abs(qr2.left - (qr.left - 120)) < 3 &&
          Math.abs(qr2.top - (qr.top + 90)) < 3,
          Math.round(qr.left) + "," + Math.round(qr.top) + " → " +
          Math.round(qr2.left) + "," + Math.round(qr2.top));

        /* ---------- 最小化到侧面：滚动不消失，只有 × 才关 ---------- */
        expect("queueHasMin", !!qv.querySelector(".sa-qmin"));
        S.ui.panel.fold();                      /* 滚动时面板会收成小牌 */
        expect("queueSurvivesFold", qv.getAttribute("data-on") === "1" && S.ui.queueView.isOpen() &&
          S.ui.panel.isFolded(), "open=" + S.ui.queueView.isOpen() + " folded=" + S.ui.panel.isFolded());
        S.ui.panel.unfold();

        qv.querySelector(".sa-qmin").click();
        var mr = qv.getBoundingClientRect();
        expect("queueMinimizes", qv.getAttribute("data-min") === "1" && mr.width <= 34 &&
          Math.abs(mr.right - S.overlay.vw) <= 1,
          Math.round(mr.width) + "×" + Math.round(mr.height) + " right " + Math.round(mr.right) + "/" + S.overlay.vw);
        expect("queueMinHeadHidden", getComputedStyle(qv.querySelector(".sa-qhead")).display === "none");
        expect("queueMinTab", /^队列\s*1$/.test(qv.querySelector(".sa-qtab").textContent),
          qv.querySelector(".sa-qtab").textContent);

        S.ui.panel.fold();
        expect("queueMinStaysOpen", qv.getAttribute("data-on") === "1" && S.ui.queueView.isMin());
        S.ui.panel.unfold();

        qv.querySelector(".sa-qtab").click();
        var rr = qv.getBoundingClientRect();
        expect("queueRestores", qv.getAttribute("data-min") !== "1" && rr.width > 520 &&
          Math.abs(rr.left - qr2.left) < 3,
          Math.round(rr.width) + "px 宽 · left " + Math.round(rr.left) + "/" + Math.round(qr2.left));

        /* 这页上桥是不通的，把维护接口换成假的，专测面板自己的行为 */
        var realApi = {
          status: S.bridge.status, update: S.bridge.update, remove: S.bridge.remove,
          clear: S.bridge.clear, reveal: S.bridge.reveal, queue: S.bridge.queue
        };
        var calls = [];
        S.bridge.status = function () { return { up: true, root: "/Users/u/Documents/AI_Projects/Proj" }; };
        S.bridge.update = function (it) { calls.push("update:" + it.id); return Promise.resolve({ ok: true }); };
        S.bridge.remove = function (id) { calls.push("remove:" + id); return Promise.resolve({ ok: true }); };
        S.bridge.clear = function () { calls.push("clear"); return Promise.resolve({ ok: true, data: { removed: 1 } }); };
        S.bridge.reveal = function (id) { calls.push("reveal:" + (id || "-")); return Promise.resolve({ ok: true }); };
        S.bridge.queue = function () { return Promise.resolve({ ok: true, data: { items: [] } }); };
        S.ui.queueView.sync();

        var firstId = S.queue.list()[0].id;
        qv.querySelector('[data-act="reveal"]').click();
        expect("revealCallsBridge", calls.indexOf("reveal:" + firstId) >= 0, calls.join(","));

        qv.querySelector('[data-act="edit"]').click();
        var qta = qv.querySelector(".sa-qedit");
        expect("editOpensTextarea", !!qta && qta.value.indexOf("统一成 16") >= 0,
          qta ? qta.value.slice(0, 24) : "没有输入框");

        var oldMd = S.queue.list()[0].md || "";
        var prefix = oldMd.slice(0, oldMd.indexOf("## 请求"));
        qta.value = "把主色换成品牌黄，圆角统一 8";
        qv.querySelector('[data-act="save"]').click();

        var after = S.queue.list()[0];
        expect("editSavesRequest", after.request === "把主色换成品牌黄，圆角统一 8", after.request);
        expect("editPatchesMd", after.md.indexOf("## 请求\n把主色换成品牌黄") >= 0 &&
          after.md.indexOf(prefix) === 0, after.md.length + " 字符");
        expect("editPushesBridge", calls.indexOf("update:" + firstId) >= 0, calls.join(","));

        /* 逐条删除 */
        S.queue.add({
          id: "sa-manual-2", createdAt: new Date().toISOString(), request: "手动补的一条",
          status: "local", md: "# x\n\n## 请求\n手动补的一条\n", title: "手动"
        });
        expect("queueGrewRow", qv.querySelectorAll(".sa-qrow").length === 2,
          qv.querySelectorAll(".sa-qrow").length + " 行");
        qv.querySelectorAll(".sa-qrow")[0].querySelector('[data-act="del"]').click();
        expect("rowDeleted", qv.querySelectorAll(".sa-qrow").length === 1 && S.queue.count() === 1,
          S.queue.count() + " 条");
        expect("deletePushesBridge", calls.some(function (c) { return c.indexOf("remove:") === 0; }),
          calls.join(","));

        /* 清空必须是两步，而且不能只清界面 —— 上次"清了还在"就是这个 */
        var clr = qv.querySelector(".sa-qclear");
        clr.click();
        expect("clearArms", clr.getAttribute("data-armed") === "1" && S.queue.count() === 1,
          clr.textContent + " / " + S.queue.count() + " 条");
        clr.click();
        expect("clearEmptiesLocal", S.queue.count() === 0, S.queue.count() + " 条");
        expect("clearPushesBridge", calls.indexOf("clear") >= 0, calls.join(","));
        expect("clearShowsEmpty", !!qv.querySelector(".sa-qempty"));

        qv.querySelector(".sa-qx").click();
        expect("queueClosesByX", qv.getAttribute("data-on") === "0");

        S.bridge.status = realApi.status;
        S.bridge.update = realApi.update;
        S.bridge.remove = realApi.remove;
        S.bridge.clear = realApi.clear;
        S.bridge.reveal = realApi.reveal;
        S.bridge.queue = realApi.queue;

        /* 回填一条：后面的收起态计数要看到数字 */
        S.queue.add({
          id: "sa-manual-3", createdAt: new Date().toISOString(),
          request: "留一条给收起态", status: "local", md: "", title: "留一条"
        });

        S.ui.queueView.close();
        expect("queueViewCloses", qv.getAttribute("data-on") === "0");

        /* 收起成小牌，队列条数必须还在 */
        S.ui.panel.fold();
        var qnEl = sr.querySelector(".sa-qn");
        expect("foldedShowsQueue", getComputedStyle(qnEl).display !== "none" &&
          qnEl.textContent === String(S.queue.count()) && qnEl.getAttribute("data-hot") === "1",
          qnEl.textContent + " 条 hot=" + qnEl.getAttribute("data-hot"));
        S.ui.panel.unfold();
        expect("expandedHidesQueueNum", getComputedStyle(qnEl).display === "none");

        /* 沙箱外的页面：桥在线但不许写，提示必须是"越界"而不是"桥未启动" */
        var realSubmit = S.bridge.submit;
        var realToast = S.overlay.toast;
        var toasts = [];
        S.overlay.toast = function (m) { toasts.push(String(m)); };
        S.bridge.submit = function () { return Promise.resolve({ ok: false, error: "outside-sandbox" }); };
        input.value = "越界测试";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

        return new Promise(function (res) { setTimeout(res, 80); }).then(function () {
          expect("sandboxToastSaysOutside", toasts.join("|").indexOf("不在 AI_Projects") >= 0, toasts.join(" | "));
          expect("sandboxKeepsLocal", (S.queue.list()[0] || {}).status === "local",
            (S.queue.list()[0] || {}).status);
          S.bridge.submit = realSubmit;
          S.overlay.toast = realToast;

          /* 落盘失败必须回滚：界面不能比磁盘更干净 */
          var keepRemove = S.bridge.remove;
          var keepStatus = S.bridge.status;
          S.bridge.status = function () { return { up: true, root: "/x" }; };
          S.bridge.remove = function () { return Promise.resolve({ ok: false, error: "failed" }); };
          S.queue.add({
            id: "sa-rollback", createdAt: new Date().toISOString(),
            request: "回滚测试", status: "local", md: ""
          });
          var beforeRb = S.queue.count();
          sr.querySelector('.sa-queue [data-act="del"]').click();
          expect("deleteHidesRowFirst", S.queue.count() === beforeRb - 1, S.queue.count() + " 条");

          return new Promise(function (res) { setTimeout(res, 60); }).then(function () {
            expect("deleteRollsBack", S.queue.count() === beforeRb, S.queue.count() + " 条");
            S.bridge.remove = keepRemove;
            S.bridge.status = keepStatus;
            S.queue.remove("sa-rollback");
          });
        });
      });
    }).then(finish, function (e) {
      fails.push("TAIL");
      out.push("TAILERR:" + e.message);
      finish();
    });
  }, 900);
});
