package co.oktan.gorev;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Siteyi açan ana ekran. Hatırlatma işleri arka planda Scheduler/Sync ile yürür. */
public class MainActivity extends Activity {
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " GorevlerApp/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(this), Config.JS_NAME);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (Config.APP_HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null);
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(Config.APP_URL);

        Notifier.channels(this);
        Scheduler.apply(this, false);
        Sync.start(this);
        fixPermissions(false);
    }

    private static String offlinePage() {
        return "<html><body style=\"background:#0f0f10;color:#ddd;font-family:sans-serif;text-align:center;padding-top:30vh\">"
                + "<p>İnternet yok. Hatırlatmalar yine de telefonun alarmıyla çalar.</p>"
                + "<button style=\"padding:12px 22px;font-size:16px;border-radius:10px;border:0;background:#6c7cff;color:#fff\" "
                + "onclick=\"location.href='" + Config.APP_URL + "'\">Tekrar dene</button></body></html>";
    }

    /** Bildirim izni → kesin alarm izni → pil kısıtlaması, sırayla. user=true ise ayar ekranına da götürür. */
    void fixPermissions(boolean user) {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            boolean asked = Store.p(this).getBoolean("askedNotif", false);
            if (!asked || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                Store.p(this).edit().putBoolean("askedNotif", true).apply();
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
                return;
            }
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (!nm.areNotificationsEnabled()) {
            if (user) open(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            return;
        }
        if (!Scheduler.canExact(this) && Build.VERSION.SDK_INT >= 31) {
            open(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
            return;
        }
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (!pm.isIgnoringBatteryOptimizations(getPackageName())) {
            boolean asked = Store.p(this).getBoolean("askedBattery", false);
            if (user || !asked) {
                Store.p(this).edit().putBoolean("askedBattery", true).apply();
                open(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getPackageName())));
            }
        }
    }

    private void open(Intent i) {
        try { startActivity(i); } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) { }
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 7) fixPermissions(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        Scheduler.apply(this, false);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }
}
