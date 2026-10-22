// Tekrarlayan görev kuralları.
// Kural örnekleri:
//   { type: "daily" }
//   { type: "interval", every: 3 }                 // 3 günde bir
//   { type: "weekly", days: [1, 4] }               // 0=Pazar, 1=Pazartesi ... 6=Cumartesi
//   { type: "monthly", days: [10, 15, 20], last: false }
//   { type: "yearly" }                             // görevin tarihindeki gün/ay

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(s + "T12:00:00");
export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
export function dayDiff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
const lastDayOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export const GUN_KISA = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const AYLAR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

export function matches(rule, dateStr, anchorStr) {
  const d = parse(dateStr);
  switch (rule?.type) {
    case "daily": return true;
    case "interval": {
      const n = Math.max(1, Number(rule.every) || 1);
      const diff = dayDiff(anchorStr || dateStr, dateStr);
      return diff >= 0 && diff % n === 0;
    }
    case "weekly": return (rule.days || []).includes(d.getDay());
    case "monthly": {
      const dom = d.getDate(), last = lastDayOfMonth(d);
      const days = rule.days || [];
      if (days.includes(dom)) return true;
      if (dom === last && rule.last) return true;
      // 31 seçildi ama ay 30 çekiyorsa ayın son günü sayılır
      if (dom === last && days.some(x => x > last)) return true;
      return false;
    }
    case "yearly": {
      if (!anchorStr) return false;
      const a = parse(anchorStr);
      return a.getMonth() === d.getMonth() && a.getDate() === d.getDate();
    }
    default: return false;
  }
}

// afterStr'den SONRAKİ ilk uygun gün
export function nextOccurrence(rule, afterStr, anchorStr) {
  if (!rule || !rule.type) return null;
  let d = afterStr;
  for (let i = 0; i < 800; i++) {
    d = addDays(d, 1);
    if (matches(rule, d, anchorStr)) return d;
  }
  return null;
}

// fromStr dahil ilk uygun gün
export function firstOccurrence(rule, fromStr, anchorStr) {
  return nextOccurrence(rule, addDays(fromStr, -1), anchorStr || fromStr);
}

export function isValidRule(rule) {
  if (!rule || !rule.type) return false;
  if (rule.type === "weekly") return (rule.days || []).length > 0;
  if (rule.type === "monthly") return (rule.days || []).length > 0 || !!rule.last;
  if (rule.type === "interval") return Number(rule.every) >= 1;
  return ["daily", "yearly"].includes(rule.type);
}

export function describe(rule, anchorStr) {
  if (!rule || !rule.type) return "";
  switch (rule.type) {
    case "daily": return "Her gün";
    case "interval": return `${rule.every || 1} günde bir`;
    case "weekly": {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const ds = order.filter(x => (rule.days || []).includes(x)).map(x => GUN_KISA[x]);
      return ds.length === 7 ? "Her gün" : "Her hafta " + ds.join(", ");
    }
    case "monthly": {
      const ds = [...(rule.days || [])].sort((a, b) => a - b).map(String);
      if (rule.last) ds.push("son gün");
      return "Her ay " + ds.join(", ");
    }
    case "yearly": {
      if (!anchorStr) return "Her yıl";
      const a = parse(anchorStr);
      return `Her yıl ${a.getDate()} ${AYLAR[a.getMonth()]}`;
    }
  }
  return "";
}
