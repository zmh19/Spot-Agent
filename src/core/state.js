/* Spot Agent · 全局状态机（单一真源，UI 一律订阅它） */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.state) return;

  var U = S.util;

  var raw = {
    mode: "prototype",     // prototype | design
    density: "skeleton",   // skeleton | all
    paused: false,         // 临时停用（快捷键 ⇧⌥X）
    records: [],           // 当前可见元素快照
    hover: null,           // 悬停记录
    selection: [],         // 选中记录
    marquee: null,         // 拖拽选框 {x,y,w,h}
    stats: { total: 0, at: 0 }
  };

  var subs = [];

  function emit(type, detail) {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](type, detail, raw); } catch (e) { console.error("[Spot]", e); }
    }
  }

  S.state = {
    raw: raw,

    on: function (fn) {
      subs.push(fn);
      return function () {
        var i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    },

    emit: emit,

    /* ---------------- 模式 ---------------- */
    setMode: function (mode, silent) {
      if (mode !== "design" && mode !== "prototype") return;
      if (raw.mode === mode) return;
      raw.mode = mode;
      raw.hover = null;
      if (mode === "prototype") { raw.selection = []; raw.marquee = null; }
      S.store.set("mode", mode);
      if (!silent) emit("mode", mode);
      emit("selection", raw.selection);
      emit("render");
    },

    toggleMode: function () { S.state.setMode(raw.mode === "design" ? "prototype" : "design"); },

    /* ---------------- 密度 ---------------- */
    setDensity: function (d) {
      if (d !== "skeleton" && d !== "all") return;
      raw.density = d;
      S.store.set("density", d);
      emit("density", d);
    },

    setPaused: function (on) {
      raw.paused = !!on;
      emit("paused", raw.paused);
      emit("render");
    },

    /* ---------------- 元素集合 ---------------- */
    setRecords: function (records) {
      raw.records = records || [];
      raw.stats.total = raw.records.length;
      raw.stats.at = Date.now();

      /* 重扫之后旧记录的位置已经过期。按 DOM 节点把选中/悬停换成新记录，
         否则页面一滚，选中框和请求卡就钉在旧坐标上。 */
      var byEl = null;
      function find(rec) {
        if (!rec) return null;
        if (!byEl) {
          byEl = new Map();
          for (var k = 0; k < raw.records.length; k++) byEl.set(raw.records[k].el, raw.records[k]);
        }
        return byEl.get(rec.el) || null;
      }

      if (raw.selection.length) {
        var next = [];
        var changed = false;
        for (var i = 0; i < raw.selection.length; i++) {
          var hit = find(raw.selection[i]);
          if (!hit) { changed = true; continue; }
          if (hit !== raw.selection[i]) changed = true;
          next.push(hit);
        }
        if (changed) {
          raw.selection = next;
          emit("selection", raw.selection);
        }
      }
      raw.hover = find(raw.hover);

      emit("records", raw.stats);
      emit("render");
    },

    setHover: function (rec) {
      var a = raw.hover, b = rec;
      if (a === b) return;
      if (a && b && a.el === b.el && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h) return;
      raw.hover = rec;
      emit("hover", rec);
      emit("render");
    },

    /* ---------------- 选中 ---------------- */
    setSelection: function (list) {
      raw.selection = (list || []).slice(0, 50);
      emit("selection", raw.selection);
      emit("render");
    },

    addToSelection: function (list) {
      var cur = raw.selection.slice();
      var seen = {};
      for (var i = 0; i < cur.length; i++) seen[cur[i].el] = 1;
      for (var j = 0; j < list.length; j++) {
        if (!seen[list[j].el]) { cur.push(list[j]); seen[list[j].el] = 1; }
      }
      S.state.setSelection(cur);
    },

    toggleSelection: function (rec) {
      var cur = raw.selection;
      for (var i = 0; i < cur.length; i++) {
        if (cur[i].el === rec.el) {
          var next = cur.slice(0, i).concat(cur.slice(i + 1));
          S.state.setSelection(next);
          return;
        }
      }
      S.state.setSelection(cur.concat([rec]));
    },

    clearSelection: function () {
      if (!raw.selection.length) return;
      raw.selection = [];
      emit("selection", raw.selection);
      emit("render");
    },

    setMarquee: function (rect) {
      raw.marquee = rect;
      emit("render");
    },

    /* ---------------- 派生 ---------------- */
    isEmpty: function () { return raw.selection.length === 0; },
    isActive: function () { return raw.mode === "design" && !raw.paused; }
  };

  /* 存储里的偏好（mode/density）在 boot 时回填 */
  S.state.hydrate = function () {
    var m = S.store.get("mode", "prototype");
    var d = S.store.get("density", "skeleton");
    raw.mode = (m === "design") ? "design" : "prototype";
    raw.density = (d === "all") ? "all" : "skeleton";
    emit("mode", raw.mode);
    emit("density", raw.density);
    emit("render");
  };
})(globalThis);
