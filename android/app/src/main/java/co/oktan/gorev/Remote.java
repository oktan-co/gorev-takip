package co.oktan.gorev;

import android.content.Context;

import org.json.JSONObject;

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
}
