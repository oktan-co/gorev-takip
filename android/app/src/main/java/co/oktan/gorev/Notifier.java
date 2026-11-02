package co.oktan.gorev;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;

/** Bildirimleri gösterir. İki kanal: normal hatırlatmalar ve ısrarlı hatırlatmalar. */
final class Notifier {
    private Notifier() {}
    static final String CH_NORMAL = "hatirlatma";
    static final String CH_URGENT = "israrli";

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel a = new NotificationChannel(CH_NORMAL, "Hatırlatmalar", NotificationManager.IMPORTANCE_HIGH);
        a.setDescription("Görev hatırlatmaları ve günlük özetler");
        a.enableVibration(true);
        a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel b = new NotificationChannel(CH_URGENT, "Israrlı hatırlatmalar", NotificationManager.IMPORTANCE_HIGH);
        b.setDescription("Yapılmayan ısrarlı görevler");
        b.enableVibration(true);
        b.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
        b.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(a);
        nm.createNotificationChannel(b);
    }

    static int notifId(Alarm a) {
        return "nag".equals(a.kind) ? 1001 : "summary".equals(a.kind) ? 1002 : a.id.hashCode();
    }

    private static Notification.Action act(Context c, String label, PendingIntent pi) {
        return new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_stat), label, pi).build();
    }

    private static int req = 0;
    private static PendingIntent btn(Context c, String action, int notif, Alarm a, String task, long extra, boolean tomorrow) {
        Intent i = new Intent(c, ActionReceiver.class)
                .setAction(action)
                .putExtra("notif", notif)
                .putExtra("task", task)
                .putExtra("title", a.title)
                .putExtra("body", a.body)
                .putExtra("min", extra)
                .putExtra("tomorrow", tomorrow);
        int code = (a.id + action + extra + tomorrow + (req++)).hashCode();
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void show(Context c, Alarm a) {
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        Intent open = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, a.id.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String first = a.body == null ? "" : a.body.split("\n", 2)[0];
        // Israrlı ve özet bildirimleri bir öncekinin yerine geçer (bildirim çubuğu dolmasın), görev hatırlatmaları ayrı kalır
        int id = notifId(a);
        Notification.Builder b = new Notification.Builder(c, a.urgent ? CH_URGENT : CH_NORMAL)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF6C7CFF)
                .setContentTitle(a.title)
                .setContentText(first)
                .setStyle(new Notification.BigTextStyle().bigText(a.body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setShowWhen(true)
                .setWhen(a.ts > 0 ? a.ts : System.currentTimeMillis());

        boolean one = a.tasks.size() == 1;
        if ("task".equals(a.kind) && one) {
            String t = a.tasks.get(0);
            b.addAction(act(c, "Tamamla", btn(c, ActionReceiver.DONE, id, a, t, 0, false)));
            b.addAction(act(c, "10 dk sonra", btn(c, ActionReceiver.SNOOZE, id, a, t, 10, false)));
            b.addAction(act(c, "1 saat sonra", btn(c, ActionReceiver.SNOOZE, id, a, t, 60, false)));
        } else if ("nag".equals(a.kind)) {
            if (one) b.addAction(act(c, "Tamamla", btn(c, ActionReceiver.DONE, id, a, a.tasks.get(0), 0, false)));
            else b.addAction(act(c, "Aç", pi));
            b.addAction(act(c, "1 saat sustur", btn(c, ActionReceiver.MUTE, id, a, null, 60, false)));
            b.addAction(act(c, "Yarına kadar sustur", btn(c, ActionReceiver.MUTE, id, a, null, 0, true)));
        } else if ("summary".equals(a.kind)) {
            b.addAction(act(c, "Aç", pi));
        }
        nm.notify(id, b.build());
    }
}
