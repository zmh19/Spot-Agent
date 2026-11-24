/* Spot Agent · 命中与选择：下钻、拖拽框选、同层归约 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.hit) return;

  var U = S.util;

  /* 下钻会话：同一点连续点，逐层向外 */
  var session = { key: "", index: 0, els: [] };
  var idMap = new WeakMap();
  var idSeq = 0;

  function keyOf(els) {
    var ids = [];
    for (var i = 0; i < els.length; i++) {
      var id = idMap.get(els[i]);
      if (!id) { id = ++idSeq; idMap.set(els[i], id); }
      ids.push(id);
    }
    return ids.join("|");
  }

  /* 光标处的可选中层级，内→外 */
  function layersAt(x, y) {
    var stack = [];
    if (document.elementsFromPoint) {
      stack = document.elementsFromPoint(x, y) || [];
    } else {
      var el = document.elementFromPoint(x, y);
      while (el) { stack.push(el); el = el.parentElement; }
    }

    var out = [];
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (!el || el.nodeType !== 1) continue;
      if (U.isOwn(el)) continue;
      if (S.scan.SKIP_TAGS[el.tagName]) continue;
      if (el.id === U.HOST_ID) continue;
      if (!S.scan.pickable(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;   // 跳过 inline 包裹层
      out.push(el);
    }
    return out;
  }

  /* dir: +1 向外（父级），-1 向内（子级） */
  function pick(x, y, dir) {
    var els = layersAt(x, y);
    if (!els.length) return null;

    var key = keyOf(els);
    if (key === session.key) {
      session.index = U.clamp(session.index + (dir || 1), 0, els.length - 1);
    } else {
      session.key = key;
      session.els = els;
      session.index = (dir || 1) < 0 ? els.length - 1 : 0;
    }
    return S.scan.one(els[session.index]);
  }

  /* 不改会话，只取最内层做悬停预览 */
  function hover(x, y) {
    var els = layersAt(x, y);
    return els.length ? S.scan.one(els[0]) : null;
  }

  function escapeStep() {
    if (session.key && session.els.length) {
      session.index = U.clamp(session.index + 1, 0, session.els.length - 1);
      return S.scan.one(session.els[session.index]);
    }
    return null;
  }

  function resetSession() { session.key = ""; session.els = []; session.index = 0; }

  function intersects(rec, m) {
    return !(rec.x > m.x + m.w || rec.x + rec.w < m.x || rec.y > m.y + m.h || rec.y + rec.h < m.y);
  }

  /* 框选归约：只留最内层——只要它还包着别的命中项就丢掉。
     文字级元素现在也会被框进来，若保留"包着 1 个子元素"的中间层，
     一次框选会拿到一整串嵌套框（div > p > span），改需求时根本分不清该说哪一层。 */
  function reduce(list) {
    var seen = [];
    var uniq = [];
    for (var i = 0; i < list.length; i++) {
      if (seen.indexOf(list[i].el) >= 0) continue;
      seen.push(list[i].el);
      uniq.push(list[i]);
    }

    var keep = [];
    for (var j = 0; j < uniq.length; j++) {
      var a = uniq[j];
      var inside = 0;
      for (var k = 0; k < uniq.length; k++) {
        if (uniq[k] === a) continue;
        if (a.el.contains(uniq[k].el)) { inside = 1; break; }
      }
      if (!inside) keep.push(a);
    }

    keep.sort(function (a, b) {
      if (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      return 1;
    });

    return keep.slice(0, 50);
  }

  function marquee(rect) {
    var m = {
      x: Math.min(rect.x, rect.x + rect.w),
      y: Math.min(rect.y, rect.y + rect.h),
      w: Math.abs(rect.w),
      h: Math.abs(rect.h)
    };
    var recs = S.state.raw.records;
    var hits = [];
    for (var i = 0; i < recs.length; i++) {
      if (intersects(recs[i], m)) hits.push(recs[i]);
    }
    return { list: reduce(hits), raw: hits.length, rect: m };
  }

  S.hit = {
    layersAt: layersAt,
    pick: pick,
    hover: hover,
    escapeStep: escapeStep,
    resetSession: resetSession,
    reduce: reduce,
    marquee: marquee
  };
})(globalThis);
