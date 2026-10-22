/**
 * Günlük görev hatırlatması.
 * GitHub Actions her saat başı çalıştırır; gönderip göndermeyeceğine
 * uygulamadaki Ayarlar ekranı karar verir (saat, açık/kapalı, hangi listeler).
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const TZ = "Europe/Istanbul";
const FORCE = process.argv.includes("--force");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.error("FIREBASE_SERVICE_ACCOUNT secret'ı eksik."); process.exit(1); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();

/* --- İstanbul saatine göre bugün --- */
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false
}).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
const today = `${parts.year}-${parts.month}-${parts.day}`;
const nowHour = Number(parts.hour);

const col = async (name) => (await db.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);

async function main(){
  const sDoc = await db.doc("settings/app").get();
  const s = sDoc.exists ? sDoc.data() : {};
  const enabled = s.reminderEnabled !== false;
  const timeStr = s.reminderTime || "11:00";
  const wantHour = Number(timeStr.split(":")[0]);

  if (!FORCE){
    if (!enabled) { console.log("Hatırlatma kapalı, çıkılıyor."); return; }
    if (nowHour !== wantHour) { console.log(`Şu an ${nowHour}:00, hatırlatma saati ${timeStr}. Atlanıyor.`); return; }
    if (s.lastReminderDate === today) { console.log("Bugün zaten gönderilmiş."); return; }
  }

  const [lists, tasks, tokens, users] = await Promise.all(
    ["lists", "tasks", "tokens", "users"].map(col));

  const remindList = new Map(lists.filter(l => l.reminder !== false).map(l => [l.id, l]));
  const open = tasks.filter(t => !t.done && remindList.has(t.listId));

  const byUser = new Map();
  for (const tok of tokens){
    if (!tok.token) continue;
    const u = byUser.get(tok.uid) || { tokens: [], uid: tok.uid };
    u.tokens.push(tok.token);
    byUser.set(tok.uid, u);
  }
  if (!byUser.size) { console.log("Kayıtlı cihaz yok."); return; }

  let sentAny = false;

  for (const [uid, u] of byUser){
    const me = users.find(x => x.id === uid);
    const admin = me?.role === "admin";
    const mine = open.filter(t => {
      if (admin) return true;
      if (t.assignedTo === uid) return true;
      const l = remindList.get(t.listId);
      return l && (l.ownerUid === uid || (l.members || []).includes(uid));
    });

    const late = mine.filter(t => t.date && t.date < today);
    const dueToday = mine.filter(t => t.date === today);
    const undated = (s.includeUndated !== false) ? mine.filter(t => !t.date) : [];
    if (!late.length && !dueToday.length && !undated.length){
      console.log(`${uid}: görev yok, atlandı.`); continue;
    }

    const name = (t) => {
      const l = remindList.get(t.listId);
      return l ? `${t.title} (${l.name})` : t.title;
    };
    const lines = [];
    if (late.length) lines.push("Gecikmiş: " + late.slice(0,4)
      .map(t => `${name(t)} — ${dayDiff(t.date, today)} gün`).join(" · "));
    if (dueToday.length) lines.push("Bugün: " + dueToday.slice(0,5).map(name).join(" · "));
    if (undated.length) lines.push(`Tarihsiz: ${undated.length} görev bekliyor`);

    const title = late.length
      ? `${late.length} gecikmiş, ${dueToday.length} bugünlük görev`
      : `Bugün ${dueToday.length} görevin var`;

    const res = await getMessaging().sendEachForMulticast({
      tokens: u.tokens,
      notification: { title, body: lines.join("\n").slice(0, 900) },
      webpush: {
        fcmOptions: { link: process.env.APP_URL || "/" },
        notification: { icon: "icon-192.png", tag: "gorev-hatirlatma" }
      }
    });
    console.log(`${uid}: ${res.successCount} gönderildi, ${res.failureCount} başarısız.`);
    sentAny = sentAny || res.successCount > 0;

    // Geçersiz cihaz anahtarlarını temizle
    await Promise.all(res.responses.map((r, i) => {
      const code = r.error?.code || "";
      if (r.success || !/registration-token-not-registered|invalid-argument/.test(code)) return null;
      return db.doc("tokens/" + u.tokens[i].slice(0, 120)).delete().catch(() => {});
    }));
  }

  if (sentAny && !FORCE) await db.doc("settings/app").set({ lastReminderDate: today }, { merge: true });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
