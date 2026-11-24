/* Spot Agent · 与本地桥通信
   扩展内一律经 background 转发（content script 的 fetch 继承页面 origin，
   file:// 下会被 CORS 直接挡死）；注入壳没有 background，直连 localhost。 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.bridge) return;

  var ENDPOINT = "http://127.0.0.1:8787";
  var state = { up: null, at: 0, lastError: "", root: "" };

  function hasRuntime() {
    return !!(root.chrome && root.chrome.runtime && root.chrome.runtime.id &&
      typeof root.chrome.runtime.sendMessage === "function");
  }

  function direct(path, payload) {
    return fetch(ENDPOINT + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Spot-Client": "spot-agent" },
      body: JSON.stringify(payload || {})
    }).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, status: r.status, data: j };
      }, function () {
        return { ok: r.ok, status: r.status, data: null };
      });
    }).catch(function (e) {
      return { ok: false, error: "no-bridge", detail: String(e && e.message || e) };
    });
  }

  function post(path, payload) {
    if (!hasRuntime()) return direct(path, payload);
    return new Promise(function (resolve) {
      try {
        root.chrome.runtime.sendMessage({ type: "spot.http", path: path, payload: payload || {} }, function (res) {
          if (root.chrome.runtime.lastError || !res) {
            resolve({ ok: false, error: "no-bridge" });
            return;
          }
          resolve(res);
        });
      } catch (e) {
        resolve({ ok: false, error: "no-bridge", detail: String(e && e.message || e) });
      }
    });
  }

  S.bridge = {
    endpoint: ENDPOINT,

    /* 桥是否活着；5 秒内复用上次结果，避免每次提交都探活 */
    ping: function (force) {
      var now = Date.now();
      if (!force && state.up !== null && now - state.at < 5000) {
        return Promise.resolve({ ok: state.up, cached: true, root: state.root });
      }
      return post("/ping", {}).then(function (res) {
        state.up = !!res.ok;
        state.at = now;
        state.lastError = res.ok ? "" : (res.error || "unreachable");
        if (res.ok && res.data && res.data.root) state.root = res.data.root;
        return { ok: !!res.ok, root: res.data && res.data.root ? res.data.root : state.root };
      });
    },

    submit: function (item) {
      return post("/submit", {
        id: item.id,
        url: item.url,
        title: item.title,
        request: item.request,
        md: item.md,
        createdAt: item.createdAt
      }).then(function (res) {
        if (res.ok && res.data && res.data.file) {
          state.up = true;
          state.at = Date.now();
          if (res.data.root) state.root = res.data.root;
          return { ok: true, file: res.data.file, root: res.data.root };
        }
        state.up = false;
        state.at = Date.now();
        state.lastError = res.error || (res.data && res.data.error) || "failed";
        return { ok: false, error: state.lastError };
      });
    },

    status: function () {
      return { up: state.up, root: state.root, lastError: state.lastError, endpoint: ENDPOINT };
    },

    /* ---- 队列维护：浏览器拉不起 Finder，也不该自己删盘上的文件，全交给桥 ---- */
    queue: function () {
      return post("/queue", { url: pageUrl(), withBody: true }).then(simple);
    },
    reveal: function (id) {
      return post("/reveal", { id: id || "", url: pageUrl() }).then(simple);
    },
    remove: function (id) {
      return post("/delete", { id: id }).then(simple);
    },
    clear: function (scope) {
      return post("/clear", { scope: scope || "all", url: pageUrl() }).then(simple);
    },
    update: function (item) {
      return post("/update", {
        id: item.id,
        request: item.request,
        title: item.title,
        md: item.md
      }).then(simple);
    }
  };

  function pageUrl() {
    try { return String(root.location && root.location.href || ""); } catch (e) { return ""; }
  }

  /* 维护类接口只关心成不成，不需要像 submit 那样回写探活状态 */
  function simple(res) {
    if (res.ok && res.data && res.data.ok !== false) return { ok: true, data: res.data };
    var err = res.error || (res.data && res.data.error) || "failed";
    state.lastError = err;
    return { ok: false, error: err };
  }
})(globalThis);
