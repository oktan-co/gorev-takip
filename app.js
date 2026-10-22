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

/* ============ kurulum ============ */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLORS = ["#6c7cff","#1d9e75","#e5a33a","#d85a30","#d4537e","#7f77dd","#378add","#639922","#b4b2a9"];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

const ICONS = {
  sun:'<path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  up:'<path d="M7 17 17 7M9 7h8v8"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  note:'<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h6"/>'
};
const svg = (k, cls="ic") => `<svg viewBox="0 0 24 24" class="${cls}">${ICONS[k]}</svg>`;

/* ============ tarih ============ */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
function addDays(s, n){ const d = new Date(s + "T12:00:00"); d.setDate(d.getDate()+n); return ymd(d); }
function dayDiff(a, b){
  return Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00")) / 86400000);
}
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
  settings:{ reminderEnabled:true, reminderTime:"11:00", includeUndated:true },
  view:"today", search:"", composerDate:null, collapsed:{}, unsubs:[]
};
try { S.collapsed = JSON.parse(localStorage.getItem("gt_collapsed") || "{}"); } catch(e){}

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
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
  $("#sideName").textContent = S.me.displayName || S.me.username;
  $("#sideRole").textContent = S.isAdmin ? "Yönetici" : "Kullanıcı";
  $("#sideAvatar").textContent = (S.me.displayName || S.me.username || "?").charAt(0).toUpperCase();

  subscribe();
  setupPush();
});

/* ============ veri ============ */
function subscribe(){
  const sub = (path, fn) => S.unsubs.push(onSnapshot(collection(db, path), (snap) => {
    fn(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    render();
  }, (e) => console.warn(path, e.code)));

  sub("groups", v => S.groups = v.sort((a,b) => (a.order||0)-(b.order||0)));
  sub("lists",  v => S.lists  = v.sort((a,b) => (a.order||0)-(b.order||0)));
  sub("tasks",  v => S.tasks  = v);
  sub("users",  v => S.users  = v);

  S.unsubs.push(onSnapshot(doc(db, "settings", "app"), (d) => {
    if (d.exists()) S.settings = { ...S.settings, ...d.data() };
    render();
  }, () => {}));
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

/* ============ görev işlemleri ============ */
async function addTask(title, dateStr, listId){
  const lid = listId || firstWritableList();
  if (!lid) { toast("Önce bir liste oluştur"); return; }
  await addDoc(collection(db, "tasks"), {
    title: title.trim(), note: "", listId: lid, date: dateStr || null,
    done: false, doneAt: null, assignedTo: null,
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
async function toggleDone(t){
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
        <svg viewBox="0 0 24 24" class="chev"><path d="m6 9 6 6 6-6"/></svg>
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

function taskRow(t, opts = {}){
  const l = listById(t.listId);
  const late = t.date && t.date < today() && !t.done;
  const meta = [];
  if (late) meta.push(`<span class="late">${svg("alert")}${lateLabel(t.date)}</span>`);
  else if (t.date && !opts.hideDate) meta.push(`<span>${svg("cal")}${dateLabel(t.date)}</span>`);
  if (t.note) meta.push(`<span>${svg("note")}Not</span>`);
  if (t.assignedTo) meta.push(`<span>${svg("users")}${esc(userName(t.assignedTo))}</span>`);
  if (l) meta.push(`<span class="tag"><span class="d" style="background:${esc(l.color||"#6c7cff")}"></span>${esc(l.name)}</span>`);
  return `<div class="task ${t.done?"done":""}" data-task="${t.id}">
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
    if (!l){ S.view = "today"; return render(); }
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
  else if (S.view === "settings") renderSettings();
  else if (S.view === "users") renderUsers();

  renderBanner();
}

const empty = (msg) => `<div class="empty">${svg("check")}${esc(msg)}</div>`;

function renderBanner(){
  const b = $("#reminderBanner");
  const g = groupTasks();
  const seen = localStorage.getItem("gt_banner") === today();
  if (S.view !== "today" || seen || (!g.late.length && !g.today.length)){ b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `${svg("clock")}<span>Bugün ${g.today.length} görevin var${g.late.length?`, ${g.late.length} tanesi gecikmiş`:""}.</span>
    <button id="bannerClose">Tamam</button>`;
  $("#bannerClose").onclick = () => { localStorage.setItem("gt_banner", today()); b.hidden = true; };
}

/* ============ ayarlar ============ */
function renderSettings(){
  $("#viewTitle").textContent = "Ayarlar";
  $("#viewSub").textContent = "";
  const s = S.settings;
  $("#content").innerHTML = `
    <div class="sub-head">Sabah hatırlatması</div>
    <div class="row">
      <div><div class="row-label">Hatırlatma açık</div><div class="row-sub">Her gün belirlenen saatte bildirim</div></div>
      <label class="sw"><input type="checkbox" id="setEnabled" ${s.reminderEnabled!==false?"checked":""}><span></span></label>
    </div>
    <div class="row">
      <div><div class="row-label">Saat</div><div class="row-sub">Bildirim bu saatte gönderilir</div></div>
      <input type="time" id="setTime" value="${esc(s.reminderTime||"11:00")}">
    </div>
    <div class="row">
      <div><div class="row-label">Tarihsiz görevleri de ekle</div><div class="row-sub">Bugün ekranında ve hatırlatmada görünür</div></div>
      <label class="sw"><input type="checkbox" id="setUndated" ${s.includeUndated!==false?"checked":""}><span></span></label>
    </div>
    <div class="row">
      <div><div class="row-label">Bu cihaza bildirim gönder</div><div class="row-sub" id="pushState">Durum kontrol ediliyor...</div></div>
      <button class="btn" id="pushBtn">İzin ver</button>
    </div>

    <div class="sub-head">Hangi listeler hatırlatılsın</div>
    <div id="listReminders"></div>

    <div class="sub-head">Hesap</div>
    <div class="row"><div class="row-label">Kullanıcı adı</div><div style="color:var(--tx-2)">${esc(S.me.username)}</div></div>
    <div class="row">
      <div class="row-label">Şifre değiştir</div>
      <button class="btn" id="changePass">Değiştir</button>
    </div>
    ${S.isAdmin ? `<div class="row">
      <div><div class="row-label">Kullanıcılar ve paylaşım</div><div class="row-sub">${S.users.length} kullanıcı</div></div>
      <button class="btn" id="goUsers">Aç</button>
    </div>` : ""}
  `;

  $("#listReminders").innerHTML = visibleLists().map(l => `
    <div class="row">
      <div class="row-label"><span class="dot" style="background:${esc(l.color||"#6c7cff")};display:inline-block;margin-right:8px"></span>${esc(l.name)}</div>
      <label class="sw"><input type="checkbox" data-rem="${l.id}" ${l.reminder!==false?"checked":""}><span></span></label>
    </div>`).join("") || `<div style="color:var(--tx-3);font-size:13px;padding:8px 0">Liste yok.</div>`;

  const save = (data) => setDoc(doc(db, "settings", "app"), { ...S.settings, ...data }, { merge:true });
  $("#setEnabled").onchange = (e) => save({ reminderEnabled: e.target.checked });
  $("#setTime").onchange = (e) => save({ reminderTime: e.target.value || "11:00" });
  $("#setUndated").onchange = (e) => save({ includeUndated: e.target.checked });
  $("#content").querySelectorAll("[data-rem]").forEach(el => {
    el.onchange = () => updateDoc(doc(db, "lists", el.dataset.rem), { reminder: el.checked });
  });
  $("#changePass").onclick = changePassword;
  if ($("#goUsers")) $("#goUsers").onclick = () => { S.view = "users"; render(); };
  $("#pushBtn").onclick = () => setupPush(true);
  refreshPushState();
}

function renderUsers(){
  $("#viewTitle").textContent = "Kullanıcılar";
  $("#viewSub").textContent = "Listelere kişi ekle, görev ata";
  $("#content").innerHTML = `
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
let messaging = null;
async function setupPush(ask = false){
  try {
    if (!(await isSupported())) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default" && !ask) return;
    if (Notification.permission !== "granted"){
      const r = await Notification.requestPermission();
      if (r !== "granted") { refreshPushState(); return; }
    }
    const reg = await navigator.serviceWorker.register(
      "firebase-messaging-sw.js?c=" + encodeURIComponent(JSON.stringify(firebaseConfig)));
    messaging = messaging || getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (token){
      await setDoc(doc(db, "tokens", token.slice(0, 120)), {
        token, uid: S.uid, updatedAt: Date.now(),
        agent: navigator.userAgent.slice(0, 120)
      });
      onMessage(messaging, (p) => toast(p.notification?.title || "Yeni bildirim"));
      if (ask) toast("Bu cihaz bildirimlere eklendi");
    }
  } catch (e) { console.warn("push", e); if (ask) toast("Bildirim kurulamadı: " + (e.code || e.message)); }
  refreshPushState();
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
function openTask(id){
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  const sheet = $("#sheet");
  $("#sheetTitle").textContent = "Görev";
  $("#sheetContent").innerHTML = `
    <label class="field"><span>Başlık</span><input type="text" id="tTitle" value="${esc(t.title)}"></label>
    <label class="field"><span>Not</span><textarea id="tNote" placeholder="Detay, adres, telefon...">${esc(t.note||"")}</textarea></label>
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
  sheet.querySelectorAll("[data-quick]").forEach(b => b.onclick = () => { $("#tDate").value = b.dataset.quick; });
  $("#sheetDelete").onclick = async () => {
    if (!confirm("Görev silinsin mi?")) return;
    await removeTask(t.id); sheet.hidden = true; toast("Silindi");
  };
  $("#tSave").onclick = async () => {
    const title = $("#tTitle").value.trim();
    if (!title) { toast("Başlık boş olamaz"); return; }
    await patchTask(t.id, {
      title, note: $("#tNote").value.trim(), date: $("#tDate").value || null,
      listId: $("#tList").value, assignedTo: $("#tUser").value || null
    });
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
  const l = existing || { name:"", color:COLORS[0], groupId:"", reminder:true };
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
    <span class="row-sub">Gruplar listeleri bir arada tutar. Sonradan yeniden adlandırabilirsin.</span>
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
    localStorage.setItem("gt_collapsed", JSON.stringify(S.collapsed));
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
