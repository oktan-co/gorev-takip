package co.oktan.gorev;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Planın tek bir hatırlatması. */
final class Alarm {
    final String id, title, body, kind;
    final long ts;
    final boolean urgent;

    Alarm(String id, long ts, String kind, String title, String body, boolean urgent) {
        this.id = id; this.ts = ts; this.kind = kind; this.title = title; this.body = body; this.urgent = urgent;
    }

    static List<Alarm> parse(String json) {
        List<Alarm> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray arr = new JSONObject(json).optJSONArray("alarms");
            if (arr == null) return out;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject a = arr.getJSONObject(i);
                out.add(new Alarm(a.getString("id"), a.getLong("ts"), a.optString("kind", ""),
                        a.optString("title", "Hatırlatma"), a.optString("body", ""), a.optBoolean("urgent", false)));
            }
        } catch (Exception ignored) { }
        return out;
    }
}
