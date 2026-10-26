// 每日小结 flow：summarizeDay
// 读取 users/{uid} 下当天的 todos/moods/notes → Gemini 生成温柔的中文"今日小结"
// → console 输出，并写回 users/{uid}/summaries/{yyyy-mm-dd}（字段 { text, createdAt }）
//
// 运行（在 swfk/genkit 目录下，uid 从 Firebase 控制台 Authentication → Users 复制）：
//   ..\..\tools\node\node.exe --env-file=.env daily-summary.mjs <uid>
import { fileURLToPath } from 'node:url';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// 服务账号密钥：相对本文件的路径（不要改成写死的绝对路径）
const SERVICE_ACCOUNT = fileURLToPath(
  new URL('../../secrets/sfwk-service-account.json', import.meta.url));

initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-3.1-flash-lite'), // 与 hello-flow 保持一致
});

// ---------- 小工具 ----------
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toDate = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate() : null);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

// ---------- flow ----------
export const summarizeDay = ai.defineFlow('summarizeDay', async (uid) => {
  const userDoc = db.collection('users').doc(uid);
  const start = startOfToday();

  // 各拉最近若干条，在代码里按"今天"切分（避免组合索引；个人数据量很小）
  const [todoSnap, moodSnap, noteSnap] = await Promise.all([
    userDoc.collection('todos').orderBy('createdAt', 'desc').limit(100).get(),
    userDoc.collection('moods').orderBy('createdAt', 'desc').limit(50).get(),
    userDoc.collection('notes').orderBy('updatedAt', 'desc').limit(50).get(),
  ]);

  const todayTodos = [];   // 今天新建的待办（含完成/未完成）
  const olderOpen = [];    // 更早遗留、仍未完成的待办
  todoSnap.forEach((doc) => {
    const t = doc.data();
    const created = toDate(t.createdAt);
    if (created && created >= start) todayTodos.push({ ...t, created });
    else if (t.done === false) olderOpen.push({ ...t, created });
  });

  const todayMoods = [];   // 今天的心情记录
  moodSnap.forEach((doc) => {
    const m = doc.data();
    const created = toDate(m.createdAt);
    if (created && created >= start) todayMoods.push({ ...m, created });
  });

  const todayNotes = [];   // 今天更新过的笔记
  noteSnap.forEach((doc) => {
    const n = doc.data();
    const updated = toDate(n.updatedAt);
    if (updated && updated >= start) todayNotes.push({ ...n, updated });
  });

  // 无数据：友好提示，不抛异常、不调用模型、不落库
  if (!todayTodos.length && !olderOpen.length && !todayMoods.length && !todayNotes.length) {
    return {
      saved: false,
      text: `该用户今天还没有记录 🌙（uid: ${uid}）——先在网页里添加几条待办/心情/笔记，再跑一次吧。`,
    };
  }

  // 拼 prompt
  const lines = [];
  if (todayTodos.length) {
    lines.push('【今天的待办】');
    todayTodos.forEach((t) =>
      lines.push(`- [${t.done ? '已完成' : '未完成'}] ${t.text}（建于 ${timeHM(t.created)}）`));
  }
  if (olderOpen.length) {
    lines.push('【更早遗留、还没完成的待办】');
    olderOpen.slice(0, 10).forEach((t) => lines.push(`- ${t.text}（建于 ${dateKey(t.created)}）`));
  }
  if (todayMoods.length) {
    lines.push('【今天的心情】');
    todayMoods.forEach((m) =>
      lines.push(`- ${m.emoji || '❓'} ${m.text || ''}（${timeHM(m.created)}）`.trimEnd()));
  }
  if (todayNotes.length) {
    lines.push('【今天更新过的笔记】');
    todayNotes.forEach((n) =>
      lines.push(`- 《${n.title || '无标题'}》：${String(n.content || '').slice(0, 200)}`));
  }

  const prompt = [
    '你是个人管家应用里一位温柔的 AI 助手。请根据下面这位用户今天的数据，',
    '写一段温柔的中文"今日小结"，3-4 句话：',
    '1）自然地提到完成了哪些事、还有哪些没完成（如有遗留事项可轻轻带一句）；',
    '2）结合心情 emoji 和文字描述今天的心情趋势；',
    '3）最后用一句自然的、关心对方的话收尾。',
    '直接输出正文，不要标题、不要列表、不要解释。',
    '',
    ...lines,
  ].join('\n');

  const { text } = await generateWithRetry(prompt);
  const summary = text.trim();

  // 写回 users/{uid}/summaries/{yyyy-mm-dd}
  const key = dateKey();
  await userDoc.collection('summaries').doc(key).set(
    { text: summary, createdAt: FieldValue.serverTimestamp() },
    { merge: true });

  return { saved: true, summaryDoc: `users/${uid}/summaries/${key}`, text: summary };
});

// ---------- 直接运行 ----------
const uid = process.argv[2];
if (!uid) {
  console.error('用法：node --env-file=.env daily-summary.mjs <uid>');
  console.error('uid 从 Firebase 控制台 → Authentication → Users 里复制。');
  process.exit(1);
}

const result = await summarizeDay(uid);
console.log('—— 今日小结 ——');
console.log(result.text);
if (result.saved) console.log(`（已写回 ${result.summaryDoc}）`);
