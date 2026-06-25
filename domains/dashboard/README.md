# Comet Dashboard

本目录包含 `comet dashboard` 的只读本地仪表盘：后端采集当前仓库的
`openspec/changes`、Git 与验证状态，前端位于 `web/`。

## 启动

在仓库根目录运行：

```powershell
pnpm build
node .\bin\comet.js dashboard . --port 4399 --no-open
```

然后打开：

```text
http://localhost:4399/
```

停止服务：回到运行命令的终端按 `Ctrl+C`。

## Demo 模式

如果只是预览页面效果，不读取当前仓库真实数据，在 URL 后加 `?demo`：

```text
http://localhost:4399/?demo
```

Demo 数据来自 `web/demo.js`，适合检查首屏、侧边栏、卡片和响应式布局。

## 常用选项

```powershell
node .\bin\comet.js dashboard . --port 4399
node .\bin\comet.js dashboard . --port 4399 --no-open
node .\bin\comet.js dashboard . --json
```

- `--port 4399`：指定 HTTP 端口；如果端口被占用，Dashboard 会尝试后续端口。
- `--no-open`：只启动服务，不自动打开浏览器。
- `--json`：只输出一次 Dashboard snapshot，适合脚本检查，不启动浏览器服务。

## 开发提示

Dashboard 前端是原生 HTML/CSS/JavaScript 模块，没有独立前端构建步骤。
修改 `domains/dashboard/web/` 后，如果通过 `bin/comet.js` 启动，需要先运行
`pnpm build`，因为 CLI 入口读取的是 `dist/` 下的构建产物。
