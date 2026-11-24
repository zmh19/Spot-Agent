/* Spot Agent · 请求卡：跟着选区弹在元素右侧
   写一句「## 请求」→ Enter 提交 → 本地队列 → 桥落盘 → Qoder 用 MCP 读 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  var UI = (S.ui = S.ui || {});
  if (UI.composer) return;

  var C = {
    root: null, ctx: null, input: null, send: null, copyBtn: null,
    q: null, dot: null, busy: false, lastSig: "",
    open: "", seeded: false, key: "", edit: {}
  };

  var GAP = 14;

  /* 一级分类 / 二级需求：20 条取自《高频页面需求_SpotPrompt模版》。
     每句只写目标，边界和完成标准由提交的人当场补 —— 所以插进输入框的永远是纯文本，
     人能直接改；改过的版本会被记住，下次点同一类型用的就是你自己的说法。 */
  var NEEDS = [
    ["视觉", [
      ["通用", "视觉不符合规范：按现有规范修正这块的字号、间距、配色、圆角。", "选中整块容器；有规范文档就补一句依据。"],
      ["间距", "把这块的留白和卡片间距调匀。", "选中整块容器；具体数值当场补一句。"],
      ["对齐", "把区域内的标题、正文、按钮对到同一条线。", "选中出问题的组件，说明要和谁对齐。"],
      ["字号", "把这组文字的字号按层级调小一档。", "选中标题和正文所在块，说明调到哪一级。"],
      ["配色", "把不可用状态从灰化换成对应等级的颜色。", "选中卡片，补一句主色色值。"],
      ["卡片", "把这组卡片统一成一套容器样式。", "框选多张卡片一次提交。"],
      ["图标", "把这组图标的风格和尺寸统一。", "选中图标，补一句风格参照。"],
      ["图表", "让这块图表能点选查看某一天的数值。", "选中图表容器，补一句数据来源。"],
      ["表格", "统一表头样式，并让首列在横滑时保持固定。", "选中整张表，说明固定哪一列。"],
      ["图片", "修正图片比例和裁切，让主体完整显示。", "选中图片，说明主体在哪。"],
      ["品牌图形", "按现有品牌风格重画这组装饰图形。", "选中装饰图形，说明哪个颜色不能变。"]
    ]],
    ["功能", [
      ["通用", "功能不符合规范：按现有交互规范修正这块，其他部分保持不变。", "选中出问题的区域；说明触发条件。"],
      ["多端适配", "让这块在不同屏幕宽度下都能正常排版。", "选中内容区，补一句目标屏幕。"],
      ["交互响应", "让条件切换后页面状态跟着更新，返回时回到上一页。", "同时选中触发控件和生效区域。"],
      ["新增入口", "在指定位置加一个模块入口，结构跟旁边一致。", "选中导航或表格，说明放在第几个之后。"],
      ["导航", "把页面导航整理成最多三层，并让顶部导航吸顶跟随。", "选中导航容器，说明最多几层。"],
      ["筛选搜索", "补全筛选和搜索，让简称能匹配全称。", "选中搜索框，补一个简称例子。"],
      ["输入框", "修正输入框的高度和错误提示位置。", "选中输入框，说明高度要求。"],
      ["导出", "加一个按当前筛选结果导出的入口，文件名带日期。", "选中按钮所在区域，说明导出范围。"]
    ]],
    ["文案", [
      ["通用", "文案不符合规范：按术语表统一句式，去掉口语和营销腔。", "选中文字块；补一句术语词表。"],
      ["文案改写", "把这段文案改简洁，同类提示统一句式。", "选中文字块，补一句术语词表。"],
      ["提示语", "重写这个页面的空态和操作提示。", "选中空态区块，说明触发条件。"]
    ]],
    ["数据", [
      ["通用", "数据展示不符合规范：补齐来源、单位、统计口径和更新时间。", "选中图表或表头；说明数据来自哪。"],
      ["数据口径", "补齐这块数据的口径说明，含来源、单位、截止时间、更新频率。", "选中图表或表头，补数据来源。"],
      ["示例数据", "按真实业务造一组示例数据，字段、量级和名称都贴近真实。", "选中表格或图表；说明是哪个业务。"],
      ["可视化规范", "按数据可视化规范调整这块：坐标轴、单位、图例、配色统一。", "选中图表容器；补一句参照哪个看板。"],
      ["空态加载", "补上无数据、加载中、出错三种状态，别只做有数据的样子。", "选中容器；说明三种状态各自的文案。"],
      ["数字格式", "统一数字格式：千分位、小数位、单位和对齐方式。", "选中数字列，说明保留几位小数。"]
    ]],
    ["去AI化", [
      ["通用", "把这块里一眼能看出 AI 生成的设计特征去掉：渐变、玻璃、发光、emoji、超大圆角、居中堆叠。", "选中整块容器；命中哪条改哪条。"],
      ["渐变", "把紫色、彩色渐变换成纯色或极轻的单色底。", "选中渐变所在的卡片或标题区。"],
      ["玻璃拟态", "去掉毛玻璃、发光描边和背景光斑，改成实心卡片。", "选中带模糊背景的面板。"],
      ["emoji", "把 emoji 装饰换成线条图标，或直接删掉。", "选中含 emoji 的标题或按钮。"],
      ["排版", "打破居中堆叠，改成有信息层级的网格排版。", "选中整块区域的容器。"],
      ["圆角阴影", "把过大的圆角和过重的阴影收回统一规格。", "选中卡片；说明目标圆角。"],
      ["假数据", "把 Lorem ipsum 和假名字换成贴合业务的示例数据。", "选中表格或列表容器。"],
      ["模板文案", "把模板化的大标题和营销腔换成业务口吻。", "选中标题与副标题。"]
    ]]
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function shortPath(p) {
    return String(p || "").split("/").slice(-2).join("/");
  }

  function unionOf(list) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.x < x1) x1 = r.x;
      if (r.y < y1) y1 = r.y;
      if (r.x + r.w > x2) x2 = r.x + r.w;
      if (r.y + r.h > y2) y2 = r.y + r.h;
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /* ---------------- 快捷模版：一级分类 + 二级下拉 ---------------- */

  function findNeed(key) {
    for (var i = 0; i < NEEDS.length; i++) {
      if (key.indexOf(NEEDS[i][0] + "/") !== 0) continue;
      for (var j = 0; j < NEEDS[i][1].length; j++) {
        if (NEEDS[i][0] + "/" + NEEDS[i][1][j][0] === key) return NEEDS[i][1][j];
      }
    }
    return null;
  }

  function tplOf(key) {
    var it = findNeed(key);
    return C.edit[key] || (it ? it[1] : "");
  }

  function renderNeeds() {
    var tpl = C.root.querySelector(".sa-tpl");
    if (!tpl) return;
    tpl.textContent = "";

    NEEDS.forEach(function (g) {
      var b = el("button", "sa-chip", g[0] + " " + g[1].length);
      b.type = "button";
      b.setAttribute("data-cat", g[0]);
      b.setAttribute("data-open", C.open === g[0] ? "1" : "0");
      tpl.appendChild(b);
    });

    var group = null;
    for (var i = 0; i < NEEDS.length; i++) if (NEEDS[i][0] === C.open) group = NEEDS[i];
    if (!group) return;

    var box = el("div", "sa-needs");
    box.setAttribute("data-on", "1");
    group[1].forEach(function (it) {
      var key = group[0] + "/" + it[0];
      var r = el("div", "sa-needrow");
      r.setAttribute("data-need", key);
      r.setAttribute("tabindex", "0");
      r.setAttribute("title", it[2]);
      r.appendChild(el("b", null, it[0]));
      r.appendChild(el("span", null, tplOf(key)));
      box.appendChild(r);
    });
    tpl.appendChild(box);
  }

  /* 列表是绝对定位的，撑不到卡片高度里 —— 得按列表自己的框判断，
     下面放不下先把卡片往上挪，挪不动就贴着分类行往上翻 */
  function keepInside() {
    if (!C.root) return;
    var list = C.root.querySelector(".sa-needs");
    if (!list) return;
    var vh = window.innerHeight || 0;
    var lr = list.getBoundingClientRect();
    if (lr.bottom <= vh - 8) return;
    var need = lr.bottom - (vh - 8);
    var card = C.root.getBoundingClientRect();
    if (card.top - need >= 8) {
      var top = parseFloat(C.root.style.top || "0") - need;
      C.root.style.top = Math.max(8, Math.round(top)) + "px";
    } else {
      list.setAttribute("data-up", "1");
    }
  }

  function toggleCat(cat) {
    C.open = C.open === cat ? "" : cat;
    renderNeeds();
    keepInside();
  }

  /* 输入框里还是上一个模版（原样，或人改过的那句）就整段换掉；
     已经写了别的东西才另起一行，别把人的原话挤掉 */
  function insertNeed(key) {
    var t = tplOf(key);
    var cur = C.input.value;
    var same = !!C.key && cur.trim() === tplOf(C.key).trim();
    C.input.value = (!cur.trim() || same) ? t : cur.replace(/\s+$/, "") + "\n" + t;
    C.seeded = true;
    C.key = key;
    C.open = "";
    renderNeeds();
    grow();
    C.input.focus();
    var end = C.input.value.length;
    C.input.setSelectionRange(end, end);
    C.sync();
    keepInside();
  }

  C.mount = function () {
    if (C.root || !S.overlay.uiLayer) return;

    var box = el("div", "sa-compose");

    C.ctx = el("div", "sa-ctx");
    C.input = el("textarea", "sa-input");
    C.input.rows = 3;
    C.input.placeholder = "针对这段写点什么…  Enter 提交";
    C.input.spellcheck = false;

    var tpl = el("div", "sa-tpl");

    var acts = el("div", "sa-acts");
    C.copyBtn = el("button", "sa-ghost", "复制");
    C.copyBtn.type = "button";
    C.send = el("button", "sa-send", "提交");
    C.send.type = "button";
    C.q = el("button", "sa-q", "队列 0");
    C.q.type = "button";
    C.dot = el("i", "sa-dot");
    acts.appendChild(C.copyBtn);
    acts.appendChild(C.send);
    acts.appendChild(C.q);
    acts.appendChild(C.dot);

    box.appendChild(C.ctx);
    box.appendChild(C.input);
    box.appendChild(tpl);
    box.appendChild(acts);

    S.overlay.uiLayer.appendChild(box);
    C.root = box;

    bind();
    renderNeeds();
    C.sync();
  };

  function bind() {
    C.send.addEventListener("click", function (e) {
      e.stopPropagation();
      C.submit();
    });

    C.copyBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      C.copy();
    });

    C.q.addEventListener("click", function (e) {
      e.stopPropagation();
      if (S.ui.queueView) S.ui.queueView.toggle();
    });

    /* 一级点分类，二级点需求；列表挂在 .sa-tpl 里，一个监听就够 */
    C.root.querySelector(".sa-tpl").addEventListener("click", function (e) {
      var chip = e.target.closest("button[data-cat]");
      if (chip) { toggleCat(chip.getAttribute("data-cat")); return; }
      var row = e.target.closest("[data-need]");
      if (row) insertNeed(row.getAttribute("data-need"));
    });

    C.root.querySelector(".sa-tpl").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target.closest && e.target.closest("[data-need]");
      if (!row) return;
      e.preventDefault();
      insertNeed(row.getAttribute("data-need"));
    });

    /* 注意：不要在这里 stopPropagation 拦截鼠标事件。事件从 shadow 出来后 isOwnEvent 已为真，
       input.js 会整段跳过；一旦拦在宿主上，卡内按钮的 click 就永远到不了目标。 */
    C.input.addEventListener("input", function () {
      /* 人改过的模版记住，下次点同一类型用的就是他自己的说法 */
      if (C.seeded && C.key) { C.edit[C.key] = C.input.value; C.seeded = false; }
      grow();
      C.sync();
    });

    C.input.addEventListener("keydown", function (e) {
      /* 中文输入法组字期间的回车是在选词，不能当成提交 */
      if (e.isComposing || e.keyCode === 229) return;

      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        C.submit();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (C.open) { C.open = ""; renderNeeds(); return; }
        C.input.blur();
      }
    });
  }

  function grow() {
    C.input.style.height = "auto";
    C.input.style.height = Math.min(Math.max(C.input.scrollHeight + 2, 84), 190) + "px";
  }

  /* 贴着选区右侧；右边放不下翻左侧；两边都被元素占满就落到元素下方，最后才夹回视口 */
  function place(list) {
    var O = S.overlay;
    var w = C.root.offsetWidth || 308;
    var h = C.root.offsetHeight || 200;
    var box = unionOf(list);
    var vw = O.vw, vh = O.vh;

    var right = box.x + box.w + GAP;
    var left = box.x - w - GAP;
    var x, y = box.y;

    if (right + w <= vw - 8) {
      x = right;
    } else if (left >= 8) {
      x = left;
    } else {
      /* 元素几乎占满整行：横排放不下，改成右缘对齐落到下方 */
      x = Math.min(Math.max(8, box.x + box.w - w), Math.max(8, vw - w - 8));
      y = box.y + box.h + GAP;
    }

    if (y + h > vh - 8) {
      var above = box.y - h - GAP;
      y = above >= 8 ? above : Math.max(8, vh - h - 8);
    }
    if (y < 8) y = 8;

    C.root.style.left = Math.round(x) + "px";
    C.root.style.top = Math.round(y) + "px";
  }

  C.isFocused = function () {
    var sr = S.overlay.shadow;
    return !!(sr && sr.activeElement === C.input);
  };

  C.value = function () { return C.input ? C.input.value : ""; };

  C.setBridge = function (up) {
    if (!C.dot) return;
    C.dot.setAttribute("data-up", up ? "1" : "0");
    C.dot.title = up ? "本地桥在线 · " + S.bridge.endpoint : "本地桥未启动 · 提交存本地队列";
  };

  C.sync = function () {
    if (!C.root) return;
    var st = S.state.raw;
    var list = st.selection;
    var visible = S.state.isActive() && list.length > 0;

    C.root.setAttribute("data-on", visible ? "1" : "0");
    if (C.q) C.q.textContent = "队列 " + (S.queue ? S.queue.count() : 0);

    if (!visible) {
      C.lastSig = "";
      if (C.open) { C.open = ""; renderNeeds(); }
      C.send.disabled = true;
      return;
    }

    var n = list.length;
    var first = S.scan.label(list[0]);
    C.ctx.textContent = "";
    var mark = document.createElement("b");
    mark.textContent = "已选 " + n;
    C.ctx.appendChild(mark);
    if (first) C.ctx.appendChild(document.createTextNode("  " + first));

    var sig = list.map(function (r) { return r.x + "," + r.y + "," + r.w + "," + r.h; }).join("|");
    if (sig !== C.lastSig) {
      C.lastSig = sig;
      place(list);
    }

    C.send.disabled = !(C.input.value.trim().length > 0 && !C.busy);
    C.send.textContent = C.busy ? "提交中…" : "提交";
  };

  C.copy = function () {
    var list = S.state.raw.selection;
    if (!list.length) { S.overlay.toast("先选一个元素"); return; }
    var ok = S.snapshot.copy(list, C.input.value);
    S.overlay.toast(ok ? "已复制上下文" : "复制失败，请检查剪贴板权限");
  };

  C.submit = function () {
    if (C.busy) return;
    var list = S.state.raw.selection;
    var req = C.input.value.trim();

    if (!list.length) { S.overlay.toast("先选一个元素"); return; }
    if (!req) { C.input.focus(); return; }

    var ctx = S.snapshot.build(list);
    var id = S.queue.newId();
    var createdAt = new Date().toISOString();
    var body = S.snapshot.task(ctx, req, { id: id, createdAt: createdAt });

    var item = {
      id: id,
      createdAt: createdAt,
      url: ctx.page.url,
      title: ctx.page.title,
      request: req,
      md: body,
      status: "local",
      file: ""
    };

    S.queue.add(item);
    C.busy = true;
    C.sync();

    return S.bridge.submit(item).then(function (res) {
      C.busy = false;
      if (res.ok) {
        S.queue.update(id, { status: "queued", file: res.file });
        C.setBridge(true);
        S.overlay.toast("已写入 " + shortPath(res.file));
      } else if (res.error === "outside-sandbox") {
        /* 桥活着，只是这个页面不在 AI_Projects 里——别误报成"桥未启动" */
        C.setBridge(true);
        S.overlay.toast("本页不在 AI_Projects 内 · 已存本地队列");
      } else {
        C.setBridge(false);
        S.overlay.toast("已存本地队列 · 桥未启动");
      }
      /* 无论成败都清空：任务已经进队列了，留着只会重复提交 */
      C.input.value = "";
      C.seeded = false;
      C.key = "";
      grow();
      C.sync();
      return res;
    });
  };

  C.ping = function () {
    if (!S.bridge) return;
    S.bridge.ping().then(function (r) { C.setBridge(!!r.ok); });
  };

  UI.composer = C;
})(globalThis);
