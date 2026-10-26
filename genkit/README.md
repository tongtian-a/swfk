# Genkit（swfk 的 AI 能力层）

Google Genkit + Gemini（Google AI 插件）。依赖已安装（`node_modules/`），
Node 使用仓库自带的便携版（`../../tools/node`）。
依赖：`genkit`、`@genkit-ai/google-genai`、`firebase-admin`（读写 Firestore）。

## 快速运行

```powershell
cd swfk\genkit
# .env 里已填好 GEMINI_API_KEY（新版 @genkit-ai/google-genai 用这个变量名）；也可手动：
# set GEMINI_API_KEY=你的密钥

..\..\tools\node\node.exe --env-file=.env hello-flow.mjs
```

输出一句中文问候即成功。

## 今日小结（daily-summary.mjs，flow 名 `summarizeDay`）

读取 `users/{uid}` 下**当天**的 todos / moods / notes，让 Gemini 生成一段温柔的中文
"今日小结"（3-4 句：完成/未完成、心情趋势、一句关心的话），console 输出，
并写回 `users/{uid}/summaries/{yyyy-mm-dd}`（字段 `{ text, createdAt }`，同一天重跑会覆盖）。

```powershell
cd swfk\genkit
..\..\tools\node\node.exe --env-file=.env daily-summary.mjs <uid>
```

- `<uid>`：Firebase 控制台 → **Authentication → Users** 里复制用户 UID。
- 当天没有任何 todos/moods/notes 时，输出"该用户今天还没有记录 🌙"，不报错、不落库。
- 模型偶发 503/429（高负载/限流）会自动重试最多 2 次。

## 最近 7 天心情（weekly-mood.mjs，flow 名 `weeklyMood`）

读取 `users/{uid}/moods` 最近 7 天记录，生成"emoji + 一句洞察"的心情趋势，
**只打印、不落库**。

```powershell
cd swfk\genkit
..\..\tools\node\node.exe --env-file=.env weekly-mood.mjs <uid>
```

- 最近 7 天没有心情记录时，同样友好提示、不报错。

## 说明

- 服务账号密钥固定读 `../../secrets/sfwk-service-account.json`（相对本目录脚本，
  项目 `sfwk-e27ae`），不要把它改成写死的绝对路径。
- 两个脚本读的数据结构与网页端一致：todos `{ text, done, createdAt }`、
  notes `{ title, content, updatedAt }`、moods `{ emoji, text, createdAt }`。
- console 显示 emoji 乱码时，先执行 `chcp 65001` 再运行。

## 开发者界面（本地调试 flows）

```powershell
..\..\tools\node\npx.cmd genkit start
```

会启动本地 Dev UI（默认 http://localhost:4000），可视化运行/调试 helloFlow。

## 与你提供的入门示例的差异

- `@genkit-ai/googleai` 已被官方弃用 → 改用 `@genkit-ai/google-genai`（API 兼容，导入同名 `googleAI`）。
- `gemini15Flash` 已对新用户停用 → 用 `googleAI.model('gemini-flash-latest')` 别名。

## 下一步可做

- ~~"今日总结"：读取 Firestore 里当天的 todos/moods，让 Gemini 生成一段总结~~（已完成，见 `daily-summary.mjs`；心情趋势见 `weekly-mood.mjs`）。
- 结构化输出：`ai.generate({ output: { schema: z.object({...}) } })` 生成 JSON。
- 提示词管理：`ai.definePrompt` 把提示词作为代码管理。
- 定时跑：Windows 任务计划程序每天晚上跑一次 `daily-summary.mjs`。
