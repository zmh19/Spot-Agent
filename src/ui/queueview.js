/* Spot Agent · 队列面板
   队列不是只读清单：要能点开 Finder、就地改写、逐条删、整队清。
   所有动磁盘的动作都交给桥（网页自己没有这个权限），本地只是镜像。 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  var UI = (S.ui = S.ui || {});
  if (UI.queueView) return;

  var Q = {
    root: null, list: null, n: null, foot: null, where: null, tab: null,
    open: false, min: false, saved: null,
    pos: null, moved: false, draft: null, editing: null, armed: false
  };
  var DRAG = { on: false, moved: false, dx: 0, dy: 0, sx: 0, sy: 0 };
  var armTimer = null;

  var STATUS = { local: "本地待提交", queued: "已写入 .spot", done: "已完成" };

  function time(iso) {
    try {
      return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 只替换「## 请求」那一节，上面的上下文一个字节都不动 */
  function withRequest(md, req) {
    var src = String(md || "");
    var head = "## 请求";
    var i = src.lastIndexOf(head);
    var body = String(req || "").trim() || "（待补充）";
    if (i < 0) return src + (src ? "\n\n" : "") + head + "\n" + body + "\n";
    return src.slice(0, i + head.length) + "\n" + body + "\n";
  }

  function short(p) {
    var s = String(p || "");
    return s.length > 46 ? "…" + s.slice(-45) : s;
  }

  /* ---------------- 行 ---------------- */

  function act(kind, label, title, fn) {
    var b = el("button", "sa-qact", label);
    b.type = "button";
    b.title = title;
    b.setAttribute("data-act", kind);
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  function row(it) {
    var r = el("div", "sa-qrow");
    r.setAttribute("data-id", it.id);

    var dot = el("i");
    dot.setAttribute("data-s", it.status || "local");

    var body = el("div", "sa-qbody");
    var b = el("b", null, it.request || it.title || "(无请求)");
    var sub = el("span", null,
      time(it.createdAt) + " · " + (it.file ? it.file.split("/").pop() : (STATUS[it.status] || it.status || "")));
    body.appendChild(b);
    body.appendChild(sub);

    var acts = el("div", "sa-qacts");
    acts.appendChild(act("reveal", "定位", "在 Finder 中选中这个文件", function () { Q.reveal(it.id); }));
    acts.appendChild(act("edit", "编辑", "就地改写这条任务", function () { Q.edit(it.id); }));
    acts.appendChild(act("copy", "复制", "复制完整 Markdown", function () { Q.copy(it.id); }));
    acts.appendChild(act("del", "删除", "删掉这条（连磁盘文件）", function () { Q.del(it.id); }));

    r.appendChild(dot);
    r.appendChild(body);
    r.appendChild(acts);

    /* 整行点击 = 去 Finder 里把它翻出来，正是最常用的动作 */
    r.title = "点击在 Finder 中定位";
    body.addEventListener("click", function () { Q.reveal(it.id); });
    body.style.cursor = "pointer";
    return r;
  }

  function editor(it, draft) {
    var r = el("div", "sa-qrow sa-qrow-edit");
    r.setAttribute("data-id", it.id);
    var dot = el("i");
    dot.setAttribute("data-s", "edit");
    r.appendChild(dot);

    var body = el("div", "sa-qbody");
    var ta = el("textarea", "sa-qedit");
    ta.value = draft != null ? draft : (it.request || "");
    ta.rows = 3;
    ta.spellcheck = false;

    var bar = el("div", "sa-qeditbar");
    var hint = el("span", null, "只改「请求」一节，上下文原样保留");
    bar.appendChild(hint);
    bar.appendChild(act("save", "保存", "写回磁盘文件（⌘⏎）", function () { Q.save(it.id, ta.value); }));
    bar.appendChild(act("cancel", "取消", "放弃修改", function () { Q.cancel(); }));

    ta.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        Q.save(it.id, ta.value);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        Q.cancel();
      }
    });

    body.appendChild(ta);
    body.appendChild(bar);
    r.appendChild(body);
    Q.editing = it.id;
    return r;
  }

  /* ---------------- 动作 ---------------- */

  function afterChange() {
    Q.editing = null;
    Q.draft = null;
    Q.sync();
    if (S.ui.panel) S.ui.panel.sync();
    if (S.ui.composer) S.ui.composer.sync();
  }

  /* status() 里的 up 是缓存值：桥中途重启过，它会一直停在旧的 false。
     所以缓存说活着就直接干（同步，界面不闪），缓存说死了才去现探一次 —— 
     否则会把"桥其实好好的"误报成"桥未启动"。 */
  function whenUp(fn) {
    if (!S.bridge) { fn(false); return; }
    if (S.bridge.status().up) { fn(true); return; }
    if (!S.bridge.ping) { fn(false); return; }
    S.bridge.ping(true).then(function (r) { fn(!!(r && r.ok)); });
  }

  Q.reveal = function (id) {
    whenUp(function (up) {
      if (!up) { S.overlay.toast("桥未启动 · 起桥后才能打开 Finder"); return; }
      S.bridge.reveal(id).then(function (r) {
        S.overlay.toast(r.ok ? "已在 Finder 中定位" : "定位失败：" + errText(r));
      });
    });
  };

  Q.copy = function (id) {
    var it = S.queue.get(id);
    if (!it) return;
    if (S.util.copy(it.md || "")) S.overlay.toast("已复制 " + it.id);
    else S.overlay.toast("复制失败，请检查剪贴板权限");
  };

  Q.edit = function (id) {
    Q.editing = id;
    Q.draft = null;
    Q.sync();
    var ta = Q.root.querySelector(".sa-qedit");
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  };

  Q.cancel = function () {
    Q.editing = null;
    Q.draft = null;
    Q.sync();
  };

  Q.save = function (id, text) {
    var it = S.queue.get(id);
    if (!it) return;
    var req = String(text || "").trim();
    if (!req) { S.overlay.toast("请求不能为空"); return; }

    var md = withRequest(it.md, req);

    S.queue.update(id, { request: req, md: md });
    afterChange();

    whenUp(function (up) {
      if (!up) { S.overlay.toast("已改本地 · 桥未启动，磁盘文件没动"); return; }
      S.bridge.update({ id: id, request: req, title: it.title, md: md }).then(function (r) {
        S.overlay.toast(r.ok ? "已写回磁盘" : "写回失败：" + errText(r));
      });
    });
  };

  Q.del = function (id) {
    var backup = S.queue.get(id);

    S.queue.remove(id);
    afterChange();

    whenUp(function (up) {
      if (!up) { S.overlay.toast("已删本地记录 · 桥未启动，磁盘文件还在"); return; }
      /* 先动界面再落盘；落盘失败就把它放回去，别留下"界面没了、磁盘还在" */
      S.bridge.remove(id).then(function (r) {
        if (r.ok) { S.overlay.toast("已删除（含磁盘文件）"); return; }
        if (backup) { S.queue.add(backup); afterChange(); }
        S.overlay.toast("删除失败：" + errText(r) + " · 已恢复");
      });
    });
  };

  Q.clearAll = function () {
    var backup = S.queue.list();

    S.queue.clear();
    afterChange();

    whenUp(function (up) {
      if (!up) { S.overlay.toast("已清空本地 · 桥未启动，磁盘文件没动"); return; }
      S.bridge.clear("all").then(function (r) {
        if (!r.ok) {
          S.queue.set(backup);
          afterChange();
          S.overlay.toast("清空失败：" + errText(r) + " · 已恢复");
          return;
        }
        S.overlay.toast("已清空 · 删掉 " + ((r.data && r.data.removed) || 0) + " 个文件");
        Q.hydrate();
      });
    });
  };

  function errText(r) {
    var e = (r && r.error) || "failed";
    if (e === "outside-sandbox") return "项目在 AI_Projects 之外";
    if (e === "no-bridge") return "桥未启动";
    if (e === "path-not-allowed") return "扩展后台没放行（重载扩展试试）";
    return e;
  }

  /* ---------------- 组装 ---------------- */

  Q.mount = function () {
    if (Q.root || !S.overlay.uiLayer) return;

    var box = el("div", "sa-queue");
    box.setAttribute("data-on", "0");

    var head = el("div", "sa-qhead");
    head.appendChild(el("span", "sa-qtitle", "队列"));
    head.appendChild(el("b", "sa-qn", "0"));
    Q.where = el("span", "sa-qwhere");
    head.appendChild(Q.where);

    var reveal = el("button", "sa-qreveal", "打开文件夹");
    reveal.type = "button";
    reveal.title = "在 Finder 中打开 .spot/prompts";
    reveal.addEventListener("click", function (e) {
      e.stopPropagation();
      Q.reveal("");
    });

    var clear = el("button", "sa-qclear", "清空");
    clear.type = "button";
    clear.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!Q.armed) {
        Q.armed = true;
        clear.textContent = "确定清空？";
        clear.setAttribute("data-armed", "1");
        clearTimeout(armTimer);
        armTimer = setTimeout(disarm, 3000);
        return;
      }
      disarm();
      Q.clearAll();
    });

    var minb = el("button", "sa-qmin", "–");
    minb.type = "button";
    minb.title = "最小化到右侧（队列还开着，点竖牌还原）";
    minb.addEventListener("click", function (e) {
      e.stopPropagation();
      Q.minimize();
    });

    var x = el("button", "sa-qx", "×");
    x.type = "button";
    x.title = "关闭（Esc）";
    x.addEventListener("click", function (e) {
      e.stopPropagation();
      Q.close();
    });

    head.appendChild(reveal);
    head.appendChild(clear);
    head.appendChild(minb);
    head.appendChild(x);

    box.appendChild(head);
    Q.list = el("div", "sa-qlist");
    box.appendChild(Q.list);
    Q.foot = el("div", "sa-qfoot");
    box.appendChild(Q.foot);

    /* 最小化后只剩这枚贴在右边缘的竖牌：点它还原，不点就一直待着 */
    Q.tab = el("button", "sa-qtab", "队列");
    Q.tab.type = "button";
    Q.tab.title = "展开队列";
    Q.tab.addEventListener("click", function (e) {
      e.stopPropagation();
      Q.restore();
    });
    box.appendChild(Q.tab);

    S.overlay.uiLayer.appendChild(box);
    Q.root = box;
    Q.n = head.querySelector(".sa-qn");

    /* 拖标题栏移动；按在按钮上不算拖 */
    head.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.target.closest("button")) return;
      var r = box.getBoundingClientRect();
      DRAG.on = true;
      DRAG.moved = false;
      DRAG.dx = e.clientX - r.left;
      DRAG.dy = e.clientY - r.top;
      DRAG.sx = e.clientX;
      DRAG.sy = e.clientY;
      box.setAttribute("data-grab", "1");
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有真实指针 */ }
    });
    head.addEventListener("pointermove", function (e) {
      if (!DRAG.on) return;
      if (!DRAG.moved && Math.abs(e.clientX - DRAG.sx) + Math.abs(e.clientY - DRAG.sy) < 4) return;
      DRAG.moved = true;
      Q.moved = true;
      Q.pos = { x: e.clientX - DRAG.dx, y: e.clientY - DRAG.dy };
      Q.place();
    });
    head.addEventListener("pointerup", function (e) {
      if (!DRAG.on) return;
      DRAG.on = false;
      box.removeAttribute("data-grab");
      try { head.releasePointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
    });

    Q.sync();
  };

  function disarm() {
    Q.armed = false;
    clearTimeout(armTimer);
    var btn = Q.root && Q.root.querySelector(".sa-qclear");
    if (!btn) return;
    btn.textContent = "清空";
    btn.removeAttribute("data-armed");
  }

  Q.isOpen = function () { return Q.open; };
  Q.isMin = function () { return Q.min; };

  Q.close = function () {
    Q.open = false;
    Q.min = false;
    Q.editing = null;
    disarm();
    if (!Q.root) return;
    Q.root.setAttribute("data-on", "0");
    Q.root.removeAttribute("data-min");
  };

  /* 最小化是"挂到边上"，不是关：状态、位置都留着，回来还是原样 */
  Q.minimize = function () {
    if (!Q.root || !Q.open || Q.min) return;
    Q.saved = Q.pos ? { x: Q.pos.x, y: Q.pos.y } : null;
    Q.min = true;
    Q.root.setAttribute("data-min", "1");
    Q.sync();
    Q.place();
  };

  Q.restore = function () {
    if (!Q.root || !Q.min) return;
    Q.min = false;
    Q.root.removeAttribute("data-min");
    Q.pos = Q.saved;
    Q.saved = null;
    Q.sync();
    Q.place();
  };

  Q.toggle = function () {
    if (!Q.root) return;
    if (Q.open) {
      if (Q.min) { Q.restore(); return; }   /* 竖牌状态下点队列按钮 = 还原 */
      Q.close();
      return;
    }
    Q.open = true;
    Q.root.setAttribute("data-on", "1");
    /* 没拖过就每次回正中；拖过就记住位置，不然"可移动"等于白说 */
    if (!Q.moved) Q.pos = null;
    Q.sync();
    Q.place();
    Q.hydrate();
  };

  /* 默认居中；拖过就按拖动位置，始终夹在视口里；最小化时贴右边缘竖着 */
  Q.place = function () {
    if (!Q.root) return;
    var vw = S.overlay.vw, vh = S.overlay.vh;

    if (Q.min) {
      var th = Q.root.offsetHeight || 118;
      Q.root.style.left = "auto";
      Q.root.style.right = "0";
      Q.root.style.top = Math.max(10, Math.round((vh - th) / 2)) + "px";
      return;
    }

    var w = Q.root.offsetWidth || 620;
    var h = Q.root.offsetHeight || 320;

    if (!Q.pos) {
      Q.root.style.left = Math.max(10, Math.round((vw - w) / 2)) + "px";
      Q.root.style.top = Math.max(10, Math.round((vh - h) / 2)) + "px";
      Q.root.style.right = "auto";
      return;
    }
    var x = Math.max(10, Math.min(Q.pos.x, vw - w - 10));
    var y = Math.max(10, Math.min(Q.pos.y, vh - h - 10));
    Q.root.style.right = "auto";
    Q.root.style.left = Math.round(x) + "px";
    Q.root.style.top = Math.round(y) + "px";
  };

  /* 打开时拿桥上的队列对齐本地镜像：磁盘有、本地没有的要补上 */
  Q.hydrate = function () {
    if (!S.bridge) return Promise.resolve();
    return S.bridge.queue().then(function (r) {
      if (!r.ok || !r.data || !Array.isArray(r.data.items)) return;
      var local = S.queue.list();
      var byId = {};
      var i;
      for (i = 0; i < local.length; i++) byId[local[i].id] = local[i];

      var merged = [];
      for (i = 0; i < r.data.items.length; i++) {
        var it = r.data.items[i];
        var cur = byId[it.id];
        if (cur) {
          cur.status = it.status || cur.status;
          cur.file = it.file || cur.file;
          cur.abs = it.abs || cur.abs;
          cur.root = it.root || cur.root;
          if (it.request) cur.request = it.request;
          if (it.md) cur.md = it.md;
          merged.push(cur);
          byId[it.id] = null;
        } else {
          merged.push({
            id: it.id, title: it.title, url: it.url, request: it.request,
            createdAt: it.createdAt, status: it.status || "queued",
            file: it.file, abs: it.abs, root: it.root, md: it.md || ""
          });
        }
      }
      /* 本地还没提交成功的（status=local）保留，别把人刚写的东西弄丢 */
      for (i = 0; i < local.length; i++) {
        if (byId[local[i].id]) merged.push(local[i]);
      }
      S.queue.set(merged);
      Q.sync();
      if (!Q.moved) Q.place();      /* 行数变了，居中的窗口重新居中 */
      if (S.ui.panel) S.ui.panel.sync();
    });
  };

  Q.sync = function () {
    if (!Q.root) return;

    /* 重绘前把正在编辑的文字捞出来，别让一次同步冲掉用户输入 */
    var live = Q.root.querySelector(".sa-qedit");
    if (Q.editing && live) Q.draft = live.value;

    var items = S.queue.list();
    Q.n.textContent = items.length;
    if (Q.tab) Q.tab.textContent = "队列 " + items.length;

    var st = S.bridge ? S.bridge.status() : { up: false, root: "" };
    var where = st.up && st.root ? st.root + "/.spot/prompts/" : "";
    Q.where.textContent = where ? short(where) : "桥未启动";
    Q.where.title = where || "起桥后队列才会落盘";
    Q.foot.textContent = st.up
      ? "磁盘即真相 · 改/删/清都会同步到 .spot（" + (st.root || "项目根未知") + "）"
      : "仅存本机浏览器 storage（键 queue）· 起桥后可落盘、可改可删";

    Q.list.textContent = "";

    if (!items.length) {
      Q.list.appendChild(el("div", "sa-qempty", "空。选元素、写一句、Enter 提交。"));
      return;
    }

    items.slice(0, 40).forEach(function (it) {
      Q.list.appendChild(it.id === Q.editing ? editor(it, Q.draft) : row(it));
    });
  };

  UI.queueView = Q;
})(globalThis);
