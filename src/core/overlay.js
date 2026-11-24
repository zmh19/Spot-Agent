/* Spot Agent · 覆盖层宿主：一个 Shadow DOM 容器承载 canvas / 选中层 / UI 层 */
(function (root) {
  "use strict";

  var S = (root.__SPOT__ = root.__SPOT__ || {});
  if (S.overlay) return;

  var U = S.util;
  var HOST_ID = U.HOST_ID;

  var O = {
    host: null,
    shadow: null,
    canvas: null,
    ctx: null,
    domLayer: null,
    uiLayer: null,
    dpr: 1,
    vw: 0,
    vh: 0
  };

  var toastEl = null;
  var toastTimer = 0;

  O.mount = function () {
    if (document.getElementById(HOST_ID)) {
      O.host = document.getElementById(HOST_ID);
      O.shadow = O.host.shadowRoot;
      return false;
    }

    var host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("data-spot-ignore", "1");
    host.setAttribute("data-mode", "prototype");
    /* 挂在 documentElement 直接子级：绕开页面里可能存在的 transform 祖先 */
    host.style.cssText = "position:fixed;inset:0;display:block;overflow:hidden;" +
      "z-index:2147483000;pointer-events:none;";

    var shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" + ((S.ui && S.ui.css) || "") + "</style>" +
      '<canvas class="sa-cv"></canvas>' +
      '<div class="sa-dom"></div>' +
      '<div class="sa-ui"></div>';

    document.documentElement.appendChild(host);

    O.host = host;
    O.shadow = shadow;
    O.canvas = shadow.querySelector(".sa-cv");
    O.ctx = O.canvas.getContext("2d", { alpha: true });
    O.domLayer = shadow.querySelector(".sa-dom");
    O.uiLayer = shadow.querySelector(".sa-ui");

    O.size();

    toastEl = document.createElement("div");
    toastEl.className = "sa-toast";
    O.uiLayer.appendChild(toastEl);

    return true;
  };

  O.size = function () {
    if (!O.canvas) return;
    O.dpr = Math.min(root.devicePixelRatio || 1, 2);
    /* clientWidth 已排除滚动条，与 getBoundingClientRect 的视口坐标系一致 */
    O.vw = document.documentElement.clientWidth || root.innerWidth;
    O.vh = document.documentElement.clientHeight || root.innerHeight;
    O.canvas.width = Math.round(O.vw * O.dpr);
    O.canvas.height = Math.round(O.vh * O.dpr);
    O.canvas.style.width = O.vw + "px";
    O.canvas.style.height = O.vh + "px";
    O.ctx.setTransform(O.dpr, 0, 0, O.dpr, 0, 0);
  };

  O.clear = function () {
    if (!O.ctx) return;
    O.ctx.clearRect(0, 0, O.vw, O.vh);
  };

  O.setModeAttr = function (mode) {
    if (O.host) O.host.setAttribute("data-mode", mode);
  };

  O.toast = function (msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, ms || 1600);
  };

  /* 元素是否在自家宿主里 */
  O.own = function (node) { return U.isOwn(node); };

  S.overlay = O;
})(globalThis);
