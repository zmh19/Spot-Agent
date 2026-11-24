<p align="center">
  <img src="icons/icon-128.png" width="80" height="80" alt="Spot Agent icon">
</p>

<h1 align="center">Spot Agent</h1>

<p align="center"><strong>Point at the UI. Describe the change. Let your coding agent pick it up.</strong></p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
</p>

Spot Agent turns any page into a request surface for an MCP coding agent: switch to Design mode, select the real elements, write the change, press Enter. A local bridge writes a Markdown task with selectors, geometry, layout, typography and text into `<project>/.spot/`, then exposes it to your agent over MCP. The agent reads it, edits the code, and marks it done.

Built for [Qoder](https://qoder.com). Works with Claude Code, Cursor, and any MCP client. Chrome / Edge (Manifest V3), zero runtime dependencies.

Status: **0.2.0, early.** File formats and interfaces may change.

## Requirements

- Chrome or Edge 102+
- Node.js 18+
- An MCP client (optional if you only use the overlay)
- macOS for "Reveal in Finder"; the rest runs on Linux and Windows

## How to use

### 1. Load the extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder, the one containing `manifest.json`.
3. For local pages, open the extension's details and enable **Allow access to file URLs**.

No build step is required.

### 2. Connect the bridge

Add this MCP server to your client's config:

```json
{
  "mcpServers": {
    "spot-agent": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/spot-agent/bridge/bridge.mjs"],
      "env": {
        "SPOT_SANDBOX": "/ABSOLUTE/PATH/TO/YOUR/PROJECTS"
      }
    }
  }
}
```

- Use an absolute path to `bridge.mjs`, then restart the client.
- `SPOT_SANDBOX` is the only directory tree the bridge may write to. It defaults to `~/Documents/AI_Projects`; writes outside it are rejected.
- No MCP client? Run `node bridge/bridge.mjs --http-only` to use the overlay alone.

### 3. Use it

1. Open any page.
2. Tap `Alt` once. The panel turns yellow: Design mode is on.
3. Hover and click an element; drag to select a region; Cmd/Ctrl-click to add or remove.
4. Write the change and press `Enter`.
5. Ask your agent: **"Check the Spot Agent queue and fix the latest request."**

The agent calls `spot_list_prompts`, reads the task with `spot_read_prompt`, edits your code, and calls `spot_mark_done`.

## Shortcuts

| Gesture | Action |
| --- | --- |
| Tap `Alt` | Toggle Design / Prototype |
| `Shift+Alt+L` or `Shift+Alt+D` | Toggle Design / Prototype |
| `Shift+Alt+X` | Pause or resume the overlay |
| Click | Select the innermost element; click again to walk outward |
| `Shift`+click | Walk one layer inward |
| `Cmd/Ctrl`+click | Add or remove an element from the selection |
| Drag | Marquee-select; hold `Shift` / `Cmd` / `Ctrl` to append |
| `Esc` | Close the queue, else clear the selection, else step outward |
| `Enter` | Submit; `Shift+Enter` inserts a newline |

**Prototype** (default) is passive: clicks go to the page. **Design** captures pointer events for selection. A bare `Alt` tap toggles; holding it longer than 600 ms is ignored.

The panel also has a density toggle. **Skeleton** keeps structural elements; **All elements** includes text-level nodes. To limit scanning, add `data-spot-scope` to the container you care about.

## What gets written

```text
<project>/.spot/
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
Make the two KPI cards equal height.
```

The generated labels are currently Chinese; values come from the page. The project root comes from `SPOT_ROOT`, otherwise the nearest `.spot-root`, `.qoder` or `.git` above a `file://` page (or the page's directory if there is no marker), otherwise the bridge's working directory. For `http://localhost`, set `SPOT_ROOT`.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `spot_list_prompts` | List tasks across known projects (`status`, `limit`) |
| `spot_read_prompt` | Read one task in full (`id`) |
| `spot_mark_done` | Mark a task done or blocked (`id`, `status`, `note`) |
| `spot_status` | Bridge port, sandbox, known roots and task counts |

## Configuration

| Name | Default | Meaning |
| --- | --- | --- |
| `SPOT_SANDBOX` | `~/Documents/AI_Projects` | Only directory tree the bridge may write to |
| `SPOT_ROOT` | unset | Force one project root; useful for `http://localhost` |
| `SPOT_PORT` | `8787` | HTTP port; the extension hardcodes 8787 |
| `SPOT_NO_OPEN` | unset | `1` disables Finder calls |

The bridge uses no dependencies and listens on `127.0.0.1` only. There is no authentication; treat it as a local development tool. Task files can contain page text and URLs, so keep `.spot/` out of version control.

## Limitations

- Chromium MV3 and the top frame only; iframe content cannot be selected.
- The snapshot is taken at submit time; later DOM changes can make selectors drift.
- Requests submitted while the bridge is down are not automatically re-posted.
- UI and task labels are Chinese in 0.2.0.

## License

MIT. See [LICENSE](LICENSE).
