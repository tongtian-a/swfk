// 每周心情 flow：weeklyMood
// 读取 users/{uid}/moods 最近 7 天记录 → Gemini 生成心情趋势（emoji + 一句洞察）
// → console 打印，不落库。
//
// 运行（在 swfk/genkit 目录下，uid 从 Firebase 控制台 Authentication → Users 复制）：
//   ..\..\tools\node\node.exe --env-file=.env weekly-mood.mjs <uid>
import { fileURLToPath } from 'node:url';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 服务账号密钥：相对本文件的路径（不要改成写死的绝对路径）
const SERVICE_ACCOUNT = fileURLToPath(
  new URL('../../secrets/sfwk-service-account.json', import.meta.url));

initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-3.1-flash-lite'), // 与 hello-flow 保持一致
});

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate() : null);

// 模型调用带简单重试：Gemini 偶发 503/429（高负载/限流）时自动退避重试，避免裸异常
const RETRIABLE = new Set([429, 500, 503, 504]);
async function generateWithRetry(prompt, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await ai.generate(prompt);
    } catch (e) {
      const code = Number(e?.code);
      if (!RETRIABLE.has(code) || i >= tries) throw e;
      const waitMs = 3000 * i;
      console.error(`（模型暂时不可用 ${code}，${waitMs / 1000}s 后重试 ${i}/${tries - 1}…）`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

export const weeklyMood = ai.defineFlow('weeklyMood', async (uid) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const snap = await db.collection('users').doc(uid)
    .collection('moods').orderBy('createdAt', 'desc').limit(100).get();

  // 代码里过滤最近 7 天（单查询即可，不需要额外索引）
  const week = [];
  snap.forEach((doc) => {
    const m = doc.data();
    const created = toDate(m.createdAt);
    if (created && created >= since) week.push({ ...m, created });
  });
  week.sort((a, b) => a.created - b.created); // 按时间正序，便于看趋势

  // 无数据：友好提示，不抛异常
  if (!week.length) {
    return `该用户最近 7 天还没有心情记录 🌙（uid: ${uid}）——先在网页里记几条心情，再跑一次吧。`;
  }

  const records = week
    .map((m) => `- ${dateKey(m.created)} ${pad(m.created.getHours())}:${pad(m.created.getMinutes())} ${m.emoji || '❓'} ${m.text || ''}`.trimEnd())
    .join('\n');

  const prompt = [
    '下面是一位用户最近 7 天的心情记录（日期 时间 emoji 一句话）。请概括心情趋势，',
    '输出且只输出一行：以一个 emoji 开头，后跟一句温柔的中文洞察。',
    '不要标题、不要解释、不要换行。',
    '',
    records,
  ].join('\n');

  const { text } = await generateWithRetry(prompt);
  return text.trim();
});

// ---------- 直接运行 ----------
const uid = process.argv[2];
if (!uid) {
  console.error('用法：node --env-file=.env weekly-mood.mjs <uid>');
  console.error('uid 从 Firebase 控制台 → Authentication → Users 里复制。');
  process.exit(1);
}

const text = await weeklyMood(uid);
console.log('—— 最近 7 天心情 ——');
console.log(text);
