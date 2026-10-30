package co.oktan.gorev;

import android.app.NotificationManager;
import android.content.Context;
import android.os.PowerManager;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/** Site (app.js) ile telefon arasındaki köprü: window.GorevNative */
final class Bridge {
    private final MainActivity a;
    Bridge(MainActivity a) { this.a = a; }

    private Context c() { return a.getApplicationContext(); }

    @JavascriptInterface
    public void setSession(String uid, String refreshToken) {
        String old = Store.uid(c());
        if (old != null && !old.equals(uid)) Scheduler.cancelAll(c());
        Store.setSession(c(), uid, refreshToken);
        Sync.start(c());
        Sync.now(c());
    }

    @JavascriptInterface
    public void clearSession() {
        if (Store.uid(c()) == null) return;
        Scheduler.cancelAll(c());
        Store.clear(c());
    }

    @JavascriptInterface
    public void setPlan(String json) {
        if (Store.savePlan(c(), json)) Scheduler.apply(c(), false);
    }

    @JavascriptInterface
    public String status() {
        try {
            Context c = c();
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            JSONObject o = new JSONObject();
            o.put("notif", nm.areNotificationsEnabled());
            o.put("exact", Scheduler.canExact(c));
            o.put("battery", pm.isIgnoringBatteryOptimizations(c.getPackageName()));
            o.put("count", Store.scheduled(c).size());
            o.put("version", BuildConfig.VERSION_NAME);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void test() {
        Scheduler.test(c(), 5000);
    }

    @JavascriptInterface
    public void fixPermissions() {
        a.runOnUiThread(() -> a.fixPermissions(true));
    }

    @JavascriptInterface
    public String updateInfo() {
        return Updater.info();
    }

    @JavascriptInterface
    public void checkUpdate() {
        Updater.check();
    }

    @JavascriptInterface
    public void startUpdate() {
        a.runOnUiThread(() -> Updater.start(a));
    }
}
