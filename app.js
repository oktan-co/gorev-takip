import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, addDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getMessaging, getToken, isSupported, onMessage }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";
import { firebaseConfig, vapidKey, userDomain } from "./firebase-config.js";
import {
  addDays, dayDiff, nextOccurrence, firstOccurrence, isValidRule, describe, GUN_KISA
} from "./repeat.js";

/* ============ kurulum ============ */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLORS = ["#6c7cff","#1d9e75","#e5a33a","#d85a30","#d4537e","#7f77dd","#378add","#639922","#b4b2a9"];

const DEFAULT_SETTINGS = {
  reminders: [
    { id: "sabah", label: "Sabah özeti", time: "09:00", type: "today", enabled: true },
    { id: "gece",  label: "Gece özeti",  time: "23:59", type: "tomorrow", enabled: true }
  ],
  includeUndated: true,
  nagEnabled: true,
  nagTimes: ["21:00", "22:00", "23:00", "23:30", "23:40", "23:50"],
  repeatPresets: []
};
function normSettings(s = {}) {
  const o = { ...DEFAULT_SETTINGS, ...s };
  if (!Array.isArray(o.reminders)) o.reminders = DEFAULT_SETTINGS.reminders.map(r => ({ ...r }));
  if (!Array.isArray(o.nagTimes)) o.nagTimes = [...DEFAULT_SETTINGS.nagTimes];
  if (!Array.isArray(o.repeatPresets)) o.repeatPresets = [];
  return o;
}

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

const ICONS = {
  sun:'<path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  up:'<path d="M7 17 17 7M9 7h8v8"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  note:'<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h6"/>',
  repeat:'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/><path d="M2 8c0-2.2.7-4.3 2-6M22 8a10 10 0 0 0-2-6"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  chev:'<path d="m6 9 6 6 6-6"/>'
};
const svg = (k, cls="ic") => `<svg viewBox="0 0 24 24" class="${cls}">${ICONS[k]}</svg>`;

/* ============ tarih ============ */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const AYLAR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const GUNLER = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
function dateLabel(s){
  if (!s) return "Tarihsiz";
  const t = today();
  if (s === t) return "Bugün";
  if (s === addDays(t,1)) return "Yarın";
  if (s === addDays(t,-1)) return "Dün";
  const d = new Date(s + "T12:00:00");
  const base = `${d.getDate()} ${AYLAR[d.getMonth()]}`;
  return d.getFullYear() !== new Date().getFullYear() ? `${base} ${d.getFullYear()}` : base;
}
function lateLabel(s){
  const n = dayDiff(s, today());
  return n === 1 ? "1 gün gecikti" : `${n} gün gecikti`;
}

/* ============ durum ============ */
const S = {
  uid:null, me:null, isAdmin:false,
  groups:[], lists:[], tasks:[], users:[],
  settings: normSettings(), sent: null,
  view:(()=>{ try { return localStorage.getItem("gt_view") || "today"; } catch(e){ return "today"; } })(), search:"", composerDate:null, collapsed:{}, openAcc:{}, unsubs:[]
};
try { S.collapsed = JSON.parse(localStorage.getItem("gt_collapsed") || "{}"); } catch(e){}
try { S.openAcc = JSON.parse(localStorage.getItem("gt_acc") || '{"hatirlatma":true}'); } catch(e){}

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ============ giriş ============ */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = $("#loginUser").value.trim().toLowerCase();
  const p = $("#loginPass").value;
  const err = $("#loginError");
  err.hidden = true;
  $("#loginBtn").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, `${u}@${userDomain}`, p);
  } catch (ex) {
    err.textContent = ["auth/invalid-credential","auth/wrong-password","auth/user-not-found","auth/invalid-email"]
      .includes(ex.code) ? "Kullanıcı adı veya şifre hatalı." : "Giriş yapılamadı: " + ex.code;
    err.hidden = false;
  }
  $("#loginBtn").disabled = false;
});

$("#logoutBtn").addEventListener("click", async () => {
  if (!confirm("Çıkış yapılsın mı?")) return;
  await signOut(auth);
  location.reload();
});

onAuthStateChanged(auth, async (user) => {
  $("#bootScreen").classList.add("hide");
  if (!user) {
    S.unsubs.forEach(f => f()); S.unsubs = [];
    $("#app").hidden = true;
    $("#loginScreen").classList.add("show");
    return;
  }
  S.uid = user.uid;
  $("#loginScreen").classList.remove("show");
  $("#app").hidden = false;

  let prof = null;
  try { prof = await getDoc(doc(db, "users", user.uid)); } catch (e) { /* kural reddi */ }
  if (!prof || !prof.exists()) {
    await signOut(auth);
    $("#app").hidden = true;
    $("#loginScreen").classList.add("show");
    const err = $("#loginError");
    err.innerHTML = "Bu hesabın profili yok. Kurulum adımındaki <b>users</b> kaydını ekle " +
      "(kullanıcı no: " + esc(user.uid) + ").";
    err.hidden = false;
    return;
  }
  S.me = prof.data();
  S.isAdmin = S.me.role === "admin";
  paintMe();
  subscribe();
  setupPush();
});

function paintMe(){
  $("#sideName").textContent = S.me.displayName || S.me.username;
  $("#sideRole").textContent = S.isAdmin ? "Yönetici" : "Kullanıcı";
  $("#sideAvatar").textContent = (S.me.displayName || S.me.username || "?").charAt(0).toUpperCase();
}

/* ============ veri ============ */
function subscribe(){
  const sub = (path, fn) => S.unsubs.push(onSnapshot(collection(db, path), (snap) => {
    fn(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    render();
  }, (e) => console.warn(path, e.code)));

  sub("groups", v => S.groups = v.sort((a,b) => (a.order||0)-(b.order||0)));
  sub("lists",  v => S.lists  = v.sort((a,b) => (a.order||0)-(b.order||0)));
  sub("tasks",  v => S.tasks  = v);
  sub("users",  v => {
    S.users = v;
    const me = v.find(u => u.id === S.uid);
    if (me) { S.me = me; paintMe(); }
  });

  S.unsubs.push(onSnapshot(doc(db, "settings", "app"), (d) => {
    S.settings = normSettings(d.exists() ? d.data() : {});
    render();
  }, () => {}));

  if (S.isAdmin) {
    S.unsubs.push(onSnapshot(doc(db, "system", "sent"), (d) => {
      S.sent = d.exists() ? d.data() : { keys: {}, log: [] };
      if (S.view === "settings") render();
    }, () => {}));
  }
}

const visibleLists = () => S.isAdmin ? S.lists
  : S.lists.filter(l => l.ownerUid === S.uid || (l.members || []).includes(S.uid));

function visibleTasks(){
  const ids = new Set(visibleLists().map(l => l.id));
  return S.tasks.filter(t => ids.has(t.listId) || t.assignedTo === S.uid);
}
const listById = (id) => S.lists.find(l => l.id === id);
const userName = (uid) => {
  const u = S.users.find(x => x.id === uid);
  return u ? (u.displayName || u.username) : "—";
};

function saveSettings(patch){
  S.settings = { ...S.settings, ...patch };
  const { reminders, includeUndated, nagEnabled, nagTimes, repeatPresets } = S.settings;
  return setDoc(doc(db, "settings", "app"),
    { reminders, includeUndated, nagEnabled, nagTimes, repeatPresets }, { merge: true })
    .catch(e => toast("Kaydedilemedi: " + e.code));
}

/* ============ görev işlemleri ============ */
async function addTask(title, dateStr, listId){
  const lid = listId || firstWritableList();
  if (!lid) { toast("Önce bir liste oluştur"); return; }
  await addDoc(collection(db, "tasks"), {
    title: title.trim(), note: "", listId: lid, date: dateStr || null,
    done: false, doneAt: null, assignedTo: null, repeat: null, persistent: false,
    createdBy: S.uid, createdAt: Date.now()
  });
}
function firstWritableList(){
  if (S.view.startsWith("list:")) return S.view.slice(5);
  const v = visibleLists();
  return v.length ? v[0].id : null;
}
const patchTask = (id, data) => updateDoc(doc(db, "tasks", id), data);
const removeTask = (id) => deleteDoc(doc(db, "tasks", id));

/* görev hatırlatmaları: {id, date:"YYYY-MM-DD", time:"HH:MM"}; remDue = sıradaki hatırlatma (sunucu bunu sorgular) */
const REM_WINDOW_MIN = 90;
const nowStr = (d = new Date()) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const validRem = (r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") && /^\d{2}:\d{2}$/.test(r.time || "");
function calcRemDue(rems){
  const lim = nowStr(new Date(Date.now() - REM_WINDOW_MIN * 60000));
  const c = (rems || []).filter(validRem).map(r => `${r.date}T${r.time}`).filter(x => x >= lim).sort();
  return c[0] || null;
}
const remLabel = (r) => `${dateLabel(r.date)} ${r.time}`;
const newRemId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function toggleDone(t){
  // Tekrarlayan görev: bu seferki tamamlandı olarak kaydedilir, görev sonraki tarihe kayar
  if (!t.done && isValidRule(t.repeat)) {
    const occ = t.date || today();
    const after = occ > today() ? occ : today();
    const next = nextOccurrence(t.repeat, after, t.date || today());
    await addDoc(collection(db, "tasks"), {
      title: t.title, note: t.note || "", listId: t.listId, date: occ,
      done: true, doneAt: Date.now(), assignedTo: t.assignedTo || null,
      repeat: null, persistent: false, fromRepeat: t.id,
      steps: (t.steps || []).map(x => ({ ...x })),
      createdBy: S.uid, createdAt: Date.now()
    });
    if (next) {
      // hatırlatmalar görevle aynı gün sayısı kadar kayar (ör. her ayın 10'unda 09:00)
      const delta = dayDiff(occ, next);
      const rems = (t.reminders || []).filter(validRem).map(r => ({ ...r, date: addDays(r.date, delta) }));
      await patchTask(t.id, { date: next, steps: (t.steps || []).map(x => ({ ...x, done: false })),
                              reminders: rems, remDue: calcRemDue(rems) });
      toast(`Tamamlandı · sonraki: ${dateLabel(next)}`);
    } else {
      await patchTask(t.id, { done: true, doneAt: Date.now() });
    }
    return;
  }
  await patchTask(t.id, { done: !t.done, doneAt: !t.done ? Date.now() : null });
}

/* ============ görünüm ============ */
function groupTasks(){
  const t = today();
  const all = visibleTasks().filter(x => !x.done);
  const q = S.search.trim().toLowerCase();
  const match = (x) => !q || (x.title || "").toLowerCase().includes(q) || (x.note || "").toLowerCase().includes(q);
  return {
    late:    all.filter(x => x.date && x.date < t && match(x)).sort((a,b) => a.date.localeCompare(b.date)),
    today:   all.filter(x => x.date === t && match(x)),
    undated: all.filter(x => !x.date && match(x)),
    soon:    all.filter(x => x.date && x.date > t && match(x)).sort((a,b) => a.date.localeCompare(b.date))
  };
}

function render(){
  try { if (S.view) localStorage.setItem("gt_view", S.view); } catch(e){}
  renderSidebar();
  renderMain();
}

function renderSidebar(){
  const g = groupTasks();
  const views = [
    { k:"today",   icon:"sun",   label:"Bugün",       count: g.late.length + g.today.length, danger: g.late.length > 0 },
    { k:"undated", icon:"inbox", label:"Tarihsiz",    count: g.undated.length },
    { k:"soon",    icon:"cal",   label:"Yaklaşan",    count: g.soon.length },
    { k:"done",    icon:"check", label:"Tamamlanan",  count: null }
  ];
  $("#smartViews").innerHTML = views.map(v => `
    <button class="sv ${S.view===v.k?"active":""}" data-view="${v.k}">
      ${svg(v.icon)}<span class="sv-label">${v.label}</span>
      <span class="sv-count ${v.danger?"danger":""}">${v.count ?? ""}</span>
    </button>`).join("");

  const lists = visibleLists();
  const openCount = (lid) => visibleTasks().filter(t => t.listId === lid && !t.done).length;
  const listRow = (l) => `
    <button class="li ${S.view==="list:"+l.id?"active":""}" data-view="list:${l.id}">
      <span class="dot" style="background:${esc(l.color||"#6c7cff")}"></span>
      <span class="li-name">${esc(l.name)}</span>
      ${(l.members||[]).length ? `<span class="li-shared">${svg("users")}</span>` : ""}
      <span class="li-count">${openCount(l.id) || ""}</span>
    </button>`;

  let html = "";
  for (const grp of S.groups){
    const items = lists.filter(l => l.groupId === grp.id);
    if (!items.length && !S.isAdmin) continue;
    const col = S.collapsed[grp.id] ? "collapsed" : "";
    html += `<div class="group ${col}" data-group="${grp.id}">
      <button class="group-head" data-toggle="${grp.id}">
        <svg viewBox="0 0 24 24" class="chev">${ICONS.chev}</svg>
        <span class="group-name">${esc(grp.name)}</span>
      </button>
      <div class="group-body">${items.map(listRow).join("") ||
        `<div style="padding:8px 10px;font-size:12px;color:var(--tx-3)">Liste yok</div>`}</div>
    </div>`;
  }
  const loose = lists.filter(l => !l.groupId || !S.groups.some(g2 => g2.id === l.groupId));
  if (loose.length) html += `<div class="group"><div class="group-body" style="margin-left:0;border:none;padding-left:0">${loose.map(listRow).join("")}</div></div>`;
  $("#listTree").innerHTML = html || `<div style="padding:10px;font-size:13px;color:var(--tx-3)">Henüz liste yok.</div>`;
  $("#addGroupBtn").hidden = !S.isAdmin;
  $("#addListBtn").hidden = !S.isAdmin;
}

const canDrag = () => window.matchMedia("(min-width:821px)").matches;

function taskRow(t, opts = {}){
  const l = listById(t.listId);
  const late = t.date && t.date < today() && !t.done;
  const meta = [];
  if (late) meta.push(`<span class="late">${svg("alert")}${lateLabel(t.date)}</span>`);
  else if (t.date && !opts.hideDate) meta.push(`<span>${svg("cal")}${dateLabel(t.date)}</span>`);
  if (isValidRule(t.repeat) && !t.done) meta.push(`<span>${svg("repeat")}${esc(describe(t.repeat, t.date))}</span>`);
  if (!t.done) {
    const up = (t.reminders || []).filter(validRem).filter(r => `${r.date}T${r.time}` > nowStr())
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];
    if (up) meta.push(`<span>${svg("bell")}${esc(remLabel(up))}</span>`);
  }
  if ((t.steps || []).length) meta.push(`<span>${svg("check")}${t.steps.filter(x => x.done).length}/${t.steps.length}</span>`);
  if (t.persistent && !t.done) meta.push(`<span class="nag">${svg("bell")}Israrlı</span>`);
  if (t.note) meta.push(`<span>${svg("note")}Not</span>`);
  if (t.assignedTo) meta.push(`<span>${svg("users")}${esc(userName(t.assignedTo))}</span>`);
  if (l) meta.push(`<span class="tag"><span class="d" style="background:${esc(l.color||"#6c7cff")}"></span>${esc(l.name)}</span>`);
  return `<div class="task ${t.done?"done":""}" data-task="${t.id}" ${canDrag() ? 'draggable="true"' : ""}>
    <button class="check" data-check="${t.id}" aria-label="Tamamla"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></button>
    <div class="t-body">
      <div class="t-title">${esc(t.title)}</div>
      ${meta.length ? `<div class="t-meta">${meta.join("")}</div>` : ""}
    </div>
    ${opts.toToday ? `<button class="t-act" data-totoday="${t.id}" title="Bugüne al">${svg("up")}</button>` : ""}
  </div>`;
}

function section(title, items, opts = {}){
  if (!items.length) return "";
  return `<div class="sec">
    <div class="sec-head ${opts.danger?"danger":""}">${opts.icon?svg(opts.icon):""}${title}<span class="n">${items.length}</span></div>
    ${items.map(t => taskRow(t, opts)).join("")}
  </div>`;
}

function isEditing(){
  const a = document.activeElement;
  return a && $("#content").contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== "checkbox";
}

function renderMain(){
  const c = $("#content");
  const g = groupTasks();
  const t = today();
  const d = new Date();
  $("#listMenuBtn").hidden = !(S.view.startsWith("list:") && S.isAdmin);
  $("#composer").hidden = ["settings","users","done"].includes(S.view);

  if (S.view === "today"){
    $("#viewTitle").textContent = "Bugün";
    $("#viewSub").textContent = `${d.getDate()} ${AYLAR[d.getMonth()]} ${GUNLER[d.getDay()]}` +
      (g.late.length ? ` · ${g.late.length} gecikmiş` : "");
    const body =
      section("Gecikmiş", g.late, { danger:true, icon:"alert" }) +
      section("Bugün", g.today, { hideDate:true }) +
      (S.settings.includeUndated !== false ? section("Tarihsiz", g.undated, { toToday:true }) : "");
    c.innerHTML = body || empty("Bugün için her şey temiz.");
  }
  else if (S.view === "undated"){
    $("#viewTitle").textContent = "Tarihsiz";
    $("#viewSub").textContent = `${g.undated.length} görev`;
    c.innerHTML = section("Tarihsiz görevler", g.undated, { toToday:true }) || empty("Tarihsiz görev yok.");
  }
  else if (S.view === "soon"){
    $("#viewTitle").textContent = "Yaklaşan";
    $("#viewSub").textContent = `${g.soon.length} görev`;
    const by = {};
    g.soon.forEach(x => (by[x.date] = by[x.date] || []).push(x));
    c.innerHTML = Object.keys(by).sort().map(k =>
      section(dateLabel(k), by[k], { hideDate:true, icon:"cal" })).join("") || empty("Yaklaşan görev yok.");
  }
  else if (S.view === "done"){
    $("#viewTitle").textContent = "Tamamlanan";
    const done = visibleTasks().filter(x => x.done).sort((a,b) => (b.doneAt||0)-(a.doneAt||0)).slice(0,100);
    $("#viewSub").textContent = `son ${done.length} görev`;
    c.innerHTML = section("Tamamlanan", done) || empty("Henüz tamamlanan görev yok.");
  }
  else if (S.view.startsWith("list:")){
    const l = listById(S.view.slice(5));
    if (!l){ if (!S.lists.length) { c.innerHTML = ""; return; } S.view = "today"; return render(); } // listeler henüz yüklenmediyse bekle
    const q = S.search.trim().toLowerCase();
    const items = visibleTasks().filter(x => x.listId === l.id &&
      (!q || (x.title||"").toLowerCase().includes(q) || (x.note||"").toLowerCase().includes(q)));
    const open = items.filter(x => !x.done);
    $("#viewTitle").textContent = l.name;
    $("#viewSub").textContent = `${open.length} açık · ${items.length - open.length} tamamlandı`;
    const late = open.filter(x => x.date && x.date < t);
    const dated = open.filter(x => x.date && x.date >= t).sort((a,b) => a.date.localeCompare(b.date));
    const und = open.filter(x => !x.date);
    c.innerHTML = (
      section("Gecikmiş", late, { danger:true, icon:"alert" }) +
      section("Tarihli", dated) +
      section("Tarihsiz", und, { toToday:true }) +
      section("Tamamlanan", items.filter(x => x.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0)).slice(0,30))
    ) || empty("Bu listede görev yok.");
  }
  else if (S.view === "settings") { if (!isEditing()) renderSettings(); }
  else if (S.view === "users") { if (!isEditing()) renderUsers(); }

  renderBanner();
}

const empty = (msg) => `<div class="empty">${svg("check")}${esc(msg)}</div>`;

function renderBanner(){
  const b = $("#reminderBanner");
  const g = groupTasks();
  let seen = null;
  try { seen = localStorage.getItem("gt_banner"); } catch(e){}
  if (S.view !== "today" || seen === today() || (!g.late.length && !g.today.length)){ b.hidden = true; return; }
  b.hidden = false;
  const msg = !g.today.length ? `${g.late.length} gecikmiş görevin var.`
    : `Bugün ${g.today.length} görevin var${g.late.length ? `, ayrıca ${g.late.length} gecikmiş` : ""}.`;
  b.innerHTML = `${svg("clock")}<span>${msg}</span>
    <button id="bannerClose">Tamam</button>`;
  $("#bannerClose").onclick = () => { try { localStorage.setItem("gt_banner", today()); } catch(e){} b.hidden = true; };
}

/* ============ ayarlar ============ */
function acc(key, title, sub, body){
  const open = S.openAcc[key] ? "open" : "";
  return `<details class="acc" data-acc="${key}" ${open}>
    <summary><div><div class="acc-title">${title}</div>${sub?`<div class="acc-sub">${sub}</div>`:""}</div>
      <svg viewBox="0 0 24 24" class="chev">${ICONS.chev}</svg></summary>
    <div class="acc-body">${body}</div>
  </details>`;
}
const sw = (attrs, on) => `<label class="sw"><input type="checkbox" ${attrs} ${on?"checked":""}><span></span></label>`;
const TYPE_LABEL = { today: "Bugünün özeti", tomorrow: "Yarının görevleri" };

function renderSettings(){
  $("#viewTitle").textContent = "Ayarlar";
  $("#viewSub").textContent = "Bölümlere dokunarak aç / kapat";
  const s = S.settings;

  /* --- günlük hatırlatmalar --- */
  const remRows = s.reminders.map((r, i) => `
    <div class="rem">
      <div class="rem-top">
        <input type="text" class="rem-label" data-rem-label="${i}" value="${esc(r.label)}" placeholder="İsim">
        ${sw(`data-rem-on="${i}"`, r.enabled !== false)}
      </div>
      <div class="rem-bottom">
        <input type="time" data-rem-time="${i}" value="${esc(r.time)}">
        <select data-rem-type="${i}">
          <option value="today" ${r.type==="today"?"selected":""}>Bugünün özeti</option>
          <option value="tomorrow" ${r.type==="tomorrow"?"selected":""}>Yarının görevleri</option>
        </select>
        <button class="icon-btn" data-rem-del="${i}" aria-label="Sil">${svg("trash")}</button>
      </div>
    </div>`).join("");
  const remBody = `
    <p class="help">Her biri seçtiğin saatte bildirim gönderir. "Bugünün özeti" bugünkü, gecikmiş ve tarihsiz görevleri; "Yarının görevleri" ertesi günü listeler.</p>
    ${remRows || `<p class="help">Hiç hatırlatma yok.</p>`}
    <button class="btn btn-block" id="remAdd" style="margin-top:10px">+ Hatırlatma ekle</button>
    <div class="row">
      <div><div class="row-label">Tarihsiz görevleri de göster</div><div class="row-sub">Bugün ekranında ve sabah özetinde</div></div>
      ${sw(`id="setUndated"`, s.includeUndated !== false)}
    </div>`;
  const activeRem = s.reminders.filter(r => r.enabled !== false).map(r => r.time).join(", ") || "kapalı";

  /* --- ısrarlı --- */
  const nagCount = visibleTasks().filter(x => x.persistent && !x.done).length;
  const nagBody = `
    <p class="help">Görev ekranında "Israrlı" işaretlediğin görevler, tarihi gelmiş ve yapılmamışsa bu saatlerde tekrar tekrar bildirilir. Yapılana kadar her akşam devam eder.</p>
    <div class="row">
      <div class="row-label">Israrlı hatırlatma açık</div>
      ${sw(`id="nagOn"`, s.nagEnabled !== false)}
    </div>
    <div class="chips" id="nagChips">${[...s.nagTimes].sort().map(tm => `
      <span class="chip chip-time">${esc(tm)}<button data-nag-del="${esc(tm)}" aria-label="Kaldır">×</button></span>`).join("")}</div>
    <div class="inline-add">
      <input type="time" id="nagNew">
      <button class="btn" id="nagAdd">Saat ekle</button>
    </div>
    <p class="help" style="margin-top:10px">Şu an ${nagCount} ısrarlı görev var.</p>`;

  /* --- cihaz --- */
  const devBody = `
    <div class="row">
      <div><div class="row-label">Bu cihaza bildirim gönder</div><div class="row-sub" id="pushState">Durum kontrol ediliyor...</div></div>
      <button class="btn" id="pushBtn">İzin ver</button>
    </div>
    <div class="row">
      <div><div class="row-label">Bu cihazı test et</div><div class="row-sub">Cihazın bildirim gösterebildiğini kontrol eder</div></div>
      <button class="btn" id="localTest">Dene</button>
    </div>
    <p class="help">Telefonda Chrome menüsünden "Ana ekrana ekle" dersen bildirimler daha güvenilir gelir.</p>`;

  /* --- listeler --- */
  const listBody = (visibleLists().map(l => `
    <div class="row">
      <div class="row-label"><span class="dot" style="background:${esc(l.color||"#6c7cff")};display:inline-block;margin-right:8px"></span>${esc(l.name)}</div>
      ${sw(`data-lrem="${l.id}"`, l.reminder !== false)}
    </div>`).join("") || `<p class="help">Liste yok.</p>`) +
    `<p class="help">Kapalı listeler sabah ve gece özetlerinde yer almaz. Israrlı görevler her zaman bildirilir.</p>`;

  /* --- gruplar --- */
  const grpBody = (S.groups.map(g => `
    <div class="row">
      <input type="text" class="grow" data-grp-name="${g.id}" value="${esc(g.name)}">
      <button class="icon-btn" data-grp-del="${g.id}" aria-label="Grubu sil">${svg("trash")}</button>
    </div>`).join("") || `<p class="help">Grup yok.</p>`) +
    `<p class="help">Grubu silince içindeki listeler silinmez, grupsuz kalır. Listeyi düzenlemek için listeyi açıp sağ üstteki ⋮ simgesine dokun.</p>`;

  /* --- geçmiş --- */
  const log = (S.sent?.log || []).slice(-15).reverse();
  const histBody = `
    ${log.length ? log.map(e => {
      const dt = new Date(e.at);
      return `<div class="hist">
        <span class="hist-time">${dt.getDate()} ${AYLAR[dt.getMonth()].slice(0,3)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}</span>
        <span class="hist-label">${esc(e.label)}</span>
        <span class="hist-n">${e.devices ? e.devices + " cihaz" : "görev yok"}</span>
      </div>`; }).join("") : `<p class="help">Henüz kayıt yok.</p>`}
    <button class="btn btn-block" id="histReset" style="margin-top:12px">Bugünün gönderim kaydını sıfırla</button>
    <p class="help">Sıfırlarsan bugün saati geçmiş hatırlatmalar bir sonraki kontrolde (birkaç dakika içinde) tekrar gönderilir. Test için kullanabilirsin.</p>`;

  /* --- hesap --- */
  const accBody = `
    <div class="row"><div class="row-label">Kullanıcı adı</div><div style="color:var(--tx-2)">${esc(S.me.username)}</div></div>
    <div class="row">
      <div class="row-label">Görünen ad</div>
      <input type="text" id="myName" value="${esc(S.me.displayName || "")}">
    </div>
    <div class="row">
      <div class="row-label">Şifre</div>
      <button class="btn" id="changePass">Değiştir</button>
    </div>
    ${S.isAdmin ? `<div class="row">
      <div><div class="row-label">Kullanıcılar ve paylaşım</div><div class="row-sub">${S.users.length} kullanıcı</div></div>
      <button class="btn" id="goUsers">Aç</button>
    </div>` : ""}`;

  /* --- kayıtlı tekrar kuralları --- */
  const presets = s.repeatPresets || [];
  const presetRows = presets.map((p, i) => {
    const open = S.editPreset === p.id;
    const ok = isValidRule(p.rule);
    return `<div class="rem">
      <div class="rem-top">
        <input type="text" class="rem-label" data-pr-name="${i}" value="${esc(p.name)}" placeholder="İsim (ör. 3 ayda bir ödeme)">
        <button class="icon-btn" data-pr-del="${i}" aria-label="Sil">${svg("trash")}</button>
      </div>
      <div class="row-sub" style="margin:6px 0">${ok ? esc(describe(p.rule)) : "Gün seçilmemiş, görevlerde görünmez"}</div>
      <button class="btn" data-pr-edit="${i}">${open ? "Kapat" : "Kuralı düzenle"}</button>
      ${open ? `<div class="pr-editor" data-pr-box="${i}" style="margin-top:8px"></div>` : ""}
    </div>`; }).join("");
  const presetBody = `
    <p class="help">Burada kendi tekrar kurallarını hazırlarsın (ör. "3 ayda bir, ayın 10'u"). Kaydettiklerin görev ekranında Tekrar bölümünde tek dokunuşla seçilir.</p>
    ${presetRows || `<p class="help">Henüz kural yok.</p>`}
    <button class="btn btn-block" id="prAdd" style="margin-top:10px">+ Kural ekle</button>`;

  let html = "";
  if (S.isAdmin) {
    html += acc("hatirlatma", "Günlük hatırlatmalar", activeRem, remBody);
    html += acc("tekrar", "Tekrar kuralları", `${presets.length} kural`, presetBody);
    html += acc("israr", "Israrlı hatırlatma", s.nagEnabled !== false ? [...s.nagTimes].sort().join(", ") : "kapalı", nagBody);
  }
  html += acc("cihaz", "Bu cihazın bildirimleri", "", devBody);
  if (S.isAdmin) {
    html += acc("listeler", "Hangi listeler hatırlatılsın", "", listBody);
    html += acc("gruplar", "Gruplar", `${S.groups.length} grup`, grpBody);
    html += acc("gecmis", "Bildirim geçmişi", log[0] ? "son: " + esc(log[0].label) : "", histBody);
  }
  html += acc("hesap", "Hesap", "", accBody);
  $("#content").innerHTML = html;
  bindSettings();
}

function bindSettings(){
  const C = $("#content");
  C.querySelectorAll("details.acc").forEach(d => d.addEventListener("toggle", () => {
    S.openAcc[d.dataset.acc] = d.open;
    try { localStorage.setItem("gt_acc", JSON.stringify(S.openAcc)); } catch(e){}
  }));

  const rems = () => S.settings.reminders.map(r => ({ ...r }));
  C.querySelectorAll("[data-rem-label]").forEach(el => el.onchange = () => {
    const r = rems(); r[+el.dataset.remLabel].label = el.value.trim() || "Hatırlatma"; saveSettings({ reminders: r });
  });
  C.querySelectorAll("[data-rem-time]").forEach(el => el.onchange = () => {
    if (!el.value) return;
    const r = rems(); r[+el.dataset.remTime].time = el.value; saveSettings({ reminders: r });
  });
  C.querySelectorAll("[data-rem-type]").forEach(el => el.onchange = () => {
    const r = rems(); r[+el.dataset.remType].type = el.value; saveSettings({ reminders: r });
  });
  C.querySelectorAll("[data-rem-on]").forEach(el => el.onchange = () => {
    const r = rems(); r[+el.dataset.remOn].enabled = el.checked; saveSettings({ reminders: r });
  });
  C.querySelectorAll("[data-rem-del]").forEach(el => el.onclick = () => {
    const r = rems(); const x = r[+el.dataset.remDel];
    if (!confirm(`"${x.label}" silinsin mi?`)) return;
    r.splice(+el.dataset.remDel, 1); saveSettings({ reminders: r }); renderSettings();
  });
  $("#remAdd") && ($("#remAdd").onclick = () => {
    const r = rems();
    r.push({ id: "r" + Date.now().toString(36), label: "Yeni hatırlatma", time: "12:00", type: "today", enabled: true });
    saveSettings({ reminders: r }); renderSettings();
  });
  /* kayıtlı tekrar kuralları */
  const prs = () => S.settings.repeatPresets.map(p => ({ ...p, rule: JSON.parse(JSON.stringify(p.rule)) }));
  $("#prAdd") && ($("#prAdd").onclick = () => {
    const a = prs(), id = "p" + Date.now().toString(36);
    a.push({ id, name: "Yeni kural", rule: { type: "monthly", months: 3, days: [10], last: false } });
    S.editPreset = id; saveSettings({ repeatPresets: a }); renderSettings();
  });
  C.querySelectorAll("[data-pr-name]").forEach(el => el.onchange = () => {
    const a = prs(); a[+el.dataset.prName].name = el.value.trim() || "Kural"; saveSettings({ repeatPresets: a });
  });
  C.querySelectorAll("[data-pr-del]").forEach(el => el.onclick = () => {
    const a = prs(), x = a[+el.dataset.prDel];
    if (!confirm(`"${x.name}" silinsin mi? Bu kuralla kurulmuş görevler etkilenmez.`)) return;
    a.splice(+el.dataset.prDel, 1); saveSettings({ repeatPresets: a }); renderSettings();
  });
  C.querySelectorAll("[data-pr-edit]").forEach(el => el.onclick = () => {
    const id = S.settings.repeatPresets[+el.dataset.prEdit].id;
    S.editPreset = S.editPreset === id ? null : id; renderSettings();
  });
  C.querySelectorAll("[data-pr-box]").forEach(box => {
    const i = +box.dataset.prBox;
    const E = { rule: JSON.parse(JSON.stringify(S.settings.repeatPresets[i].rule)) };
    const paint = () => {
      box.innerHTML = repeatEditor(E.rule);
      bindRepeatEditor(box, E, () => null, () => {
        if (!E.rule) { toast("Kural boş olamaz"); E.rule = JSON.parse(JSON.stringify(S.settings.repeatPresets[i].rule)); paint(); return; }
        const a = prs(); a[i].rule = E.rule; saveSettings({ repeatPresets: a }); renderSettings();
      });
    };
    paint();
  });

  $("#setUndated") && ($("#setUndated").onchange = (e) => saveSettings({ includeUndated: e.target.checked }));

  $("#nagOn") && ($("#nagOn").onchange = (e) => saveSettings({ nagEnabled: e.target.checked }));
  C.querySelectorAll("[data-nag-del]").forEach(el => el.onclick = () => {
    saveSettings({ nagTimes: S.settings.nagTimes.filter(x => x !== el.dataset.nagDel) }); renderSettings();
  });
  $("#nagAdd") && ($("#nagAdd").onclick = () => {
    const v = $("#nagNew").value;
    if (!v) { toast("Önce saat seç"); return; }
    if (S.settings.nagTimes.includes(v)) { toast("Bu saat zaten var"); return; }
    saveSettings({ nagTimes: [...S.settings.nagTimes, v] }); renderSettings();
  });

  C.querySelectorAll("[data-lrem]").forEach(el => {
    el.onchange = () => updateDoc(doc(db, "lists", el.dataset.lrem), { reminder: el.checked });
  });
  C.querySelectorAll("[data-grp-name]").forEach(el => el.onchange = () => {
    const v = el.value.trim(); if (!v) return;
    updateDoc(doc(db, "groups", el.dataset.grpName), { name: v }).then(() => toast("Grup adı değişti"));
  });
  C.querySelectorAll("[data-grp-del]").forEach(el => el.onclick = async () => {
    const g = S.groups.find(x => x.id === el.dataset.grpDel);
    if (!g || !confirm(`"${g.name}" grubu silinsin mi? İçindeki listeler grupsuz kalır.`)) return;
    for (const l of S.lists.filter(l => l.groupId === g.id)) await updateDoc(doc(db, "lists", l.id), { groupId: null });
    await deleteDoc(doc(db, "groups", g.id));
    toast("Grup silindi");
  });

  $("#histReset") && ($("#histReset").onclick = async () => {
    if (!confirm("Bugünün gönderim kaydı sıfırlansın mı?")) return;
    const keys = { ...(S.sent?.keys || {}) };
    Object.keys(keys).forEach(k => { if (k.startsWith(today())) delete keys[k]; });
    await setDoc(doc(db, "system", "sent"), { keys, log: S.sent?.log || [] });
    toast("Sıfırlandı");
  });

  $("#myName").onchange = (e) => {
    const v = e.target.value.trim(); if (!v) return;
    updateDoc(doc(db, "users", S.uid), { displayName: v }).then(() => toast("Kaydedildi"));
  };
  $("#changePass").onclick = changePassword;
  if ($("#goUsers")) $("#goUsers").onclick = () => { S.view = "users"; render(); };
  $("#pushBtn").onclick = () => setupPush(true);
  $("#localTest").onclick = localTest;
  refreshPushState();
}

function renderUsers(){
  $("#viewTitle").textContent = "Kullanıcılar";
  $("#viewSub").textContent = "Listelere kişi ekle, görev ata";
  $("#content").innerHTML = `
    <button class="text-btn" id="backSettings" style="margin-top:8px">‹ Ayarlara dön</button>
    <div class="sub-head">Kullanıcılar</div>
    ${S.users.map(u => `<div class="row">
      <div><div class="row-label">${esc(u.displayName || u.username)}</div>
      <div class="row-sub">${esc(u.username)} · ${u.role === "admin" ? "yönetici" : "kullanıcı"}</div></div>
    </div>`).join("")}
    <div class="inline-add">
      <input id="nuUser" type="text" placeholder="kullanıcı adı" autocapitalize="none">
      <input id="nuPass" type="text" placeholder="geçici şifre">
      <button class="btn" id="nuAdd">Ekle</button>
    </div>
    <div class="row-sub" style="margin-top:6px">Yeni kullanıcı eklediğinde oturumun kapanmaz. Kişiyi aşağıdan listelere ekle.</div>

    <div class="sub-head">Liste üyeleri</div>
    ${visibleLists().map(l => `
      <div class="row" style="display:block">
        <div class="row-label"><span class="dot" style="background:${esc(l.color||"#6c7cff")};display:inline-block;margin-right:8px"></span>${esc(l.name)}</div>
        <div class="chips">${S.users.filter(u => u.id !== S.uid).map(u => `
          <button class="chip ${(l.members||[]).includes(u.id)?"sel":""}" data-member="${l.id}" data-uid="${u.id}">${esc(u.displayName||u.username)}</button>
        `).join("") || `<span class="row-sub">Başka kullanıcı yok</span>`}</div>
      </div>`).join("")}
  `;
  $("#backSettings").onclick = () => { S.view = "settings"; render(); };
  $("#nuAdd").onclick = createUser;
  $("#content").querySelectorAll("[data-member]").forEach(el => {
    el.onclick = async () => {
      const l = listById(el.dataset.member);
      const m = new Set(l.members || []);
      m.has(el.dataset.uid) ? m.delete(el.dataset.uid) : m.add(el.dataset.uid);
      await updateDoc(doc(db, "lists", l.id), { members: [...m] });
    };
  });
}

async function createUser(){
  const u = $("#nuUser").value.trim().toLowerCase();
  const p = $("#nuPass").value;
  if (!u || p.length < 6) { toast("Kullanıcı adı ve en az 6 karakter şifre gerekli"); return; }
  try {
    const second = initializeApp(firebaseConfig, "ikinci-" + Date.now());
    const cred = await createUserWithEmailAndPassword(getAuth(second), `${u}@${userDomain}`, p);
    await setDoc(doc(db, "users", cred.user.uid), {
      username: u, displayName: u, role: "user", createdAt: Date.now()
    });
    await signOut(getAuth(second));
    $("#nuUser").value = ""; $("#nuPass").value = "";
    toast("Kullanıcı eklendi");
  } catch (e) {
    toast(e.code === "auth/email-already-in-use" ? "Bu kullanıcı adı zaten var" : "Eklenemedi: " + e.code);
  }
}

function changePassword(){
  openDialog("Şifre değiştir", `
    <label class="field"><span>Mevcut şifre</span><input type="password" id="pwOld"></label>
    <label class="field"><span>Yeni şifre (en az 6 karakter)</span><input type="password" id="pwNew"></label>
  `, async () => {
    const oldP = $("#pwOld").value, newP = $("#pwNew").value;
    if (newP.length < 6) { toast("Yeni şifre en az 6 karakter olmalı"); return false; }
    try {
      await reauthenticateWithCredential(auth.currentUser,
        EmailAuthProvider.credential(auth.currentUser.email, oldP));
      await updatePassword(auth.currentUser, newP);
      toast("Şifre değiştirildi");
    } catch (e) { toast("Değiştirilemedi: " + e.code); return false; }
  });
}

/* ============ bildirim ============ */
let messaging = null, swReg = null, fgBound = false;
async function getReg(){
  if (swReg) return swReg;
  swReg = await navigator.serviceWorker.register(
    "firebase-messaging-sw.js?c=" + encodeURIComponent(JSON.stringify(firebaseConfig)));
  return swReg;
}
async function setupPush(ask = false){
  try {
    if (!(await isSupported())) { if (ask) toast("Bu tarayıcı bildirim desteklemiyor"); return; }
    if (!("Notification" in window)) return;
    if (Notification.permission === "default" && !ask) return;
    if (Notification.permission !== "granted"){
      const r = await Notification.requestPermission();
      if (r !== "granted") { refreshPushState(); return; }
    }
    const reg = await getReg();
    messaging = messaging || getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (token){
      await setDoc(doc(db, "tokens", token.slice(0, 120)), {
        token, uid: S.uid, updatedAt: Date.now(),
        agent: navigator.userAgent.slice(0, 120)
      });
      if (!fgBound) {
        fgBound = true;
        // Uygulama açıkken gelen bildirimi de sistem bildirimi olarak göster
        onMessage(messaging, (p) => {
          const n = p.notification || {};
          reg.showNotification(n.title || "Görevlerim", { body: n.body || "", icon: "icon-192.png" }).catch(() => {});
          toast(n.title || "Yeni bildirim");
        });
      }
      if (ask) toast("Bu cihaz bildirimlere eklendi");
    }
  } catch (e) { console.warn("push", e); if (ask) toast("Bildirim kurulamadı: " + (e.code || e.message)); }
  refreshPushState();
}
async function localTest(){
  if (!("Notification" in window) || Notification.permission !== "granted") {
    toast("Önce bildirim izni ver"); return;
  }
  try {
    const reg = await getReg();
    await reg.showNotification("Görevlerim · test", { body: "Bu cihaz bildirimleri gösterebiliyor.", icon: "icon-192.png" });
  } catch (e) { toast("Gösterilemedi: " + e.message); }
}
function refreshPushState(){
  const el = $("#pushState"); if (!el) return;
  const p = ("Notification" in window) ? Notification.permission : "yok";
  el.textContent = p === "granted" ? "Bu cihaz bildirim alıyor"
    : p === "denied" ? "Tarayıcı bildirimleri engelliyor (site ayarlarından aç)"
    : "Henüz izin verilmedi";
  const b = $("#pushBtn"); if (b) b.hidden = (p === "granted");
}

/* ============ görev paneli ============ */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function repeatEditor(rule){
  const type = rule?.type || "none";
  const opt = (v, l) => `<button class="chip ${type===v?"sel":""}" data-rt="${v}">${l}</button>`;
  let sub = "";
  if (type === "interval") {
    sub = `<div class="inline-add"><span class="row-sub" style="align-self:center">Kaç günde bir</span>
      <input type="number" id="rEvery" min="1" max="365" value="${esc(rule.every || 2)}" style="max-width:90px"></div>`;
  } else if (type === "weekly") {
    sub = `<div class="chips">${WEEK_ORDER.map(d =>
      `<button class="chip ${(rule.days||[]).includes(d)?"sel":""}" data-wd="${d}">${GUN_KISA[d]}</button>`).join("")}</div>`;
  } else if (type === "monthly") {
    let cells = "";
    for (let i = 1; i <= 31; i++) cells += `<button class="dcell ${(rule.days||[]).includes(i)?"sel":""}" data-md="${i}">${i}</button>`;
    const mm = rule.months || 1;
    const mOpt = (n, l) => `<button class="chip ${mm===n?"sel":""}" data-mm="${n}">${l}</button>`;
    sub = `<div class="chips" style="margin-top:10px">${mOpt(1,"Her ay")}${mOpt(2,"2 ayda bir")}${mOpt(3,"3 ayda bir")}${mOpt(6,"6 ayda bir")}</div>
      <p class="row-sub" style="margin:10px 0 6px">Ayın hangi günleri (birden fazla seçebilirsin)</p>
      <div class="daygrid">${cells}</div>
      <div class="chips"><button class="chip ${rule.last?"sel":""}" data-mlast="1">Ayın son günü</button></div>`;
  } else if (type === "yearly") {
    sub = `<p class="row-sub" style="margin-top:8px">Görevin tarihindeki gün ve ayda, her yıl tekrarlanır.</p>`;
  }
  return `<div class="chips" style="margin-top:6px">
      ${opt("none","Yok")}${opt("daily","Her gün")}${opt("interval","Her N günde")}
      ${opt("weekly","Haftalık")}${opt("monthly","Aylık")}${opt("yearly","Yıllık")}
    </div>${sub}`;
}

/* tekrar kuralı düzenleyicisinin tıklamalarını bağlar (görev panelinde ve ayarlarda ortak) */
function bindRepeatEditor(box, E, getDate, repaint){
  const ref = () => new Date((getDate() || today()) + "T12:00:00");
  box.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => {
    const v = b.dataset.rt;
    if (v === "none") E.rule = null;
    else if (v === "interval") E.rule = { type: v, every: 2 };
    else if (v === "weekly") E.rule = { type: v, days: [ref().getDay()] };
    else if (v === "monthly") E.rule = { type: v, days: [ref().getDate()], last: false };
    else E.rule = { type: v };
    repaint();
  });
  box.querySelectorAll("[data-wd]").forEach(b => b.onclick = () => {
    const d = +b.dataset.wd, s = new Set(E.rule.days || []);
    s.has(d) ? s.delete(d) : s.add(d); E.rule.days = [...s]; repaint();
  });
  box.querySelectorAll("[data-md]").forEach(b => b.onclick = () => {
    const d = +b.dataset.md, s = new Set(E.rule.days || []);
    s.has(d) ? s.delete(d) : s.add(d); E.rule.days = [...s].sort((a,b)=>a-b); repaint();
  });
  box.querySelectorAll("[data-mm]").forEach(b => b.onclick = () => { E.rule.months = +b.dataset.mm; repaint(); });
  const ml = box.querySelector("[data-mlast]");
  if (ml) ml.onclick = () => { E.rule.last = !E.rule.last; repaint(); };
  const ev = box.querySelector("#rEvery");
  if (ev) ev.onchange = () => { E.rule.every = Math.max(1, Math.min(365, parseInt(ev.value, 10) || 1)); repaint(); };
}

function openTask(id){
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  const sheet = $("#sheet");
  // panelde düzenlenen geçici kopya
  const E = { rule: t.repeat ? JSON.parse(JSON.stringify(t.repeat)) : null, persistent: !!t.persistent,
              steps: (t.steps || []).map(x => ({ ...x })),
              reminders: (t.reminders || []).filter(validRem).map(r => ({ ...r })) };

  $("#sheetTitle").textContent = t.fromRepeat ? "Tamamlanan tekrar" : "Görev";
  $("#sheetContent").innerHTML = `
    <label class="field"><span>Başlık</span><input type="text" id="tTitle" value="${esc(t.title)}"></label>
    ${t.fromRepeat ? ((t.steps || []).length ? `<div class="block"><div class="row-label">${svg("check")} Adımlar</div><div id="stepList"></div></div>` : "") : `
    <div class="block steps-block">
      <div id="stepList"></div>
      <button class="step-add" id="stepAdd" type="button">+ Adım ekle</button>
    </div>
    `}
    <details class="block rep-acc" id="noteAcc" ${t.note ? "open" : ""}>
      <summary><span class="row-label">${svg("note")} Not</span><span class="rep-sum" id="noteSum"></span><svg viewBox="0 0 24 24" class="chev">${ICONS.chev}</svg></summary>
      <textarea id="tNote" placeholder="Detay, adres, telefon...">${esc(t.note||"")}</textarea>
    </details>
    <div class="row">
      <div class="row-label">Tarih</div>
      <input type="date" id="tDate" value="${esc(t.date||"")}">
    </div>
    <div class="chips" style="margin:4px 0 10px">
      <button class="chip" data-quick="${today()}">Bugün</button>
      <button class="chip" data-quick="${addDays(today(),1)}">Yarın</button>
      <button class="chip" data-quick="${addDays(today(),7)}">+1 hafta</button>
      <button class="chip" data-quick="">Tarihsiz</button>
    </div>
    ${t.fromRepeat ? "" : `
    <details class="block rep-acc" id="remAcc">
      <summary><span class="row-label">${svg("bell")} Hatırlatma</span><span class="rep-sum" id="remSum">Yok</span><svg viewBox="0 0 24 24" class="chev">${ICONS.chev}</svg></summary>
      <div id="remList"></div>
      <div class="chips" style="margin-top:8px">
        <button class="chip" data-rq="h1">1 saat sonra</button>
        <button class="chip" data-rq="eve">Bu akşam 20:00</button>
        <button class="chip" data-rq="tom">Yarın 09:00</button>
        <button class="chip" data-rq="new">+ Tarih ve saat seç</button>
      </div>
    </details>
    <details class="block rep-acc" id="repAcc">
      <summary><span class="row-label">${svg("repeat")} Tekrar</span><span class="rep-sum" id="repSum">Yok</span><svg viewBox="0 0 24 24" class="chev">${ICONS.chev}</svg></summary>
      <div id="repeatBox"></div>
      <p class="row-sub" id="repeatInfo" style="margin-top:8px"></p>
    </details>
    <div class="row">
      <div><div class="row-label">${svg("bell")} Israrlı hatırlatma</div>
      <div class="row-sub">Yapılmazsa ${esc([...S.settings.nagTimes].sort().join(" · ") || "—")}</div></div>
      ${sw(`id="tNag"`, E.persistent)}
    </div>`}
    <div class="row">
      <div class="row-label">Liste</div>
      <select id="tList">${visibleLists().map(l =>
        `<option value="${l.id}" ${l.id===t.listId?"selected":""}>${esc(l.name)}</option>`).join("")}</select>
    </div>
    <div class="row">
      <div class="row-label">Atanan kişi</div>
      <select id="tUser"><option value="">—</option>${S.users.map(u =>
        `<option value="${u.id}" ${u.id===t.assignedTo?"selected":""}>${esc(u.displayName||u.username)}</option>`).join("")}</select>
    </div>
    <button class="btn btn-primary btn-block" id="tSave" style="margin-top:16px">Kaydet</button>
  `;
  sheet.hidden = false;

  /* adımlar: "+ Adım ekle" dedikçe altta yeni satır açılır; her değişiklik hemen kaydedilir,
     hepsi işaretlenince görev tamamlanır. Boş satırlar kaydedilmez. */
  const realSteps = () => E.steps.filter(x => (x.text || "").trim());
  const persistSteps = () => patchTask(t.id, { steps: realSteps() });
  const newStep = (text = "") => ({ id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, done: false });
  const paintSteps = (focusIdx = null, popFrom = null) => {
    const box = $("#stepList"); if (!box) return;
    const ro = !!t.fromRepeat;
    box.innerHTML = E.steps.map((x, i) => `
      <div class="step ${x.done ? "done" : ""} ${popFrom !== null && i >= popFrom ? "pop" : ""}">
        <button class="check ${x.done ? "on" : ""}" data-sck="${i}" ${ro ? "disabled" : ""} aria-label="Adımı işaretle"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></button>
        ${ro ? `<span class="step-t">${esc(x.text)}</span>`
             : `<input type="text" class="step-in" data-sin="${i}" value="${esc(x.text)}" placeholder="Adım">`}
        ${ro ? "" : `<button class="icon-btn" data-sdel="${i}" aria-label="Adımı sil">${svg("trash")}</button>`}
      </div>`).join("");
    box.querySelectorAll("[data-sck]").forEach(b => b.onclick = async () => {
      const x = E.steps[+b.dataset.sck]; if (!(x.text || "").trim()) return;
      x.done = !x.done; paintSteps(); await persistSteps();
      const real = realSteps();
      if (real.length && real.every(y => y.done)) {
        const cur = S.tasks.find(z => z.id === t.id) || t;
        await toggleDone({ ...cur, steps: real });
        sheet.hidden = true; toast("Tüm adımlar bitti, görev tamamlandı");
      }
    });
    box.querySelectorAll("[data-sdel]").forEach(b => b.onclick = async () => {
      E.steps.splice(+b.dataset.sdel, 1); paintSteps(); await persistSteps();
    });
    box.querySelectorAll("[data-sin]").forEach(inp => {
      const i = +inp.dataset.sin;
      inp.addEventListener("change", () => { E.steps[i].text = inp.value.trim(); persistSteps(); });
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const v = inp.value.trim(); if (!v) return;
        E.steps[i].text = v;
        if (!E.steps[i + 1] || (E.steps[i + 1].text || "").trim()) E.steps.splice(i + 1, 0, newStep());
        paintSteps(i + 1, i + 1); persistSteps();
      });
      inp.addEventListener("paste", (e) => {   // alt alta yapıştırılırsa her satır ayrı adım olur
        const txt = (e.clipboardData || window.clipboardData).getData("text");
        if (!/\r?\n/.test(txt.trim())) return;
        e.preventDefault();
        const lines = txt.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        E.steps[i].text = lines[0];
        E.steps.splice(i + 1, 0, ...lines.slice(1).map(x => newStep(x)));
        paintSteps(null, i + 1); persistSteps();
      });
    });
    if (focusIdx !== null) { const f = box.querySelector(`[data-sin="${focusIdx}"]`); if (f) f.focus(); }
  };
  if ($("#stepAdd")) $("#stepAdd").onclick = () => {
    const last = E.steps[E.steps.length - 1];
    if (last && !(last.text || "").trim()) { const f = $("#stepList").querySelector(`[data-sin="${E.steps.length - 1}"]`); if (f) f.focus(); return; }
    E.steps.push(newStep());
    paintSteps(E.steps.length - 1, E.steps.length - 1);
  };
  if (t.fromRepeat) { if ($("#stepAdd")) $("#stepAdd").hidden = true; }
  paintSteps();

  /* not: açılır kapanır; kapalıyken yanında ilk satırı görünür */
  const sumNote = () => {
    const v = $("#tNote").value.trim().split("\n")[0];
    $("#noteSum").textContent = v || "Yok";
  };
  sumNote();
  $("#tNote").addEventListener("input", sumNote);

  /* hatırlatmalar: Kaydet'e basınca kaydedilir */
  const sumRems = () => {
    const el = $("#remSum"); if (!el) return;
    const v = E.reminders.filter(validRem);
    el.textContent = !v.length ? "Yok" : v.length === 1 ? remLabel(v[0]) : `${v.length} hatırlatma`;
  };
  const paintRems = () => {
    const box = $("#remList"); if (!box) return;
    box.innerHTML = E.reminders.map((r, i) => `
      <div class="remrow">
        <input type="date" data-rd="${i}" value="${esc(r.date || "")}">
        <input type="time" data-rh="${i}" value="${esc(r.time || "")}">
        <button class="icon-btn" data-rdel="${i}" aria-label="Hatırlatmayı sil">${svg("trash")}</button>
      </div>`).join("");
    box.querySelectorAll("[data-rd]").forEach(el => el.onchange = () => { E.reminders[+el.dataset.rd].date = el.value; sumRems(); });
    box.querySelectorAll("[data-rh]").forEach(el => el.onchange = () => { E.reminders[+el.dataset.rh].time = el.value; sumRems(); });
    box.querySelectorAll("[data-rdel]").forEach(el => el.onclick = () => { E.reminders.splice(+el.dataset.rdel, 1); paintRems(); });
    sumRems();
  };
  const addRem = (kind) => {
    const n = new Date();
    let d = ymd(n), tm = "09:00";
    if (kind === "h1") { const x = new Date(Date.now() + 3600000); d = ymd(x); tm = `${pad(x.getHours())}:${pad(x.getMinutes())}`; }
    else if (kind === "eve") { tm = "20:00"; if (nowStr() >= `${d}T20:00`) d = addDays(d, 1); }
    else if (kind === "tom") { d = addDays(d, 1); }
    else { d = $("#tDate").value || d; }
    E.reminders.push({ id: newRemId(), date: d, time: tm });
    paintRems();
  };
  paintRems();
  sheet.querySelectorAll("[data-rq]").forEach(b => b.onclick = () => addRem(b.dataset.rq));

  const paintRepeat = () => {
    const box = $("#repeatBox"); if (!box) return;
    const presets = (S.settings.repeatPresets || []).filter(p => p && isValidRule(p.rule));
    const presetRow = presets.length ? `<p class="row-sub" style="margin:6px 0 2px">Kayıtlı kurallar</p><div class="chips">${presets.map(p =>
      `<button class="chip ${E.rule && JSON.stringify(E.rule)===JSON.stringify(p.rule)?"sel":""}" data-preset="${esc(p.id)}">${esc(p.name)}</button>`).join("")}</div>` : "";
    box.innerHTML = presetRow + repeatEditor(E.rule);
    box.querySelectorAll("[data-preset]").forEach(b => b.onclick = () => {
      const p = presets.find(x => x.id === b.dataset.preset);
      if (p) { E.rule = JSON.parse(JSON.stringify(p.rule)); paintRepeat(); }
    });
    const dateVal = $("#tDate").value || null;
    let info = "";
    $("#repSum").textContent = "Yok";
    if (E.rule && isValidRule(E.rule)) {
      const first = dateVal || firstOccurrence(E.rule, today(), today());
      $("#repSum").textContent = describe(E.rule, first);
      const next = nextOccurrence(E.rule, first, first);
      info = `${describe(E.rule, first)} · ${dateVal ? "sıradaki" : "ilk"}: ${dateLabel(first)}${next ? ", sonra " + dateLabel(next) : ""}`;
    } else if (E.rule) {
      $("#repSum").textContent = "Gün seç";
      info = "Gün seçmeden tekrar kaydedilmez.";
    }
    $("#repeatInfo").textContent = info;

    bindRepeatEditor(box, E, () => $("#tDate").value || null, paintRepeat);
  };
  paintRepeat();
  $("#tDate").addEventListener("change", paintRepeat);
  if ($("#tNag")) $("#tNag").onchange = (e) => { E.persistent = e.target.checked; };

  sheet.querySelectorAll("[data-quick]").forEach(b => b.onclick = () => { $("#tDate").value = b.dataset.quick; paintRepeat(); });
  $("#sheetDelete").onclick = async () => {
    if (!confirm(isValidRule(t.repeat) ? "Tekrarlayan görev tamamen silinsin mi?" : "Görev silinsin mi?")) return;
    await removeTask(t.id); sheet.hidden = true; toast("Silindi");
  };
  $("#tSave").onclick = async () => {
    const title = $("#tTitle").value.trim();
    if (!title) { toast("Başlık boş olamaz"); return; }
    let date = $("#tDate").value || null;
    let repeat = null;
    if (!t.fromRepeat && E.rule) {
      if (!isValidRule(E.rule)) { $("#repAcc").open = true; toast("Tekrar için gün seç ya da \"Yok\" de"); return; }
      repeat = E.rule;
      if (!date) date = firstOccurrence(repeat, today(), today());
    }
    const reminders = t.fromRepeat ? null : E.reminders.filter(validRem)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    const data = {
      title, note: $("#tNote").value.trim(), date,
      listId: $("#tList").value, assignedTo: $("#tUser").value || null
    };
    if (!t.fromRepeat) { data.repeat = repeat; data.persistent = E.persistent; data.reminders = reminders; data.remDue = calcRemDue(reminders); }
    await patchTask(t.id, data);
    sheet.hidden = true; toast("Kaydedildi");
  };
}

/* ============ diyalog ============ */
let dialogOk = null;
function openDialog(title, html, onOk){
  $("#dialogTitle").textContent = title;
  $("#dialogContent").innerHTML = html;
  $("#dialog").hidden = false;
  dialogOk = onOk;
}
$("#dialogOk").onclick = async () => {
  if (dialogOk && (await dialogOk()) === false) return;
  $("#dialog").hidden = true;
};
document.querySelectorAll("[data-close]").forEach(el => {
  el.onclick = () => { el.closest(".sheet").hidden = true; };
});

function listDialog(existing){
  const l = existing ? { ...existing } : { name:"", color:COLORS[0], groupId:"", reminder:true };
  openDialog(existing ? "Listeyi düzenle" : "Yeni liste", `
    <label class="field"><span>Liste adı</span><input type="text" id="lName" value="${esc(l.name)}" placeholder="Örn. Serik"></label>
    <label class="field"><span>Grup</span>
      <select id="lGroup"><option value="">Grupsuz</option>${S.groups.map(g =>
        `<option value="${g.id}" ${g.id===l.groupId?"selected":""}>${esc(g.name)}</option>`).join("")}</select>
    </label>
    <span class="row-sub">Renk</span>
    <div class="chips" id="lColors">${COLORS.map(c =>
      `<button class="chip ${c===l.color?"sel":""}" data-color="${c}" style="padding:10px 14px">
        <span class="dot" style="background:${c};display:inline-block"></span></button>`).join("")}</div>
    ${existing ? `<button class="btn btn-block" id="lDelete" style="margin-top:18px;color:var(--dang)">Listeyi sil</button>` : ""}
  `, async () => {
    const name = $("#lName").value.trim();
    if (!name) { toast("İsim gerekli"); return false; }
    const data = { name, color: l.color, groupId: $("#lGroup").value || null, reminder: l.reminder !== false };
    if (existing) await updateDoc(doc(db, "lists", existing.id), data);
    else await addDoc(collection(db, "lists"), { ...data, ownerUid: S.uid, members: [], order: S.lists.length, createdAt: Date.now() });
  });
  $("#lColors").querySelectorAll("[data-color]").forEach(b => b.onclick = () => {
    l.color = b.dataset.color;
    $("#lColors").querySelectorAll(".chip").forEach(x => x.classList.remove("sel"));
    b.classList.add("sel");
  });
  if ($("#lDelete")) $("#lDelete").onclick = async () => {
    const n = S.tasks.filter(t => t.listId === existing.id).length;
    if (!confirm(`"${existing.name}" listesi ve içindeki ${n} görev silinsin mi?`)) return;
    for (const t of S.tasks.filter(t => t.listId === existing.id)) await removeTask(t.id);
    await deleteDoc(doc(db, "lists", existing.id));
    $("#dialog").hidden = true;
    if (S.view === "list:" + existing.id) S.view = "today";
    toast("Liste silindi"); render();
  };
}

function groupDialog(){
  openDialog("Yeni grup", `
    <label class="field"><span>Grup adı</span><input type="text" id="gName" placeholder="Örn. Domino's Pizza"></label>
    <span class="row-sub">Gruplar listeleri bir arada tutar. Ayarlar > Gruplar'dan yeniden adlandırabilirsin.</span>
  `, async () => {
    const name = $("#gName").value.trim();
    if (!name) return false;
    await addDoc(collection(db, "groups"), { name, order: S.groups.length, createdAt: Date.now() });
  });
}

/* ============ olaylar ============ */
$("#openSide").onclick = () => { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); };
const closeSide = () => { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); };
$("#closeSide").onclick = closeSide;
$("#scrim").onclick = closeSide;

$("#sidebar").addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]");
  if (v){ S.view = v.dataset.view; S.search = ""; $("#searchBar").hidden = true; closeSide(); render(); return; }
  const g = e.target.closest("[data-toggle]");
  if (g){
    const id = g.dataset.toggle;
    S.collapsed[id] = !S.collapsed[id];
    try { localStorage.setItem("gt_collapsed", JSON.stringify(S.collapsed)); } catch(e){}
    renderSidebar();
  }
});
$("#settingsBtn").onclick = () => { S.view = "settings"; closeSide(); render(); };
$("#addListBtn").onclick = () => listDialog(null);
$("#addGroupBtn").onclick = groupDialog;
$("#listMenuBtn").onclick = () => { const l = listById(S.view.slice(5)); if (l) listDialog(l); };

$("#content").addEventListener("click", (e) => {
  const c = e.target.closest("[data-check]");
  if (c){ const t = S.tasks.find(x => x.id === c.dataset.check); if (t) toggleDone(t); return; }
  const u = e.target.closest("[data-totoday]");
  if (u){ patchTask(u.dataset.totoday, { date: today() }); toast("Bugüne alındı"); return; }
  const t = e.target.closest("[data-task]");
  if (t) openTask(t.dataset.task);
});

/* görevi sürükleyip soldaki listeye bırakma (bilgisayar) */
let dragTaskId = null;
const clearDrag = () => {
  dragTaskId = null;
  document.querySelectorAll(".task.dragging, .li.drop-over").forEach(el => el.classList.remove("dragging", "drop-over"));
};
$("#content").addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-task]"); if (!row) return;
  dragTaskId = row.dataset.task;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragTaskId);
  row.classList.add("dragging");
});
$("#content").addEventListener("dragend", clearDrag);
const treeEl = $("#listTree");
treeEl.addEventListener("dragover", (e) => {
  if (!dragTaskId) return;
  const head = e.target.closest("[data-toggle]");
  if (head) {   // kapalı grubun üstüne gelince aç
    const g = head.closest(".group");
    if (g && g.classList.contains("collapsed")) { g.classList.remove("collapsed"); S.collapsed[head.dataset.toggle] = false; }
    return;
  }
  const li = e.target.closest(".li");
  treeEl.querySelectorAll(".li.drop-over").forEach(el => { if (el !== li) el.classList.remove("drop-over"); });
  if (!li || !li.dataset.view.startsWith("list:")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  li.classList.add("drop-over");
});
treeEl.addEventListener("dragleave", (e) => {
  const li = e.target.closest(".li");
  if (li && !li.contains(e.relatedTarget)) li.classList.remove("drop-over");
});
treeEl.addEventListener("drop", (e) => {
  const li = e.target.closest(".li");
  if (!dragTaskId || !li || !li.dataset.view.startsWith("list:")) return;
  e.preventDefault();
  const lid = li.dataset.view.slice(5), t = S.tasks.find(x => x.id === dragTaskId), l = listById(lid);
  clearDrag();
  if (!t || !l) return;
  if (t.listId === lid) { toast("Görev zaten bu listede"); return; }
  patchTask(t.id, { listId: lid }).then(() => toast(`Taşındı · ${l.name}`)).catch(err => toast("Taşınamadı: " + (err.code || "")));
});

$("#composerAdd").onclick = submitComposer;
$("#composerInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitComposer(); });
async function submitComposer(){
  const inp = $("#composerInput");
  const v = inp.value.trim();
  if (!v) { inp.focus(); return; }
  let date = S.composerDate;
  if (!date && S.view === "today") date = today();
  if (!date && S.view === "soon") date = addDays(today(), 1);
  await addTask(v, date, S.view.startsWith("list:") ? S.view.slice(5) : null);
  inp.value = "";
  setComposerDate(null);
}
$("#composerDate").onclick = () => {
  openDialog("Tarih seç", `
    <div class="chips">
      <button class="chip" data-cd="${today()}">Bugün</button>
      <button class="chip" data-cd="${addDays(today(),1)}">Yarın</button>
      <button class="chip" data-cd="${addDays(today(),7)}">+1 hafta</button>
      <button class="chip" data-cd="">Tarihsiz</button>
    </div>
    <label class="field" style="margin-top:14px"><span>Başka bir gün</span><input type="date" id="cdDate" value="${esc(S.composerDate||"")}"></label>
  `, async () => { setComposerDate($("#cdDate").value || null); });
  $("#dialogContent").querySelectorAll("[data-cd]").forEach(b => b.onclick = () => {
    setComposerDate(b.dataset.cd || null); $("#dialog").hidden = true;
  });
};
function setComposerDate(d){
  S.composerDate = d;
  $("#composerDateLabel").textContent = d ? dateLabel(d) : "Tarihsiz";
  $("#composerDate").classList.toggle("set", !!d);
}

$("#searchBtn").onclick = () => {
  const b = $("#searchBar"); b.hidden = !b.hidden;
  if (!b.hidden) $("#searchInput").focus(); else { S.search = ""; render(); }
};
$("#searchClose").onclick = () => { $("#searchBar").hidden = true; S.search = ""; $("#searchInput").value = ""; render(); };
$("#searchInput").addEventListener("input", (e) => { S.search = e.target.value; render(); });

// gün değişimini yakala (sayfa açık kalırsa)
let lastDay = today();
setInterval(() => { if (today() !== lastDay){ lastDay = today(); render(); } }, 60000);
