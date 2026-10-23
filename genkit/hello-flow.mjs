// Genkit 入门示例：helloFlow
// 运行：见 README.md（需设置 GOOGLE_GENAI_API_KEY）
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// 配置 Genkit 实例
// 说明：@genkit-ai/googleai 已弃用，官方建议改用 @genkit-ai/google-genai（本目录已安装）。
// gemini15Flash 已停止对新用户开放；这里用 3.1-flash-lite（当前负载低、秒级响应），
// 高峰期想换更强的改这一行：'gemini-3.8-flash' 或 'gemini-flash-latest'。
const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-3.1-flash-lite'), // 默认模型
});

// 定义一个 flow：为工作流提供端到端可观测性，可用 `npx genkit start` 在开发者界面调试
const helloFlow = ai.defineFlow('helloFlow', async (name) => {
  // 发起生成请求
  const { text } = await ai.generate(
    `Hello Gemini, my name is ${name}。请用一句自然的中文问候我。`);
  return text;
});

// 直接运行（也可通过 genkit 开发者界面调用）
const text = await helloFlow('张章鱼');
console.log(text);
