// Hatırlatma planlaması: veritabanına dokunmaz, test edilebilir.

export const DEFAULT_SETTINGS = {
  reminders: [
    { id: "sabah", label: "Sabah özeti", time: "09:00", type: "today", enabled: true },
    { id: "gece",  label: "Gece özeti",  time: "23:59", type: "tomorrow", enabled: true }
  ],
  includeUndated: true,
  nagEnabled: true,
  nagTimes: ["21:00", "22:00", "23:00", "23:30", "23:40", "23:50"]
};

export function normSettings(s = {}) {
  const o = { ...DEFAULT_SETTINGS, ...s };
  if (!Array.isArray(o.reminders)) o.reminders = DEFAULT_SETTINGS.reminders.map(r => ({ ...r }));
  if (!Array.isArray(o.nagTimes)) o.nagTimes = [...DEFAULT_SETTINGS.nagTimes];
  return o;
}

const parse = (s) => new Date(s + "T12:00:00Z");
const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

// İstanbul saatine göre şu an
export function istanbulNow(date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute),
           hhmm: `${p.hour}:${p.minute}` };
}

// Bir saat dilimi (ör. 23:59) için, şu ana göre "zamanı gelmiş" olan günleri döner.
// Gece yarısını geçen gecikmeleri yakalamak için dünü de kontrol eder.
export function dueSlots(time, now, windowMin) {
  const out = [];
  const slot = toMin(time);
  const dToday = now.min - slot;
  if (dToday >= 0 && dToday < windowMin) out.push({ date: now.date, late: dToday });
  const dYest = now.min + 1440 - slot;
  if (dYest >= 0 && dYest < windowMin) out.push({ date: addDays(now.date, -1), late: dYest });
  return out;
}

export const TASK_REM_WINDOW = 90; // görev hatırlatması en fazla 90 dk gecikmeyle yine gönderilir
export const SUMMARY_WINDOW = 90;  // özet en fazla 90 dk gecikmeyle yine gönderilir
export const NAG_WINDOW = 30;      // ısrarlı hatırlatma en fazla 30 dk gecikmeyle

// Görevlere tek tek konmuş hatırlatmalar (tarih + saat). Zamanı gelmiş olanları tek iş olarak döner.
export function planTaskReminders(tasks, now, sentKeys = {}) {
  const items = [];
  for (const t of tasks) {
    if (t.done) continue;
    for (const r of t.reminders || []) {
      if (!r || !r.date || !r.time) continue;
      const diff = dayDiff(r.date, now.date) * 1440 + now.min - toMin(r.time);
      if (diff < 0 || diff >= TASK_REM_WINDOW) continue;
      const key = `${r.date}_trem_${t.id}_${r.id}_${r.time}`;
      if (sentKeys[key]) continue;
      items.push({ taskId: t.id, key });
    }
  }
  if (!items.length) return [];
  return [{ kind: "taskrem", label: "Görev hatırlatması", date: now.date,
            items, keys: items.map(i => i.key) }];
}

// Bir görevde "şu andan sonraki" ilk hatırlatma (yoksa null). remDue alanı için.
export function nextRemDue(reminders, nowStr) {
  const c = (reminders || []).filter(r => r && r.date && r.time).map(r => `${r.date}T${r.time}`)
    .filter(x => x > nowStr).sort();
  return c[0] || null;
}

// Gönderilecek işleri belirle
export function planJobs(settings, now, sentKeys = {}, test = false) {
  const s = normSettings(settings);
  if (test) return [{ kind: "today", label: "Test · " + (s.reminders.find(r => r.type === "today")?.label || "Bugünün özeti"),
                      date: now.date, keys: [] }];
  const jobs = [];
  for (const r of s.reminders) {
    if (r.enabled === false || !r.time) continue;
    for (const slot of dueSlots(r.time, now, SUMMARY_WINDOW)) {
      const key = `${slot.date}_rem_${r.id}_${r.time}`;
      if (sentKeys[key]) continue;
      jobs.push({ kind: r.type === "tomorrow" ? "tomorrow" : "today", label: r.label || "Hatırlatma",
                  date: slot.date, keys: [key] });
    }
  }
  if (s.nagEnabled !== false) {
    const pending = [];
    for (const t of s.nagTimes) {
      for (const slot of dueSlots(t, now, NAG_WINDOW)) {
        const key = `${slot.date}_nag_${t}`;
        if (!sentKeys[key]) pending.push({ ...slot, key, time: t });
      }
    }
    if (pending.length) {
      // Birden fazla ısrar saati birikmişse tek bildirim gönder
      pending.sort((a, b) => a.late - b.late);
      jobs.push({ kind: "nag", label: "Israrlı · " + pending[0].time, date: pending[0].date,
                  keys: pending.map(p => p.key) });
    }
  }
  return jobs;
}

// Bir kullanıcıya bir iş için bildirim içeriği üret (yoksa null)
export function buildMessage(job, tasks, listById, settings, uid = null) {
  const s = normSettings(settings);
  const D = job.date;
  const name = (t) => { const l = listById(t.listId); return l ? `${t.title} (${l.name})` : t.title; };
  const open = tasks.filter(t => !t.done);

  if (job.kind === "taskrem") {
    // Hatırlatmayı koyan kişiye (ve göreve atanan kişiye) gider; kayıt sahibi belli değilse görebilenlere
    const ids = new Set((job.items || []).map(i => i.taskId));
    const items = open.filter(t => {
      if (!ids.has(t.id)) return false;
      const who = [t.createdBy, t.assignedTo].filter(Boolean);
      return !uid || !who.length || who.includes(uid);
    });
    if (!items.length) return null;
    return {
      title: items.length === 1 ? `Hatırlatma: ${items[0].title}` : `${items.length} görev hatırlatması`,
      body: items.slice(0, 6).map(t => "• " + name(t) + (t.note ? ` — ${String(t.note).slice(0, 80)}` : "")).join("\n"),
      urgent: false
    };
  }

  if (job.kind === "nag") {
    const items = open.filter(t => t.persistent && t.date && t.date <= D)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) return null;
    const title = items.length === 1 ? `Hâlâ yapılmadı: ${items[0].title}` : `${items.length} ısrarlı görev hâlâ bekliyor`;
    const body = items.slice(0, 6).map(t => {
      const late = dayDiff(t.date, D);
      return "• " + name(t) + (late > 0 ? ` — ${late} gün gecikti` : "");
    }).join("\n");
    return { title, body, urgent: true };
  }

  const remind = open.filter(t => listById(t.listId)?.reminder !== false || t.assignedTo);

  if (job.kind === "tomorrow") {
    const T = addDays(D, 1);
    const items = remind.filter(t => t.date === T);
    if (!items.length) return null;
    return {
      title: `Yarın ${items.length} görevin var`,
      body: items.slice(0, 8).map(t => "• " + name(t)).join("\n") + (items.length > 8 ? `\n+${items.length - 8} görev daha` : "")
    };
  }

  // today
  const late = remind.filter(t => t.date && t.date < D).sort((a, b) => a.date.localeCompare(b.date));
  const dueToday = remind.filter(t => t.date === D);
  const undated = s.includeUndated !== false ? remind.filter(t => !t.date) : [];
  if (!late.length && !dueToday.length && !undated.length) return null;
  const lines = [];
  if (late.length) lines.push("Gecikmiş: " + late.slice(0, 4).map(t => `${name(t)} — ${dayDiff(t.date, D)} gün`).join(" · "));
  if (dueToday.length) lines.push("Bugün: " + dueToday.slice(0, 6).map(name).join(" · "));
  if (undated.length) lines.push(`Tarihsiz: ${undated.length} görev bekliyor`);
  const title = late.length ? `${late.length} gecikmiş, ${dueToday.length} bugünlük görev`
    : dueToday.length ? `Bugün ${dueToday.length} görevin var`
    : `${undated.length} tarihsiz görev bekliyor`;
  return { title, body: lines.join("\n") };
}

// Kullanıcının görebildiği görevler
export function tasksForUser(uid, isAdmin, tasks, lists) {
  if (isAdmin) return tasks;
  const mine = new Set(lists.filter(l => l.ownerUid === uid || (l.members || []).includes(uid)).map(l => l.id));
  return tasks.filter(t => mine.has(t.listId) || t.assignedTo === uid);
}

/* ============ Telefon uygulaması için alarm planı ============
 * Önümüzdeki günlerin bütün hatırlatmalarını önceden hesaplar. Android uygulaması
 * bunları telefonun kendi alarmına kurar; sunucuya ya da internete bağlı kalmadan,
 * dakikasında çalar. Plan, görevler değişince (site) ve her sunucu turunda yenilenir.
 */
export const PLAN_DAYS = 8;
export const PLAN_PAST_MIN = 90; // telefon kapalıyken kaçanlar için geriye bakış

// Türkiye yaz saati uygulamıyor: her zaman UTC+3
export const istanbulTs = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+03:00`);

export function buildAlarmPlan({ uid, isAdmin, tasks, lists, settings, now = istanbulNow(), days = PLAN_DAYS }) {
  const s = normSettings(settings);
  const mine = tasksForUser(uid, isAdmin, tasks || [], lists || []);
  const listById = (id) => (lists || []).find(l => l.id === id);
  const nowTs = istanbulTs(now.date, now.hhmm);
  const fromTs = nowTs - PLAN_PAST_MIN * 60000;
  const toTs = istanbulTs(addDays(now.date, days), "00:00");
  const alarms = [];
  const add = (id, date, time, kind, msg) => {
    if (!msg) return;
    const ts = istanbulTs(date, time);
    if (!(ts >= fromTs && ts < toTs)) return;
    alarms.push({ id, ts, at: `${date}T${time}`, kind, title: msg.title,
                  body: String(msg.body || "").slice(0, 700), urgent: !!msg.urgent });
  };

  for (let d = -1; d < days; d++) {
    const D = addDays(now.date, d);
    for (const r of s.reminders) {
      if (r.enabled === false || !r.time) continue;
      const kind = r.type === "tomorrow" ? "tomorrow" : "today";
      add(`${D}_rem_${r.id}_${r.time}`, D, r.time, "summary",
          buildMessage({ kind, label: r.label, date: D, keys: [] }, mine, listById, s, uid));
    }
    if (s.nagEnabled !== false) {
      for (const t of s.nagTimes) {
        add(`${D}_nag_${t}`, D, t, "nag",
            buildMessage({ kind: "nag", label: "Israrlı", date: D, keys: [] }, mine, listById, s, uid));
      }
    }
  }

  for (const t of mine) {
    if (t.done) continue;
    for (const r of t.reminders || []) {
      if (!r || !r.date || !r.time) continue;
      add(`trem_${t.id}_${r.id}_${r.date}_${r.time}`, r.date, r.time, "task",
          buildMessage({ kind: "taskrem", label: "Görev hatırlatması", date: r.date,
                         items: [{ taskId: t.id }], keys: [] }, mine, listById, s, uid));
    }
  }

  alarms.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  return { v: 1, uid, made: Date.now(), alarms };
}

// Planın içerik özeti: aynı plan tekrar tekrar kaydedilmesin diye
export const planSignature = (plan) =>
  JSON.stringify(plan.alarms.map(a => [a.id, a.ts, a.title, a.body, a.urgent]));
