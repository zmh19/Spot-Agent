<p align="center">
  <img src="icons/icon-128.png" width="80" height="80" alt="Spot Agent 图标">
</p>

<h1 align="center">Spot Agent</h1>

<p align="center"><strong>指着界面说改哪里，剩下的交给你的编码 Agent。</strong></p>

<p align="center">
  <a href="README.md">English</a>
</p>

Spot Agent 把任意网页变成 MCP 编码 Agent 的「提交需求」界面：切到 Design 模式，选中真正的元素，写下要改什么，按 Enter。本地桥会把选择器、几何、布局、字体和文本写成一份 Markdown，落到 `<项目>/.spot/`，再通过 MCP 交给 Agent。Agent 读任务、改代码、标记完成。

为 [Qoder](https://qoder.com) 而做，也能接 Claude Code、Cursor 和任何 MCP 客户端。Chrome / Edge（Manifest V3），零运行时依赖。

状态：**0.2.0，早期版本。** 文件格式和接口仍可能调整。

## 环境要求

- Chrome 或 Edge 102+
- Node.js 18+
- 一个 MCP 客户端（只用覆盖层时可以不要）
- macOS 才能「在 Finder 中定位」，其余功能 Linux / Windows 可用

## 怎么用

### 1. 加载扩展

1. 打开 `chrome://extensions`，开启**开发者模式**。
2. 点**加载已解压的扩展程序**，选中包含 `manifest.json` 的这个文件夹。
3. 要在本地页面上用，进扩展详情，打开**允许访问文件网址**。

不需要构建。

### 2. 接上本地桥

在 MCP 客户端里加上这个服务：

```json
{
  "mcpServers": {
    "spot-agent": {
      "command": "node",
      "args": ["/绝对路径/spot-agent/bridge/bridge.mjs"],
      "env": {
        "SPOT_SANDBOX": "/绝对路径/你的项目目录"
      }
    }
  }
}
```

- `bridge.mjs` 写绝对路径，改完重启客户端。
- `SPOT_SANDBOX` 是桥唯一允许写入的目录树，默认 `~/Documents/AI_Projects`；越界写入会被拒绝。
- 还没接 MCP 客户端？先跑 `node bridge/bridge.mjs --http-only`，只用覆盖层。

### 3. 提交需求

1. 打开任意页面。
2. 轻按一次 `Alt`，右上角浮窗变黄，进入 Design 模式。
3. 悬停后单击元素；拖拽框选；Cmd/Ctrl+单击加减选。
4. 写下要改什么，按 `Enter`。
5. 对 Agent 说：**「看一下 Spot Agent 队列，把最新那条改掉。」**

Agent 会调用 `spot_list_prompts`、`spot_read_prompt`，改完代码再调用 `spot_mark_done`。

## 快捷键

| 操作 | 行为 |
| --- | --- |
| 轻按 `Alt` | 切换 Design / Prototype |
| `Shift+Alt+L` 或 `Shift+Alt+D` | 切换 Design / Prototype |
| `Shift+Alt+X` | 暂停 / 恢复覆盖层 |
| 单击 | 选最内层；原地再点逐层向外 |
| `Shift`+单击 | 向内一层 |
| `Cmd/Ctrl`+单击 | 加入 / 移出选区 |
| 拖拽 | 框选；按住 `Shift` / `Cmd` / `Ctrl` 追加 |
| `Esc` | 关队列；否则清选区；否则往外层走一步 |
| `Enter` | 提交；`Shift+Enter` 换行 |

**Prototype**（默认）是被动的，点击还给页面；**Design** 接管指针事件用来选元素。轻按 `Alt` 切换，按住超过 600 ms 不触发。

浮窗上还有密度开关：**结构**只留结构元素，**全部元素**连文字级节点一起纳入。页面太吵时，在容器上加 `data-spot-scope`，只扫那棵子树。

## 任务写到哪

```text
<项目>/.spot/
├── queue.json
└── prompts/
    └── sa-20261124-101500-a1b2-fix-kpi-cards.md
```

```md
## 1. div.kpi-card
- 选择器：`#overview > div:nth-of-type(2)`
- 尺寸：280 × 132  @ (640, 220)
- 布局：flex row / align center / gap 12px
- 字体：14px/20px 500 Inter
- 颜色：color rgb(17, 14, 11) / background rgb(255, 255, 255)
- 文本：Conversion rate 3.8%

## 请求
把两张 KPI 卡片调成等高。
```

字段标签目前是中文，字段值来自页面。项目根按 `SPOT_ROOT` → `file://` 页面就近的 `.spot-root` / `.qoder` / `.git`（都没有就用页面目录）→ 桥的工作目录依次确定。`http://localhost` 页面反推不出根，请设置 `SPOT_ROOT`。

## MCP 工具

| 工具 | 用途 |
| --- | --- |
| `spot_list_prompts` | 列出各项目的任务（`status`、`limit`） |
| `spot_read_prompt` | 读取一条任务的全文（`id`） |
| `spot_mark_done` | 标记完成或阻塞（`id`、`status`、`note`） |
| `spot_status` | 端口、沙箱、已知项目根、任务数 |

## 配置

| 名称 | 默认值 | 含义 |
| --- | --- | --- |
| `SPOT_SANDBOX` | `~/Documents/AI_Projects` | 桥唯一允许写入的目录树 |
| `SPOT_ROOT` | 未设置 | 强制一个项目根；`http://localhost` 常用 |
| `SPOT_PORT` | `8787` | HTTP 端口；扩展里写死 8787 |
| `SPOT_NO_OPEN` | 未设置 | `1` 时不调 Finder |

本地桥零依赖，只监听 `127.0.0.1`。没有认证，请当作本地开发工具使用。任务文件可能包含页面文本和 URL，`.spot/` 不要提交到版本库。

## 限制

- 只有 Chromium MV3，且只处理顶层页面；iframe 里的元素选不到。
- 快照在提交时生成，之后 DOM 变化可能让选择器漂移。
- 桥没起来时提交的请求不会在桥恢复后自动重投。
- 0.2.0 的界面和任务字段标签是中文。

## 许可证

MIT，见 [LICENSE](LICENSE)。
