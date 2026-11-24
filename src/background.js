/* Spot Agent · 后台代发
   content script 的 fetch 继承页面 origin（file:// 下是 null），直连 localhost 会被 CORS 挡死；
   走 service worker 出去，加上 host_permissions 就完全绕开。
   只放行 127.0.0.1:8787 的固定几个路径，避免变成任意请求代理。 */
"use strict";

const ENDPOINT = "http://127.0.0.1:8787";
const ALLOW = ["/ping", "/submit", "/queue", "/done", "/reveal", "/update", "/delete", "/clear"];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "spot.http") return;

  const path = String(msg.path || "");
  if (ALLOW.indexOf(path) < 0) {
    sendResponse({ ok: false, error: "path-not-allowed" });
    return;
  }

  fetch(ENDPOINT + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Spot-Client": "spot-agent" },
    body: JSON.stringify(msg.payload || {})
  })
    .then((r) => {
      return r
        .json()
        .then((data) => sendResponse({ ok: r.ok, status: r.status, data }))
        .catch(() => sendResponse({ ok: r.ok, status: r.status, data: null }));
    })
    .catch((e) => {
      sendResponse({ ok: false, error: "no-bridge", detail: String((e && e.message) || e) });
    });

  return true; // 异步响应
});
