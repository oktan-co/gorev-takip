package co.oktan.gorev;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Iterator;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Firebase'den (giriş anahtarı ile) alarm planını okur. Kütüphanesiz, düz HTTP. */
final class Remote {
    private Remote() {}
    private static final int TIMEOUT = 5000;

    static final class Http {
        final int code; final String body;
        Http(int code, String body) { this.code = code; this.body = body; }
    }

    private static Http call(String method, String url, String contentType, String body, String bearer) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(TIMEOUT);
        h.setReadTimeout(TIMEOUT);
        h.setRequestProperty("Referer", "https://" + Config.APP_HOST + "/");
        if (bearer != null) h.setRequestProperty("Authorization", "Bearer " + bearer);
        if ("PATCH".equals(method)) {
            h.setRequestMethod("POST");
            h.setRequestProperty("X-HTTP-Method-Override", "PATCH");
        } else {
            h.setRequestMethod(method);
        }
        if (body != null) {
            h.setDoOutput(true);
            h.setRequestProperty("Content-Type", contentType);
            try (OutputStream os = h.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = h.getResponseCode();
        InputStream is = code < 400 ? h.getInputStream() : h.getErrorStream();
        String text = "";
        if (is != null) {
            try (InputStream in = is) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                text = bo.toString("UTF-8");
            }
        }
        h.disconnect();
        return new Http(code, text);
    }

    /** Geçerli giriş anahtarı (gerekirse yeniler). Oturum yoksa null. */
    static synchronized String idToken(Context c) throws Exception {
        String refresh = Store.refresh(c);
        if (refresh == null) return null;
        long exp = Store.p(c).getLong("idExp", 0);
        String tok = Store.p(c).getString("idToken", null);
        if (tok != null && exp - System.currentTimeMillis() > 120000) return tok;

        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8");
        Http r = call("POST", "https://securetoken.googleapis.com/v1/token?key=" + Config.API_KEY,
                "application/x-www-form-urlencoded", body, null);
        if (r.code != 200) throw new Exception("token " + r.code);
        JSONObject o = new JSONObject(r.body);
        tok = o.getString("id_token");
        long ttl = Long.parseLong(o.optString("expires_in", "3600")) * 1000L;
        Store.p(c).edit()
                .putString("idToken", tok)
                .putLong("idExp", System.currentTimeMillis() + ttl)
                .putString("refresh", o.optString("refresh_token", refresh))
                .apply();
        return tok;
    }

    private static String docUrl(String uid) {
        return "https://firestore.googleapis.com/v1/projects/" + Config.PROJECT_ID
                + "/databases/(default)/documents/alarmPlans/" + uid;
    }

    /** Sunucudaki planı indirip kaydeder. Plan değiştiyse true. */
    static boolean pullPlan(Context c) throws Exception {
        String uid = Store.uid(c);
        String tok = idToken(c);
        if (uid == null || tok == null) return false;
        Http r = call("GET", docUrl(uid), null, null, tok);
        if (r.code == 404) return false;
        if (r.code != 200) throw new Exception("plan " + r.code);
        JSONObject f = new JSONObject(r.body).optJSONObject("fields");
        if (f == null || !f.has("json")) return false;
        String json = f.getJSONObject("json").optString("stringValue", null);
        return json != null && Store.savePlan(c, json);
    }

    /** Sunucuya "bu kişide telefon uygulaması var" der; Chrome'dan aynı bildirim ikinci kez gelmez. */
    static void markNative(Context c) throws Exception {
        String uid = Store.uid(c);
        String tok = idToken(c);
        if (uid == null || tok == null) return;
        long now = System.currentTimeMillis();
        String body = "{\"fields\":{\"nativeAt\":{\"integerValue\":\"" + now + "\"}}}";
        Http r = call("PATCH", docUrl(uid) + "?updateMask.fieldPaths=nativeAt", "application/json", body, tok);
        if (r.code == 200) Store.p(c).edit().putLong("nativeMarked", now).apply();
    }

    /* ---------- bildirimden görev tamamlama ---------- */

    private static final ZoneId TR = ZoneId.of("Europe/Istanbul");

    private static String tasksUrl() {
        return "https://firestore.googleapis.com/v1/projects/" + Config.PROJECT_ID
                + "/databases/(default)/documents/tasks";
    }

    /** Firestore değeri → düz JSON değeri */
    static Object plain(JSONObject v) throws Exception {
        if (v.has("stringValue")) return v.getString("stringValue");
        if (v.has("booleanValue")) return v.getBoolean("booleanValue");
        if (v.has("integerValue")) return Long.parseLong(v.getString("integerValue"));
        if (v.has("doubleValue")) return v.getDouble("doubleValue");
        if (v.has("timestampValue")) return v.getString("timestampValue");
        if (v.has("nullValue")) return JSONObject.NULL;
        if (v.has("mapValue")) {
            JSONObject f = v.getJSONObject("mapValue").optJSONObject("fields");
            return plainFields(f);
        }
        if (v.has("arrayValue")) {
            JSONArray in = v.getJSONObject("arrayValue").optJSONArray("values");
            JSONArray out = new JSONArray();
            if (in != null) for (int i = 0; i < in.length(); i++) out.put(plain(in.getJSONObject(i)));
            return out;
        }
        return JSONObject.NULL;
    }

    static JSONObject plainFields(JSONObject f) throws Exception {
        JSONObject o = new JSONObject();
        if (f == null) return o;
        Iterator<String> it = f.keys();
        while (it.hasNext()) { String k = it.next(); o.put(k, plain(f.getJSONObject(k))); }
        return o;
    }

    /** Düz JSON değeri → Firestore değeri */
    static JSONObject typed(Object x) throws Exception {
        JSONObject v = new JSONObject();
        if (x == null || x == JSONObject.NULL) v.put("nullValue", JSONObject.NULL);
        else if (x instanceof Boolean) v.put("booleanValue", x);
        else if (x instanceof Integer || x instanceof Long) v.put("integerValue", String.valueOf(x));
        else if (x instanceof Number) v.put("doubleValue", ((Number) x).doubleValue());
        else if (x instanceof JSONObject) {
            JSONObject o = (JSONObject) x, f = new JSONObject();
            Iterator<String> it = o.keys();
            while (it.hasNext()) { String k = it.next(); f.put(k, typed(o.get(k))); }
            v.put("mapValue", new JSONObject().put("fields", f));
        } else if (x instanceof JSONArray) {
            JSONArray a = (JSONArray) x, vals = new JSONArray();
            for (int i = 0; i < a.length(); i++) vals.put(typed(a.get(i)));
            v.put("arrayValue", new JSONObject().put("values", vals));
        } else v.put("stringValue", String.valueOf(x));
        return v;
    }

    private static JSONObject typedFields(JSONObject o) throws Exception {
        JSONObject f = new JSONObject();
        Iterator<String> it = o.keys();
        while (it.hasNext()) { String k = it.next(); f.put(k, typed(o.get(k))); }
        return new JSONObject().put("fields", f);
    }

    private static void patch(String id, JSONObject data, String tok) throws Exception {
        StringBuilder q = new StringBuilder();
        Iterator<String> it = data.keys();
        while (it.hasNext()) q.append(q.length() == 0 ? "?" : "&").append("updateMask.fieldPaths=").append(it.next());
        q.append("&currentDocument.exists=true");
        Http r = call("PATCH", tasksUrl() + "/" + id + q, "application/json", typedFields(data).toString(), tok);
        if (r.code != 200) throw new Exception("patch " + r.code);
    }

    private static String str(JSONObject o, String k) {
        Object v = o.opt(k);
        return v instanceof String ? (String) v : null;
    }

    /** remDue: şu andan 90 dk öncesinden sonraki ilk hatırlatma (app.js calcRemDue ile aynı) */
    private static Object remDue(JSONArray rems) {
        String lim = LocalDateTime.now(TR).minusMinutes(90).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"));
        String best = null;
        for (int i = 0; i < rems.length(); i++) {
            JSONObject r = rems.optJSONObject(i);
            if (r == null) continue;
            String d = str(r, "date"), t = str(r, "time");
            if (d == null || t == null || !d.matches("\\d{4}-\\d{2}-\\d{2}") || !t.matches("\\d{2}:\\d{2}")) continue;
            String x = d + "T" + t;
            if (x.compareTo(lim) >= 0 && (best == null || x.compareTo(best) < 0)) best = x;
        }
        return best == null ? JSONObject.NULL : best;
    }

    /**
     * Görevi tamamlar (sitedeki "tamamla" ile aynı sonuç). Tekrarlayan görevde bu seferki
     * tamamlandı olarak kaydedilir, görev sonraki tarihe kayar. Dönen metin: kısa sonuç mesajı.
     * Ağ hatasında istisna atar; görev yoksa ya da zaten bitmişse sessizce döner.
     */
    static String completeTask(Context c, String id) throws Exception {
        String uid = Store.uid(c);
        String tok = idToken(c);
        if (uid == null || tok == null) throw new Exception("oturum yok");
        Http g = call("GET", tasksUrl() + "/" + id, null, null, tok);
        if (g.code == 404 || g.code == 403) return null;
        if (g.code != 200) throw new Exception("get " + g.code);
        JSONObject t = plainFields(new JSONObject(g.body).optJSONObject("fields"));
        String title = str(t, "title");
        if (t.optBoolean("done", false)) return title;

        long now = System.currentTimeMillis();
        LocalDate today = LocalDate.now(TR);
        Object rep = t.opt("repeat");
        JSONObject rule = rep instanceof JSONObject ? (JSONObject) rep : null;

        if (Repeat.valid(rule)) {
            String date = str(t, "date");
            LocalDate occ = date != null ? LocalDate.parse(date) : today;
            LocalDate after = occ.isAfter(today) ? occ : today;
            LocalDate next = Repeat.next(rule, after, occ);

            JSONArray steps = t.optJSONArray("steps");
            if (steps == null) steps = new JSONArray();
            JSONObject hist = new JSONObject()
                    .put("title", title == null ? "" : title)
                    .put("note", str(t, "note") == null ? "" : str(t, "note"))
                    .put("listId", t.opt("listId"))
                    .put("date", occ.toString())
                    .put("done", true).put("doneAt", now)
                    .put("assignedTo", t.opt("assignedTo") == null ? JSONObject.NULL : t.opt("assignedTo"))
                    .put("repeat", JSONObject.NULL).put("persistent", false)
                    .put("fromRepeat", id)
                    .put("steps", new JSONArray(steps.toString()))
                    .put("createdBy", uid).put("createdAt", now);
            Http r = call("POST", tasksUrl(), "application/json", typedFields(hist).toString(), tok);
            if (r.code != 200) throw new Exception("create " + r.code);

            if (next != null) {
                long delta = ChronoUnit.DAYS.between(occ, next);
                JSONArray rems = t.optJSONArray("reminders"), shifted = new JSONArray();
                if (rems != null) for (int i = 0; i < rems.length(); i++) {
                    JSONObject x = rems.optJSONObject(i);
                    if (x == null || str(x, "date") == null || str(x, "time") == null) continue;
                    JSONObject y = new JSONObject(x.toString());
                    try { y.put("date", LocalDate.parse(str(x, "date")).plusDays(delta).toString()); } catch (Exception e) { continue; }
                    shifted.put(y);
                }
                JSONArray fresh = new JSONArray();
                for (int i = 0; i < steps.length(); i++) {
                    JSONObject x = steps.optJSONObject(i);
                    if (x == null) continue;
                    fresh.put(new JSONObject(x.toString()).put("done", false));
                }
                patch(id, new JSONObject().put("date", next.toString()).put("steps", fresh)
                        .put("reminders", shifted).put("remDue", remDue(shifted)), tok);
                return title + "\n" + next;
            }
            patch(id, new JSONObject().put("done", true).put("doneAt", now), tok);
            return title;
        }
        patch(id, new JSONObject().put("done", true).put("doneAt", now), tok);
        return title;
    }

    /** Görev hâlâ açık mı? (ertelenen hatırlatma çalmadan önce). Bilinmiyorsa true. */
    static boolean taskOpen(Context c, String id) {
        try {
            String tok = idToken(c);
            if (tok == null) return true;
            Http g = call("GET", tasksUrl() + "/" + id, null, null, tok);
            if (g.code == 404) return false;
            if (g.code != 200) return true;
            JSONObject f = new JSONObject(g.body).optJSONObject("fields");
            return f == null || !f.has("done") || !f.getJSONObject("done").optBoolean("booleanValue", false);
        } catch (Exception e) {
            return true;
        }
    }
}
