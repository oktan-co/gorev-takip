package co.oktan.gorev;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

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

    static void show(Context c, Alarm a) {
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        Intent open = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, a.id.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String first = a.body == null ? "" : a.body.split("\n", 2)[0];
        Notification n = new Notification.Builder(c, a.urgent ? CH_URGENT : CH_NORMAL)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF6C7CFF)
                .setContentTitle(a.title)
                .setContentText(first)
                .setStyle(new Notification.BigTextStyle().bigText(a.body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setShowWhen(true)
                .setWhen(a.ts > 0 ? a.ts : System.currentTimeMillis())
                .build();
        // Israrlı ve özet bildirimleri bir öncekinin yerine geçer (bildirim çubuğu dolmasın), görev hatırlatmaları ayrı kalır
        int id = "nag".equals(a.kind) ? 1001 : "summary".equals(a.kind) ? 1002 : a.id.hashCode();
        nm.notify(id, n);
    }
}
