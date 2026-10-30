package co.oktan.gorev;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** repeat.js'in telefondaki karşılığı: tekrarlayan görevin bir sonraki tarihi. */
final class Repeat {
    private Repeat() {}

    private static boolean has(JSONArray a, int v) {
        if (a == null) return false;
        for (int i = 0; i < a.length(); i++) if (a.optInt(i, -999) == v) return true;
        return false;
    }

    static boolean valid(JSONObject r) {
        if (r == null) return false;
        String t = r.optString("type", "");
        JSONArray days = r.optJSONArray("days");
        int n = days == null ? 0 : days.length();
        switch (t) {
            case "weekly": return n > 0;
            case "monthly": return n > 0 || r.optBoolean("last", false);
            case "interval": return r.optDouble("every", 0) >= 1;
            case "daily": case "yearly": return true;
            default: return false;
        }
    }

    static boolean matches(JSONObject r, LocalDate d, LocalDate anchor) {
        JSONArray days = r.optJSONArray("days");
        switch (r.optString("type", "")) {
            case "daily": return true;
            case "interval": {
                long n = Math.max(1, (long) r.optDouble("every", 1));
                long diff = ChronoUnit.DAYS.between(anchor != null ? anchor : d, d);
                return diff >= 0 && diff % n == 0;
            }
            case "weekly": return has(days, d.getDayOfWeek().getValue() % 7);
            case "monthly": {
                int step = Math.max(1, (int) r.optDouble("months", 1));
                if (step > 1) {
                    LocalDate a = anchor != null ? anchor : d;
                    int md = (d.getYear() - a.getYear()) * 12 + d.getMonthValue() - a.getMonthValue();
                    if (md < 0 || md % step != 0) return false;
                }
                int dom = d.getDayOfMonth(), last = d.lengthOfMonth();
                if (has(days, dom)) return true;
                if (dom == last && r.optBoolean("last", false)) return true;
                if (dom == last && days != null)
                    for (int i = 0; i < days.length(); i++) if (days.optInt(i) > last) return true;
                return false;
            }
            case "yearly":
                return anchor != null && anchor.getMonthValue() == d.getMonthValue()
                        && anchor.getDayOfMonth() == d.getDayOfMonth();
            default: return false;
        }
    }

    /** after'dan SONRAKİ ilk uygun gün (yoksa null). */
    static LocalDate next(JSONObject r, LocalDate after, LocalDate anchor) {
        LocalDate d = after;
        for (int i = 0; i < 800; i++) {
            d = d.plusDays(1);
            if (matches(r, d, anchor)) return d;
        }
        return null;
    }
}
