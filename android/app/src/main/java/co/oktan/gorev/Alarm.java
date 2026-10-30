package co.oktan.gorev;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Planın tek bir hatırlatması. tasks: bildirimdeki görevlerin kimlikleri (butonlar için). */
final class Alarm {
    final String id, title, body, kind;
    final long ts;
    final boolean urgent;
    final List<String> tasks;

    Alarm(String id, long ts, String kind, String title, String body, boolean urgent) {
        this(id, ts, kind, title, body, urgent, Collections.emptyList());
    }

    Alarm(String id, long ts, String kind, String title, String body, boolean urgent, List<String> tasks) {
        this.id = id; this.ts = ts; this.kind = kind; this.title = title; this.body = body; this.urgent = urgent;
        this.tasks = tasks == null ? Collections.emptyList() : tasks;
    }

    static Alarm from(JSONObject a) throws Exception {
        List<String> t = new ArrayList<>();
        JSONArray ta = a.optJSONArray("tasks");
        if (ta != null) for (int j = 0; j < ta.length(); j++) t.add(ta.getString(j));
        return new Alarm(a.getString("id"), a.getLong("ts"), a.optString("kind", ""),
                a.optString("title", "Hatırlatma"), a.optString("body", ""), a.optBoolean("urgent", false), t);
    }

    JSONObject toJson() throws Exception {
        JSONObject o = new JSONObject();
        o.put("id", id); o.put("ts", ts); o.put("kind", kind); o.put("title", title);
        o.put("body", body); o.put("urgent", urgent);
        JSONArray t = new JSONArray();
        for (String s : tasks) t.put(s);
        o.put("tasks", t);
        return o;
    }

    static List<Alarm> parse(String json) {
        List<Alarm> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray arr = new JSONObject(json).optJSONArray("alarms");
            if (arr == null) return out;
            for (int i = 0; i < arr.length(); i++) {
                try { out.add(from(arr.getJSONObject(i))); } catch (Exception ignored) { }
            }
        } catch (Exception ignored) { }
        return out;
    }
}
