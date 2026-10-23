# swfk · 个人管家（Web）

基于 Firebase（Authentication 邮箱密码登录 + Firestore）的个人管家 Web 应用。
项目：`sfwk-e27ae` · 部署目标：`https://sfwk-e27ae.web.app`

## 功能（v0）

- 📧 邮箱 / 密码 注册与登录（Firebase Auth）
- ✅ 任务清单（添加 / 完成 / 删除）
- 📝 备忘录（标题 + 内容）
- 💚 心情打卡（表情 + 一句话）
- 数据按用户隔离：`users/{uid}/todos|notes|moods`，安全规则见 `firestore.rules`

## 本地运行（无需 Node）

```powershell
cd swfk
python -m http.server 8080 --directory public
```

浏览器打开 http://127.0.0.1:8080

## ⚠️ 首次使用前必须做的两件事（控制台，各 30 秒）

1. **启用邮箱/密码登录**（已确认项目尚未初始化 Authentication，API 无法代办）：
   https://console.firebase.google.com/project/sfwk-e27ae/authentication
   → 「开始使用（Get started）」→ 选择「电子邮件/密码（Email/Password）」→ 启用 → 保存。

2. **确认 Firestore 数据库存在**（已验证：已创建且可读写 ✓，此步可跳过）。
   如遇提示未创建：https://console.firebase.google.com/project/sfwk-e27ae/firestore
   → 创建数据库 → 生产模式 → 区域就近选择。

## 服务端验证

`python verify_server.py` —— 自动创建测试用户 `butler@test.local`（密码 `Test12345!`）、
验证 Firestore 读写、并用网页同款 API 模拟登录。
（需先完成上面第 1 步；测试用户可在控制台 Authentication → Users 中删除。）

## 部署到 Firebase Hosting（一次性安装 Node）

本仓库自带便携版 Node（`../tools/node`，免管理员安装）：

```powershell
cd swfk
..\tools\node\npm.cmd install -g firebase-tools
..\tools\node\npx.cmd firebase login     # 会打开浏览器，用你的 Google 账号登录
..\tools\node\npx.cmd firebase deploy    # 部署 Hosting + Firestore 规则
```

部署后访问：https://sfwk-e27ae.web.app

## AI 能力（Genkit）

`genkit/` 目录内置 Genkit（Google AI 插件）+ helloFlow 示例，见 `genkit/README.md`。
后续可扩展：让管家用 Gemini 总结今日任务/心情（张章鱼同款记忆机制也可接入）。

## 安全须知

- `public/firebase-config.js` 里的 apiKey 是 Web 公开密钥，安全性依赖 Firestore 规则（已配置）。
- `../secrets/sfwk-service-account.json` 是服务账号私钥 = 项目最高权限钥匙：
  不要提交到任何仓库 / 不要放进 `public/` / 不要发给别人；泄露后应在控制台撤销重建。
