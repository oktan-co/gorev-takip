package co.oktan.gorev;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/** Telefonda saklanan oturum, plan ve "çaldı" kayıtları. */
final class Store {
    private Store() {}

    static SharedPreferences p(Context c) {
        return c.getSharedPreferences("gorev", Context.MODE_PRIVATE);
    }

    static String uid(Context c) { return p(c).getString("uid", null); }
    static String refresh(Context c) { return p(c).getString("refresh", null); }

    static synchronized void setSession(Context c, String uid, String refresh) {
        SharedPreferences.Editor e = p(c).edit();
        if (uid != null && !uid.equals(uid(c))) {
            // Başka hesap: eski planı unut
            e.remove("plan").remove("planMade").remove("idToken").remove("idExp");
        }
        e.putString("uid", uid);
        if (refresh != null && !refresh.isEmpty()) e.putString("refresh", refresh);
        e.apply();
    }

    static synchronized void clear(Context c) {
        p(c).edit().clear().apply();
    }

    static String planJson(Context c) { return p(c).getString("plan", null); }

    /** Plan bu hesaba aitse ve eldekinden eski değilse kaydeder. Değiştiyse true. */
    static synchronized boolean savePlan(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            String uid = uid(c);
            String planUid = o.optString("uid", "");
            if (uid == null || !uid.equals(planUid)) return false;
            long made = o.optLong("made", 0);
            if (made < p(c).getLong("planMade", 0)) return false;
            String old = planJson(c);
            p(c).edit().putString("plan", json).putLong("planMade", made).apply();
            return old == null || !old.equals(json);
        } catch (Exception e) {
            return false;
        }
    }

    static Set<String> scheduled(Context c) {
        return new HashSet<>(p(c).getStringSet("scheduled", new HashSet<>()));
    }

    static void setScheduled(Context c, Set<String> s) {
        p(c).edit().putStringSet("scheduled", new HashSet<>(s)).apply();
    }

    static synchronized boolean fired(Context c, String id) {
        try { return new JSONObject(p(c).getString("fired", "{}")).has(id); }
        catch (Exception e) { return false; }
    }

    static synchronized void markFired(Context c, String id) {
        try {
            JSONObject o = new JSONObject(p(c).getString("fired", "{}"));
            long now = System.currentTimeMillis();
            o.put(id, now);
            // 4 günden eski kayıtları temizle
            Iterator<String> it = o.keys();
            Set<String> old = new HashSet<>();
            while (it.hasNext()) { String k = it.next(); if (now - o.optLong(k) > 4L * 86400000L) old.add(k); }
            for (String k : old) o.remove(k);
            p(c).edit().putString("fired", o.toString()).apply();
        } catch (Exception ignored) { }
    }
}
