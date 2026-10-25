/**
 * Görev hatırlatmaları.
 * cron-job.org her 5 dakikada bir bu işi tetikler (yedek olarak GitHub'ın kendi
 * zamanlayıcısı da 30 dakikada bir çalışır). Ne zaman, ne gönderileceğine
 * uygulamadaki Ayarlar karar verir; aynı hatırlatma iki kez gönderilmez.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { istanbulNow, planJobs, planTaskReminders, nextRemDue, buildMessage, tasksForUser, normSettings, addDays } from "./plan.mjs";

const TEST = process.env.TEST === "true" || process.argv.includes("--test");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.error("FIREBASE_SERVICE_ACCOUNT secret'ı eksik."); process.exit(1); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const col = async (name) => (await db.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const APP_URL = process.env.APP_URL || "";
const iconUrl = APP_URL ? new URL("icon-192.png", APP_URL).href : "icon-192.png";

async function main() {
  const now = istanbulNow();
  const [sDoc, sentDoc] = await Promise.all([db.doc("settings/app").get(), db.doc("system/sent").get()]);
  const settings = normSettings(sDoc.exists ? sDoc.data() : {});
  const sent = sentDoc.exists ? sentDoc.data() : {};
  const keys = { ...(sent.keys || {}) };

  const jobs = planJobs(settings, now, keys, TEST);

  // Görevlere konmuş hatırlatmalar: sadece zamanı gelmiş (remDue <= şimdi) görevleri sorgula
  const nowStr = `${now.date}T${now.hhmm}`;
  const dueTasks = TEST ? [] : (await db.collection("tasks").where("remDue", "<=", nowStr).get())
    .docs.map(d => ({ id: d.id, ...d.data() }));
  if (dueTasks.length) jobs.push(...planTaskReminders(dueTasks, now, keys));

  if (!jobs.length && !dueTasks.length) { console.log(`Saat ${now.hhmm}: gönderilecek hatırlatma yok.`); return; }

  const [lists, tasks, tokens, users] = await Promise.all(["lists", "tasks", "tokens", "users"].map(col));
  const listById = (id) => lists.find(l => l.id === id);

  const byUser = new Map();
  for (const tok of tokens) {
    if (!tok.token) continue;
    if (!byUser.has(tok.uid)) byUser.set(tok.uid, []);
    byUser.get(tok.uid).push(tok.token);
  }

  const log = Array.isArray(sent.log) ? sent.log : [];
  const deadTokens = new Set();

  for (const job of jobs) {
    let devices = 0;
    for (const [uid, toks] of byUser) {
      const me = users.find(u => u.id === uid);
      const mine = tasksForUser(uid, me?.role === "admin", tasks, lists);
      const msg = buildMessage(job, mine, listById, settings, uid);
      if (!msg) { console.log(`${job.label} → ${uid}: gönderilecek görev yok.`); continue; }

      const res = await getMessaging().sendEachForMulticast({
        tokens: toks,
        notification: { title: msg.title, body: msg.body.slice(0, 900) },
        webpush: {
          fcmOptions: APP_URL ? { link: APP_URL } : undefined,
          notification: { icon: iconUrl, requireInteraction: !!msg.urgent }
        }
      });
      devices += res.successCount;
      console.log(`${job.label} → ${uid}: ${res.successCount} gönderildi, ${res.failureCount} başarısız.`);
      res.responses.forEach((r, i) => {
        const code = r.error?.code || "";
        if (!r.success && /registration-token-not-registered|invalid-argument/.test(code)) deadTokens.add(toks[i]);
      });
    }
    for (const k of job.keys) keys[k] = Date.now();
    log.push({ at: Date.now(), label: job.label, devices });
  }

  // Gönderilen ya da kaçan hatırlatmaları geçip bir sonrakine ilerle
  await Promise.all(dueTasks.map(t =>
    db.doc("tasks/" + t.id).update({ remDue: nextRemDue(t.reminders, nowStr) })
      .catch(e => console.error("remDue güncellenemedi", t.id, e.code || e.message))));

  // Eski kayıtları temizle
  const cutoff = addDays(now.date, -3);
  for (const k of Object.keys(keys)) if (k.slice(0, 10) < cutoff) delete keys[k];
  await db.doc("system/sent").set({ keys, log: log.slice(-40) });

  await Promise.all([...deadTokens].map(t => db.doc("tokens/" + t.slice(0, 120)).delete().catch(() => {})));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
