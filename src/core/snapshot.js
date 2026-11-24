/* Spot Agent · 上下文快照：把"选中的 DOM"翻译成 agent 能一次改对的文本 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.snapshot) return;

  var U = S.util;

  function selector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el === document.body) return "body";
    var parts = [];
    var n = el;
    var guard = 0;

    while (n && n.nodeType === 1 && guard++ < 10) {
      if (n === document.documentElement) { parts.unshift("html"); break; }
      if (n.id && n.id !== U.HOST_ID) { parts.unshift("#" + U.escape(n.id)); break; }

      var t = n.tagName.toLowerCase();
      var p = n.parentElement;
      if (!p) { parts.unshift(t); break; }

      var idx = 1, same = 0;
      for (var i = 0; i < p.children.length; i++) {
        var c = p.children[i];
        if (c.tagName === n.tagName) { same++; if (c === n) idx = same; }
      }
      parts.unshift(same > 1 ? t + ":nth-of-type(" + idx + ")" : t);
      n = p;
    }
    return parts.join(" > ");
  }

  function styleOf(el) {
    var cs = root.getComputedStyle(el);
    var bg = cs.backgroundColor;
    var transparent = !bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
    return {
      display: cs.display,
      position: cs.position,
      box: [cs.padding, cs.margin, cs.borderRadius].join(" / "),
      border: cs.borderTopWidth === "0px" && cs.borderLeftWidth === "0px" ? "none" : cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor,
      font: cs.fontSize + "/" + cs.lineHeight + " " + cs.fontWeight + " " + (cs.fontFamily || "").split(",")[0],
      color: cs.color,
      background: transparent ? "transparent" : bg,
      layout: cs.display.indexOf("flex") >= 0
        ? "flex " + cs.flexDirection + " / align " + cs.alignItems + " / justify " + cs.justifyContent + " / gap " + cs.gap
        : (cs.display.indexOf("grid") >= 0
          ? "grid / gap " + cs.gap + " / columns " + cs.gridTemplateColumns
          : "text-align " + cs.textAlign),
      overflow: cs.overflow
    };
  }

  function scripts() {
    var out = [];
    var list = document.scripts || [];
    for (var i = 0; i < list.length && out.length < 4; i++) {
      var src = list[i].getAttribute("src");
      if (src) out.push(src.split("/").pop());
    }
    return out;
  }

  function build(list) {
    var snaps = [];
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      var el = rec.el;
      if (!el || !el.isConnected) continue;
      var r = el.getBoundingClientRect();
      var cs = styleOf(el);
      var text = U.text(el).slice(0, 160);
      var html = (el.outerHTML || "").replace(/\s+/g, " ").slice(0, 320);
      snaps.push({
        selector: selector(el),
        hint: (rec.tag || "").toLowerCase() + (rec.cls ? "." + rec.cls : ""),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        style: cs,
        text: text,
        html: html,
        section: (el.closest("section[id]") || {}).id || ""
      });
    }

    return {
      page: {
        title: document.title || "",
        url: location.href,
        viewport: { w: root.innerWidth, h: root.innerHeight, dpr: root.devicePixelRatio || 1 },
        mode: S.state.raw.mode,
        density: S.state.raw.density,
        scripts: scripts()
      },
      selection: snaps
    };
  }

  /* request 为空时留占位，由人补一句话；有内容则原样落到「## 请求」下 */
  function md(ctx, request) {
    if (!ctx.selection.length) return "";
    var L = [];
    var p = ctx.page;
    var ask = (request || "").trim();

    L.push("# Spot Agent · 选区上下文");
    L.push("");
    L.push("- 页面：" + (p.title || "(无标题)"));
    L.push("- URL：" + p.url);
    L.push("- 视口：" + p.viewport.w + "×" + p.viewport.h + " @" + p.viewport.dpr + "x");
    L.push("- 模式：" + (p.mode === "design" ? "Design" : "Prototype") + " · " + (p.density === "all" ? "全部元素" : "结构"));
    L.push("- 选区：" + ctx.selection.length + " 个元素");
    if (p.scripts.length) L.push("- 页面脚本：" + p.scripts.join(", "));
    L.push("");

    for (var i = 0; i < ctx.selection.length; i++) {
      var s = ctx.selection[i];
      L.push("## " + (i + 1) + ". " + s.hint + (s.section ? "   （位于 section#" + s.section + "）" : ""));
      L.push("- 选择器：`" + s.selector + "`");
      L.push("- 尺寸：" + s.rect.w + " × " + s.rect.h + "  @ (" + s.rect.x + ", " + s.rect.y + ")");
      L.push("- 布局：" + s.style.display + " / " + s.style.position + " / " + s.style.layout);
      L.push("- 盒：" + s.style.box + " / border: " + s.style.border);
      L.push("- 字体：" + s.style.font);
      L.push("- 颜色：color " + s.style.color + " / background " + s.style.background);
      if (s.text) L.push("- 文本：" + s.text);
      if (s.html) L.push("- 片段：`" + s.html.slice(0, 200) + "`");
      L.push("");
    }

    L.push("## 请求");
    if (ask) {
      L.push(ask);
    } else {
      L.push("（在这里写要做什么）");
    }
    return L.join("\n");
  }

  /* md 是给人看的：写本机墙上时间，不写带 Z 的 UTC 串。
     ISO 只留在 queue.json 的 createdAt 里，那里要的是可排序。 */
  function stamp(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (!d || isNaN(d.getTime())) return String(iso || "");
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
      p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  /* 任务单：文件头 + 上下文，落盘和粘贴都用这一份 */
  function task(ctx, request, meta) {
    var body = md(ctx, request);
    if (!body) return "";
    var m = meta || {};
    var L = [];
    L.push("<!-- spot-agent · 由页面提交，可直接删除 -->");
    L.push("");
    L.push("# " + (m.id || "任务") + " · " + (ctx.page.title || "未命名页面").slice(0, 60));
    L.push("");
    L.push("- 提交时间：" + stamp(m.createdAt));
    L.push("- 页面：" + (ctx.page.title || "(无标题)"));
    L.push("- URL：" + ctx.page.url);
    L.push("- 选区：" + ctx.selection.length + " 个元素");
    L.push("- 状态：待处理");
    L.push("");
    L.push(body.replace(/^# Spot Agent · 选区上下文\n\n/, ""));
    return L.join("\n");
  }

  function copy(list, request) {
    var ctx = build(list);
    var text = md(ctx, request);
    if (!text) return false;
    var ok = U.copy(text);
    return ok;
  }

  S.snapshot = {
    selector: selector,
    build: build,
    md: md,
    task: task,
    stamp: stamp,
    copy: copy
  };
})(globalThis);
