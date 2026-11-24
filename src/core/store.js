/* Spot Agent · 存储抽象：扩展内用 chrome.storage，注入壳退化为 localStorage */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.store) return;

  var cache = {};
  var KEY = "__spot__";
  var hasChrome = !!(root.chrome && root.chrome.storage && root.chrome.storage.local);

  function load() {
    if (hasChrome) {
      return root.chrome.storage.local.get(null).then(function (v) {
        cache = v || {};
      }).catch(function () { /* 隐私模式等，静默降级为内存态 */ });
    }
    try {
      cache = JSON.parse(root.localStorage.getItem(KEY) || "{}") || {};
    } catch (e) {
      cache = {};
    }
    return Promise.resolve();
  }

  function flush() {
    if (hasChrome) {
      var out = {};
      for (var k in cache) if (Object.prototype.hasOwnProperty.call(cache, k)) out[k] = cache[k];
      return root.chrome.storage.local.set(out).catch(function () {});
    }
    try {
      root.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) { /* 配额超限，忽略 */ }
    return Promise.resolve();
  }

  S.store = {
    init: load,
    get: function (k, d) { return cache[k] === undefined ? d : cache[k]; },
    set: function (k, v) { cache[k] = v; return flush(); },
    all: function () { return cache; }
  };
})(globalThis);
