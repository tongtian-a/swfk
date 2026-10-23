// 个人管家 · sfwk —— 主逻辑（Firebase Auth + Firestore）
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- 工具 ----------
const $ = (id) => document.getElementById(id);

const AUTH_ERRORS = {
  "auth/invalid-credential": "邮箱或密码不正确。",
  "auth/wrong-password": "邮箱或密码不正确。",
  "auth/user-not-found": "该邮箱尚未注册。",
  "auth/email-already-in-use": "该邮箱已注册，请直接登录。",
  "auth/weak-password": "密码太弱，请至少使用 6 位。",
  "auth/invalid-email": "邮箱格式不正确。",
  "auth/operation-not-allowed":
    "邮箱/密码登录尚未启用：请到 Firebase 控制台 → Authentication → 登录方式 → 启用“电子邮件/密码”。",
  "auth/invalid-api-key": "Firebase 配置有误（apiKey）。",
  "auth/network-request-failed": "网络连接失败，请检查网络。",
};

function showAuthError(code) {
  $("auth-error").textContent = AUTH_ERRORS[code] || `出错：${code}`;
}

// ---------- 登录 / 注册 ----------
$("btn-login").onclick = () => {
  $("auth-error").textContent = "";
  signInWithEmailAndPassword(auth, $("auth-email").value.trim(), $("auth-password").value)
    .catch((e) => showAuthError(e.code));
};

$("btn-signup").onclick = () => {
  $("auth-error").textContent = "";
  createUserWithEmailAndPassword(auth, $("auth-email").value.trim(), $("auth-password").value)
    .catch((e) => showAuthError(e.code));
};

$("btn-logout").onclick = () => signOut(auth);
$("auth-password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-login").click(); });

// ---------- 登录态 ----------
let uid = null;
const unsubs = {};

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    $("auth-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    $("user-email").textContent = user.email;
    subscribeAll();
  } else {
    uid = null;
    Object.values(unsubs).forEach((u) => u());
    for (const k of Object.keys(unsubs)) delete unsubs[k];
    $("app-view").classList.add("hidden");
    $("auth-view").classList.remove("hidden");
  }
});

function userCol(name) {
  return collection(db, "users", uid, name);
}

// ---------- 标签页 ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    for (const p of document.querySelectorAll(".panel")) p.classList.add("hidden");
    $(`panel-${btn.dataset.tab}`).classList.remove("hidden");
  };
});

// ---------- 数据订阅 ----------
function subscribeAll() {
  subscribeTodos(); subscribeNotes(); subscribeMoods();
}

function subscribeTodos() {
  unsubs.todos = onSnapshot(query(userCol("todos"), orderBy("createdAt", "desc")), (snap) => {
    const ul = $("todo-list");
    ul.innerHTML = snap.empty ? '<li class="empty">还没有任务，加一个吧。</li>' : "";
    snap.forEach((d) => {
      const t = d.data();
      const li = document.createElement("li");
      if (t.done) li.className = "done";
      li.innerHTML = `<div class="grow"><div class="title"></div></div>
        <button data-act="toggle">${t.done ? "取消" : "完成"}</button>
        <button data-act="del">删除</button>`;
      li.querySelector(".title").textContent = t.text;
      li.querySelector('[data-act="toggle"]').onclick = () =>
        updateDoc(doc(db, "users", uid, "todos", d.id), { done: !t.done });
      li.querySelector('[data-act="del"]').onclick = () =>
        deleteDoc(doc(db, "users", uid, "todos", d.id));
      ul.appendChild(li);
    });
  });
}

function subscribeNotes() {
  unsubs.notes = onSnapshot(query(userCol("notes"), orderBy("updatedAt", "desc")), (snap) => {
    const ul = $("note-list");
    ul.innerHTML = snap.empty ? '<li class="empty">还没有备忘。</li>' : "";
    snap.forEach((d) => {
      const n = d.data();
      const li = document.createElement("li");
      li.innerHTML = `<div class="grow"><div class="title"></div>
        <div class="body"></div><div class="meta"></div></div>
        <button data-act="del">删除</button>`;
      li.querySelector(".title").textContent = n.title || "（无标题）";
      li.querySelector(".body").textContent = n.content || "";
      li.querySelector(".meta").textContent = n.updatedAt?.toDate?.().toLocaleString("zh-CN") || "";
      li.querySelector('[data-act="del"]').onclick = () =>
        deleteDoc(doc(db, "users", uid, "notes", d.id));
      ul.appendChild(li);
    });
  });
}

function subscribeMoods() {
  unsubs.moods = onSnapshot(query(userCol("moods"), orderBy("createdAt", "desc")), (snap) => {
    const ul = $("mood-list");
    ul.innerHTML = snap.empty ? '<li class="empty">今天心情如何？点一个表情记录下来。</li>' : "";
    snap.forEach((d) => {
      const m = d.data();
      const li = document.createElement("li");
      li.innerHTML = `<div class="grow"><div class="title"></div>
        <div class="body"></div><div class="meta"></div></div>
        <button data-act="del">删除</button>`;
      li.querySelector(".title").textContent = m.emoji || "🙂";
      li.querySelector(".body").textContent = m.text || "";
      li.querySelector(".meta").textContent = m.createdAt?.toDate?.().toLocaleString("zh-CN") || "";
      li.querySelector('[data-act="del"]').onclick = () =>
        deleteDoc(doc(db, "users", uid, "moods", d.id));
      ul.appendChild(li);
    });
  });
}

// ---------- 添加数据 ----------
$("todo-add").onclick = async () => {
  const text = $("todo-input").value.trim();
  if (!text || !uid) return;
  $("todo-input").value = "";
  await addDoc(userCol("todos"), { text, done: false, createdAt: serverTimestamp() });
};
$("todo-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("todo-add").click(); });

$("note-add").onclick = async () => {
  const title = $("note-title").value.trim();
  const content = $("note-content").value.trim();
  if (!title && !content) return;
  $("note-title").value = ""; $("note-content").value = "";
  await addDoc(userCol("notes"), { title, content, updatedAt: serverTimestamp() });
};

let selectedMood = "🙂";
document.querySelectorAll(".mood").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".mood").forEach((x) => x.classList.toggle("selected", x === b));
    selectedMood = b.dataset.emoji;
  };
});
$("mood-add").onclick = async () => {
  if (!uid) return;
  const text = $("mood-input").value.trim();
  $("mood-input").value = "";
  await addDoc(userCol("moods"), { emoji: selectedMood, text, createdAt: serverTimestamp() });
};
