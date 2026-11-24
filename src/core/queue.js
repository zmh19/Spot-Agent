/* Spot Agent · 本地队列：桥没起来时也不丢东西，全部落在 chrome.storage / localStorage */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.queue) return;

  var KEY = "queue";
  var MAX = 60;

  function list() {
    var q = S.store.get(KEY, []);
    return Array.isArray(q) ? q : [];
  }

  function save(q) {
    S.store.set(KEY, q);
    S.state.emit("queue", q.length);
    return q;
  }

  S.queue = {
    list: list,
    count: function () { return list().length; },

    add: function (item) {
      var q = list().slice();
      q.unshift(item);
      if (q.length > MAX) q.length = MAX;
      return save(q);
    },

    update: function (id, patch) {
      var q = list().slice();
      for (var i = 0; i < q.length; i++) {
        if (q[i].id === id) {
          for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) q[i][k] = patch[k];
          break;
        }
      }
      return save(q);
    },

    remove: function (id) {
      return save(list().filter(function (it) { return it.id !== id; }));
    },

    clear: function () { return save([]); },

    /* 桥上的队列是磁盘真身，本地只是镜像；开门时用它对齐 */
    set: function (next) {
      var q = Array.isArray(next) ? next.slice(0, MAX) : [];
      q.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      return save(q);
    },

    get: function (id) {
      var q = list();
      for (var i = 0; i < q.length; i++) if (q[i].id === id) return q[i];
      return null;
    },

    /* 生成任务单号：时间戳 + 随机后缀，避免同秒重复 */
    newId: function () {
      var d = new Date();
      function p(n) { return (n < 10 ? "0" : "") + n; }
      return "sa-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + "-" +
        Math.random().toString(36).slice(2, 6);
    }
  };
})(globalThis);
