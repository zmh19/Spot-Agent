/* Spot Agent · 绘制：结构框走 canvas（快），选中框走 DOM（要文字） */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.render) return;

  var U = S.util;

  /* 结构框只用墨和橙两种（品牌色里最不抢眼的两支，靠透明度分层）；
     黄留给"Spot 正在指的那一个"，一屏里只出现一次 */
  var HUE = {
    neutral: "17,14,11",
    landmark: "242,153,34",
    heading: "242,153,34",
    box: "17,14,11",
    interactive: "242,153,34",
    media: "17,14,11",
    text: "17,14,11"
  };
  var HOT = "255,197,22";
  var INK = "17,14,11";

  function alphaFor(rec) {
    var band = Math.min(4, Math.floor(rec.depth / 2));
    if (rec.role === "landmark") return 0.30;
    if (rec.role === "heading") return 0.26;
    if (rec.role === "box") return 0.18;
    return 0.06 + band * 0.05;
  }

  function widthFor(rec) {
    if (rec.role === "landmark") return 1;
    if (rec.role === "box") return 0.75;
    return 0.6;
  }

  function stroke(ctx, rec, rgb, alpha, lw) {
    ctx.strokeStyle = "rgba(" + rgb + "," + alpha + ")";
    ctx.lineWidth = lw;
    ctx.strokeRect(rec.x + 0.5, rec.y + 0.5, rec.w - 1, rec.h - 1);
  }

  function chip(ctx, x, y, text) {
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    var w = ctx.measureText(text).width + 8;
    ctx.fillStyle = "rgba(17,14,11,.90)";
    ctx.fillRect(x, y, w, 15);
    ctx.fillStyle = "#FFC516";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 4, y + 8);
  }

  function drawHover(ctx, rec) {
    if (!rec) return;
    var rgb = HUE[rec.role] || HUE.neutral;
    ctx.save();
    /* 墨圈打底再压黄线：浅色页面上黄只有 1.6:1，单描一道根本看不见 */
    stroke(ctx, rec, INK, 0.55, 2.75);
    stroke(ctx, rec, rgb === HUE.neutral ? HOT : rgb, 0.95, 1.25);
    ctx.restore();

    var label = S.scan.label(rec) + "  " + Math.round(rec.w) + "×" + Math.round(rec.h);
    var ly = rec.y - 16;
    if (ly < 2) ly = rec.y + rec.h + 2;
    chip(ctx, rec.x, ly, label);
  }

  function drawMarquee(ctx, m) {
    if (!m) return;
    ctx.save();
    ctx.fillStyle = "rgba(255,197,22,.08)";
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.strokeStyle = "rgba(17,14,11,.32)";
    ctx.lineWidth = 2;
    ctx.strokeRect(m.x, m.y, m.w, m.h);
    ctx.strokeStyle = "rgba(255,197,22,.95)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1);
    ctx.restore();
  }

  function drawSelectionLayer(list) {
    var layer = S.overlay.domLayer;
    if (!layer) return;
    layer.textContent = "";
    if (!list || !list.length) return;

    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      var box = document.createElement("div");
      box.className = "spot-sel";
      box.style.cssText = "position:absolute;left:" + rec.x + "px;top:" + rec.y +
        "px;width:" + rec.w + "px;height:" + rec.h + "px";
      var tag = document.createElement("i");
      tag.textContent = (i + 1) + " " + S.scan.label(rec);
      tag.style.top = rec.y < 18 ? rec.h - 14 : "-15px";
      box.appendChild(tag);
      layer.appendChild(box);
    }
  }

  /* 结构框是静态的：缓存到离屏画布，悬停重绘只做一次 drawImage */
  var off = null;
  var octx = null;
  var lastRecs = null;
  var dirty = true;

  function ensureOff() {
    var cv = S.overlay.canvas;
    if (!cv) return false;
    if (!off) {
      off = document.createElement("canvas");
      octx = off.getContext("2d");
    }
    if (off.width !== cv.width || off.height !== cv.height) {
      off.width = cv.width;
      off.height = cv.height;
      dirty = true;
    }
    octx.setTransform(S.overlay.dpr, 0, 0, S.overlay.dpr, 0, 0);
    return true;
  }

  function paintStatic(recs) {
    var O = S.overlay;
    octx.clearRect(0, 0, O.vw, O.vh);
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      stroke(octx, rec, HUE[rec.role] || HUE.neutral, alphaFor(rec), widthFor(rec));
    }
    dirty = false;
  }

  function draw() {
    var O = S.overlay;
    if (!O.ctx) return;
    var st = S.state.raw;

    O.clear();
    if (!S.state.isActive()) { drawSelectionLayer([]); return; }

    if (!ensureOff()) return;
    if (st.records !== lastRecs) { lastRecs = st.records; dirty = true; }
    if (dirty) paintStatic(st.records);

    if (st.records.length) O.ctx.drawImage(off, 0, 0, O.vw, O.vh);

    drawHover(O.ctx, st.hover);
    drawMarquee(O.ctx, st.marquee);
    drawSelectionLayer(st.selection);
  }

  S.render = {
    draw: draw,
    drawSelectionLayer: drawSelectionLayer,
    invalidate: function () { dirty = true; },
    schedule: U.raf(draw)
  };
})(globalThis);
