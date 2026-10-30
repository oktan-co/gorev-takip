package co.oktan.gorev;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Telefon yeniden açıldığında, saat değiştiğinde ya da uygulama güncellendiğinde alarmları yeniden kurar. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Context c = ctx.getApplicationContext();
        Scheduler.apply(c, true);
        Sync.start(c);
        Sync.now(c);
    }
}
