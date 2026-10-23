# Genkit（swfk 的 AI 能力层）

Google Genkit + Gemini（Google AI 插件）。依赖已安装（`node_modules/`），
Node 使用仓库自带的便携版（`../../tools/node`）。

## 快速运行

```powershell
cd swfk\genkit
# .env 里已填好 GOOGLE_GENAI_API_KEY；也可手动：
# set GOOGLE_GENAI_API_KEY=你的密钥

..\..\tools\node\node.exe hello-flow.mjs
```

输出一句中文问候即成功。

## 开发者界面（本地调试 flows）

```powershell
..\..\tools\node\npx.cmd genkit start
```

会启动本地 Dev UI（默认 http://localhost:4000），可视化运行/调试 helloFlow。

## 与你提供的入门示例的差异

- `@genkit-ai/googleai` 已被官方弃用 → 改用 `@genkit-ai/google-genai`（API 兼容，导入同名 `googleAI`）。
- `gemini15Flash` 已对新用户停用 → 用 `googleAI.model('gemini-flash-latest')` 别名。

## 下一步可做

- 用 `ai.defineFlow` 做"今日总结"：读取 Firestore 里当天的 todos/moods，让 Gemini 生成一段总结。
- 结构化输出：`ai.generate({ output: { schema: z.object({...}) } })` 生成 JSON。
- 提示词管理：`ai.definePrompt` 把提示词作为代码管理。
