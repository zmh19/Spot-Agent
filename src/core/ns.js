/* Spot Agent · 基础命名空间与工具函数（无依赖，最先加载） */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.util) return;

  var HOST_ID = "__spot_host";

  /* 判断节点是否属于 Spot Agent 自己的宿主（含 Shadow DOM 内部） */
  function isOwn(node) {
    var n = node;
    while (n) {
      if (n.nodeType === 1 && n.id === HOST_ID) return true;
      if (n.nodeType === 11 && n.host) { n = n.host; continue; }   // ShadowRoot
      n = n.parentNode;
    }
    return false;
  }

  S.util = {
    HOST_ID: HOST_ID,
    isOwn: isOwn,

    /* 事件是否源自自家 UI（Shadow DOM 事件在 window 上会被重定向到 host） */
    isOwnEvent: function (e) {
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        if (path[i] && path[i].id === HOST_ID) return true;
      }
      return false;
    },

    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    round: function (v) { return Math.round(v * 100) / 100; },

    debounce: function (fn, ms) {
      var t = 0;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms);
      };
    },

    raf: function (fn) {
      var id = 0;
      return function () {
        if (id) return;
        id = requestAnimationFrame(function () { id = 0; fn(); });
      };
    },

    escape: function (s) {
      return root.CSS && root.CSS.escape ? root.CSS.escape(s) : String(s).replace(/[^\w-]/g, "\\$&");
    },

    text: function (el) {
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    },

    /* 焦点在可输入区域时，快捷键要避让。
       activeElement 只能看到 shadow 宿主，必须再往里穿一层，否则在自家输入框里打字会触发 ⌥ */
    isTyping: function () {
      var a = document.activeElement;
      if (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      if (!a || a === document.body) return false;
      var t = a.tagName;
      return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || a.isContentEditable === true;
    },

    className: function (el) {
      var c = el.className;
      if (!c) return "";
      return typeof c === "string" ? c : (c.baseVal || "");
    },

    fmt: function (n) { return Number(n).toLocaleString("en-US"); },

    /* 无权限/非安全上下文时的剪贴板兜底 */
    copy: function (str) {
      function legacy() {
        try {
          var ta = document.createElement("textarea");
          ta.value = str;
          ta.setAttribute("data-spot-ignore", "1");
          ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
          document.documentElement.appendChild(ta);
          ta.select();
          var ok = document.execCommand("copy");
          ta.remove();
          return ok;
        } catch (err) { return false; }
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        /* document 失焦时异步写会 reject，退回 execCommand */
        navigator.clipboard.writeText(str).catch(legacy);
        return true;
      }
      return legacy();
    }
  };
})(globalThis);
