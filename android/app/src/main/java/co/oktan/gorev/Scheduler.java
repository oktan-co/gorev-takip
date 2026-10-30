package co.oktan.gorev;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Plandaki hatırlatmaları telefonun alarm saatine kurar. Aynı dakikadakiler tek alarmda toplanır. */
final class Scheduler {
    private Scheduler() {}
    private static final int MAX = 300;

    static PendingIntent pending(Context c, long ts) {
        Intent i = new Intent(c, AlarmReceiver.class)
                .setAction("co.oktan.gorev.ALARM")
                .setData(Uri.parse("gorev://alarm/" + ts))
                .putExtra("ts", ts);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
    }

    private static void set(Context c, AlarmManager am, long ts, PendingIntent pi) {
        if (canExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
    }

    /**
     * Planı uygula: gelecektekileri kur, plandan çıkanları iptal et.
     * catchUp: telefon kapalı/yeniden başlatılmışken kaçan (son 60 dk) hatırlatmaları hemen göster.
     */
    static synchronized void apply(Context c, boolean catchUp) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        List<Alarm> alarms = Alarm.parse(Store.planJson(c));
        long now = System.currentTimeMillis();
        Set<String> keep = new HashSet<>();
        for (Alarm a : alarms) {
            if (Store.fired(c, a.id)) continue;
            if (a.ts > now) {
                String k = String.valueOf(a.ts);
                if (keep.contains(k)) continue;
                if (keep.size() >= MAX) break;
                set(c, am, a.ts, pending(c, a.ts));
                keep.add(k);
            } else if (catchUp && now - a.ts < 60L * 60000L) {
                Notifier.show(c, a);
                Store.markFired(c, a.id);
            }
        }
        for (String k : Store.scheduled(c)) {
            if (keep.contains(k)) continue;
            try {
                PendingIntent pi = pending(c, Long.parseLong(k));
                am.cancel(pi);
                pi.cancel();
            } catch (Exception ignored) { }
        }
        Store.setScheduled(c, keep);
    }

    static synchronized void cancelAll(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        for (String k : Store.scheduled(c)) {
            try {
                PendingIntent pi = pending(c, Long.parseLong(k));
                am.cancel(pi);
                pi.cancel();
            } catch (Exception ignored) { }
        }
        Store.setScheduled(c, new HashSet<>());
    }

    /** Deneme: gerçek alarm yolunu kullanarak birkaç saniye sonra bildirim gösterir. */
    static void test(Context c, long delayMs) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(c, AlarmReceiver.class)
                .setAction("co.oktan.gorev.TEST")
                .setData(Uri.parse("gorev://test"))
                .putExtra("test", true);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        set(c, am, System.currentTimeMillis() + delayMs, pi);
    }
}
