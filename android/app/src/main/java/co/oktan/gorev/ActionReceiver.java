package co.oktan.gorev;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;

/** Bildirimdeki butonlar: Tamamla, ertele (10 dk / 1 saat), ısrarı sustur (1 saat / yarına kadar). */
public class ActionReceiver extends BroadcastReceiver {
    static final String DONE = "co.oktan.gorev.DONE";
    static final String SNOOZE = "co.oktan.gorev.SNOOZE";
    static final String MUTE = "co.oktan.gorev.MUTE";

    @Override
    public void onReceive(Context ctx, Intent i) {
        final Context c = ctx.getApplicationContext();
        String action = i.getAction();
        int notif = i.getIntExtra("notif", 0);
        c.getSystemService(NotificationManager.class).cancel(notif);
        if (action == null) return;

        switch (action) {
            case SNOOZE: {
                long min = i.getLongExtra("min", 10);
                long ts = System.currentTimeMillis() + min * 60000L;
                String task = i.getStringExtra("task");
                Alarm a = new Alarm("snz_" + task + "_" + ts, ts, "task",
                        i.getStringExtra("title"), i.getStringExtra("body"), false,
                        Collections.singletonList(task));
                Store.addExtra(c, a);
                Scheduler.apply(c, false);
                toast(c, min >= 60 ? (min / 60) + " saat sonra tekrar hatırlatılacak" : min + " dk sonra tekrar hatırlatılacak");
                return;
            }
            case MUTE: {
                long until;
                if (i.getBooleanExtra("tomorrow", false)) {
                    until = LocalDate.now(ZoneId.of("Europe/Istanbul")).plusDays(1)
                            .atStartOfDay(ZoneId.of("Europe/Istanbul")).toInstant().toEpochMilli();
                    toast(c, "Israrlı hatırlatmalar yarına kadar sustu");
                } else {
                    until = System.currentTimeMillis() + 3600000L;
                    toast(c, "Israrlı hatırlatmalar 1 saat sustu");
                }
                Store.muteNag(c, until);
                return;
            }
            case DONE: {
                final String task = i.getStringExtra("task");
                if (task == null) return;
                Store.markDoneLocal(c, task);
                Store.dropExtras(c, task);
                Scheduler.apply(c, false);
                final PendingResult pr = goAsync();
                new Thread(() -> {
                    try {
                        String res = Remote.completeTask(c, task);
                        Store.removePendingDone(c, task);
                        toast(c, message(res));
                        Sync.now(c);
                    } catch (Exception e) {
                        // İnternet yok vb.: telefonda bekler, bağlanınca gönderilir
                        Store.addPendingDone(c, task);
                        Sync.now(c);
                        toast(c, "Tamamlandı · internet gelince kaydedilecek");
                    } finally {
                        pr.finish();
                    }
                }).start();
            }
        }
    }

    static String message(String res) {
        if (res == null) return "✓ Tamamlandı";
        String[] p = res.split("\n", 2);
        String title = p[0].isEmpty() ? "Görev" : "\"" + p[0] + "\"";
        if (p.length > 1) {
            try {
                LocalDate d = LocalDate.parse(p[1]);
                return "✓ " + title + " tamamlandı · sonraki: " + d.getDayOfMonth() + "." + d.getMonthValue();
            } catch (Exception ignored) { }
        }
        return "✓ " + title + " tamamlandı";
    }

    static void toast(Context c, String msg) {
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(c, msg, Toast.LENGTH_SHORT).show());
    }

    /** Bekleyen tamamlama kayıtlarını gönder (SyncWorker çağırır). */
    static void flush(Context c) {
        for (String task : Store.pendingDone(c)) {
            try {
                Remote.completeTask(c, task);
                Store.removePendingDone(c, task);
            } catch (Exception ignored) { }
        }
    }
}
