package co.oktan.gorev;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

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

    /* ---------- bildirim butonları ---------- */

    /** Ertelenen hatırlatmalar (plandan bağımsız, sadece bu telefonda). */
    static synchronized List<Alarm> extras(Context c) {
        List<Alarm> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(p(c).getString("extras", "[]"));
            for (int i = 0; i < a.length(); i++) out.add(Alarm.from(a.getJSONObject(i)));
        } catch (Exception ignored) { }
        return out;
    }

    private static void saveExtras(Context c, List<Alarm> list) {
        JSONArray a = new JSONArray();
        long now = System.currentTimeMillis();
        for (Alarm x : list) {
            if (now - x.ts > 86400000L) continue; // bir günden eskiyi at
            try { a.put(x.toJson()); } catch (Exception ignored) { }
        }
        p(c).edit().putString("extras", a.toString()).apply();
    }

    static synchronized void addExtra(Context c, Alarm a) {
        List<Alarm> l = extras(c);
        l.add(a);
        saveExtras(c, l);
    }

    /** Bu görevin ertelenmiş hatırlatmalarını sil (görev tamamlandı). */
    static synchronized void dropExtras(Context c, String taskId) {
        List<Alarm> l = extras(c), keep = new ArrayList<>();
        for (Alarm a : l) if (!a.tasks.contains(taskId)) keep.add(a);
        saveExtras(c, keep);
    }

    /** Plan + ertelenenler. */
    static List<Alarm> alarms(Context c) {
        List<Alarm> l = Alarm.parse(planJson(c));
        l.addAll(extras(c));
        return l;
    }

    /** Bildirimden tamamlanan görevler: plan yenilenene kadar hatırlatmaları susar. */
    static synchronized void markDoneLocal(Context c, String taskId) {
        try {
            JSONObject o = new JSONObject(p(c).getString("doneLocal", "{}"));
            o.put(taskId, System.currentTimeMillis());
            p(c).edit().putString("doneLocal", o.toString()).apply();
        } catch (Exception ignored) { }
    }

    static synchronized void addPendingDone(Context c, String taskId) {
        try {
            JSONObject o = new JSONObject(p(c).getString("pendingDone", "{}"));
            o.put(taskId, System.currentTimeMillis());
            p(c).edit().putString("pendingDone", o.toString()).apply();
        } catch (Exception ignored) { }
    }

    static synchronized void removePendingDone(Context c, String taskId) {
        try {
            JSONObject o = new JSONObject(p(c).getString("pendingDone", "{}"));
            o.remove(taskId);
            p(c).edit().putString("pendingDone", o.toString()).apply();
        } catch (Exception ignored) { }
    }

    static synchronized List<String> pendingDone(Context c) {
        List<String> out = new ArrayList<>();
        try {
            JSONObject o = new JSONObject(p(c).getString("pendingDone", "{}"));
            Iterator<String> it = o.keys();
            while (it.hasNext()) out.add(it.next());
        } catch (Exception ignored) { }
        return out;
    }

    static void muteNag(Context c, long until) {
        p(c).edit().putLong("nagMute", until).apply();
    }

    /** Bu hatırlatma gösterilmeli mi? (tamamlandı ya da ısrar susturuldu ise hayır) */
    static synchronized boolean shouldShow(Context c, Alarm a) {
        if ("nag".equals(a.kind) && a.ts < p(c).getLong("nagMute", 0)) return false;
        if (a.tasks.isEmpty()) return true;
        try {
            JSONObject o = new JSONObject(p(c).getString("doneLocal", "{}"));
            long planMade = p(c).getLong("planMade", 0);
            boolean isExtra = a.id.startsWith("snz_");
            for (String t : a.tasks) {
                long at = o.optLong(t, 0);
                // Plan tamamlamadan sonra yapıldıysa zaten güncel; ertelenenler ise her zaman susar
                boolean done = at > 0 && (isExtra || planMade < at);
                if (!done) return true;
            }
            return false;
        } catch (Exception e) {
            return true;
        }
    }
}
