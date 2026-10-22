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

export const SUMMARY_WINDOW = 90;  // özet en fazla 90 dk gecikmeyle yine gönderilir
export const NAG_WINDOW = 30;      // ısrarlı hatırlatma en fazla 30 dk gecikmeyle

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
export function buildMessage(job, tasks, listById, settings) {
  const s = normSettings(settings);
  const D = job.date;
  const name = (t) => { const l = listById(t.listId); return l ? `${t.title} (${l.name})` : t.title; };
  const open = tasks.filter(t => !t.done);

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
