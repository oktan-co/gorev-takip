package co.oktan.gorev;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarm çaldı: önce en güncel planı dener (görev bu arada bitmiş olabilir), sonra bildirimi gösterir. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        final Context c = ctx.getApplicationContext();
        if (intent.getBooleanExtra("test", false)) {
            Notifier.show(c, new Alarm("test", System.currentTimeMillis(), "test",
                    "Görevler · deneme ✓", "Telefon alarmı çalışıyor. Hatırlatmalar dakikasında gelecek (sürüm güncellemesi denendi).", false));
            return;
        }
        final long ts = intent.getLongExtra("ts", 0);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                try { Remote.pullPlan(c); } catch (Exception ignored) { /* internet yoksa eldeki plan */ }
                for (Alarm a : Store.alarms(c)) {
                    if (a.ts == ts && !Store.fired(c, a.id)) {
                        Store.markFired(c, a.id);
                        if (!Store.shouldShow(c, a)) continue;
                        // Ertelenen hatırlatma: görev bu arada başka yerden bitirildiyse çalma
                        if (a.id.startsWith("snz_") && !a.tasks.isEmpty() && !Remote.taskOpen(c, a.tasks.get(0))) continue;
                        Notifier.show(c, a);
                    }
                }
                Scheduler.apply(c, false);
            } finally {
                pr.finish();
            }
        }).start();
    }
}
