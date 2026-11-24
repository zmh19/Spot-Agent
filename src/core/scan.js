/* Spot Agent · 元素扫描：把页面上可见的元素拍成带几何信息的快照 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.scan) return;

  var U = S.util;

  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, HEAD: 1, TITLE: 1, BASE: 1,
    NOSCRIPT: 1, TEMPLATE: 1, PARAM: 1, SOURCE: 1, TRACK: 1
  };
  var LANDMARK = { MAIN: 1, ASIDE: 1, NAV: 1, HEADER: 1, FOOTER: 1, SECTION: 1, ARTICLE: 1, FORM: 1 };
  var HEADING = { H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1 };
  var INTERACTIVE = { BUTTON: 1, A: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1, SUMMARY: 1, DETAILS: 1 };
  var MEDIA = { IMG: 1, SVG: 1, CANVAS: 1, VIDEO: 1, PICTURE: 1, IFRAME: 1 };
  var BOXISH_RE = /(panel|card|btn|button|metric|chip|item|row|cell|tab|badge|hero|bar|table|dialog|modal|list|tile|block|group|field|input|navbar|crumb)/i;

  var MAX_RECORDS = 3200;
  var MARGIN = 320;   // 视口外扩，减少滚动时的抖动

  function tagOf(el) { return el.tagName || ""; }

  function clsOf(el) {
    var c = U.className(el);
    return c ? String(c).trim().split(/\s+/)[0] : "";
  }

  function roleOf(el) {
    var t = tagOf(el);
    if (LANDMARK[t]) return "landmark";
    if (HEADING[t]) return "heading";
    if (INTERACTIVE[t]) return "interactive";
    if (MEDIA[t]) return "media";
    if (BOXISH_RE.test(U.className(el))) return "box";
    return "text";
  }

  /* 命中判定：任何真实存在、有尺寸的元素都能选。
     以前这里靠 class 白名单（panel/card/btn…），结果正文里的 p / span / strong / li
     全被挡在门外，光标落在文字上只能一路跳到最近的容器——这就是"选不到字"的根因。 */
  function pickable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS[tagOf(el)]) return false;
    if (el.id === U.HOST_ID || U.isOwn(el)) return false;
    return true;
  }

  /* 自己带文字（不是纯容器）：h2 / p / span / b 这些都要各自成框，CSS 才算拆到字上 */
  function hasOwnText(el) {
    var n = el.firstChild;
    while (n) {
      if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return true;
      n = n.nextSibling;
    }
    return false;
  }

  function visibleBy(el, cs) {
    return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity || "1") > 0.02;
  }

  function make(el, rect, depth, role) {
    return {
      el: el,
      tag: tagOf(el),
      cls: clsOf(el),
      id: el.id || "",
      depth: depth,
      role: role,
      x: U.round(rect.left),
      y: U.round(rect.top),
      w: U.round(rect.width),
      h: U.round(rect.height)
    };
  }

  /* 单个元素 → 记录（悬停预览用） */
  function one(el) {
    if (!el || el.nodeType !== 1) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return make(el, r, 0, roleOf(el));
  }

  function collect(scope, density) {
    var out = [];
    var vw = root.innerWidth, vh = root.innerHeight;
    var all = density === "all";
    var maxDepth = all ? 20 : 14;

    function walk(el, depth) {
      if (out.length >= MAX_RECORDS) return;
      if (depth > maxDepth) return;
      if (SKIP_TAGS[tagOf(el)]) return;
      if (el.id === U.HOST_ID) return;
      if (el.nodeType !== 1) return;

      var r = el.getBoundingClientRect();
      var inView = r.width >= 2 && r.height >= 2 &&
        r.bottom > -MARGIN && r.top < vh + MARGIN &&
        r.right > -MARGIN && r.left < vw + MARGIN;

      if (inView) {
        var cs = root.getComputedStyle(el);
        if (visibleBy(el, cs)) {
          var role = roleOf(el);
          var meaningful = role !== "text" || el.id !== "" ||
            (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") ||
            (cs.borderTopWidth && cs.borderTopWidth !== "0px") ||
            hasOwnText(el);
          if (all || meaningful || depth <= 3) {
            out.push(make(el, r, depth, role));
          }
        }
      }

      /* 即使自身不可见/在视口外也要下钻：display:contents、fixed 子元素都可能落回来 */
      var kids = el.children;
      if (!kids) return;
      for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
    }

    if (scope && scope.nodeType === 1) walk(scope, 0);

    return out;
  }

  function label(rec) {
    if (!rec) return "";
    var t = (rec.tag || "").toLowerCase();
    return t + (rec.cls ? "." + rec.cls : "");
  }

  S.scan = {
    collect: collect,
    one: one,
    pickable: pickable,
    roleOf: roleOf,
    label: label,
    SKIP_TAGS: SKIP_TAGS,

    /* 扫描根：默认整个 body（侧栏/浮层都是 main 的兄弟，只扫 main 会漏）；
       页面可用 data-spot-scope 指定一个更小的根 */
    scope: function () {
      var marked = document.querySelector("[data-spot-scope]");
      if (marked) return marked;
      return document.body || document.documentElement;
    },

    run: function () {
      var st = S.state.raw;
      var t0 = performance.now();
      var list = collect(S.scan.scope(), st.density);
      S.state.setRecords(list);
      return { count: list.length, ms: Math.round(performance.now() - t0) };
    }
  };
})(globalThis);
