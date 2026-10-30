package co.oktan.gorev;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Yeni APK var mı bakar, indirir ve kurulum ekranını açar (son "Yükle" onayını Android ister). */
final class Updater {
    private static final String API = "https://api.github.com/repos/oktan-co/gorev-takip/releases/tags/android";
    private static final String APK = "https://github.com/oktan-co/gorev-takip/releases/download/android/Gorevler.apk";

    /** idle | checking | downloading | izin | error */
    private static volatile String state = "idle";
    private static volatile int latest = 0;

    private Updater() {}

    static String info() {
        try {
            JSONObject o = new JSONObject();
            o.put("current", BuildConfig.VERSION_CODE);
            o.put("latest", latest);
            o.put("available", latest > BuildConfig.VERSION_CODE);
            o.put("name", "1." + latest);
            o.put("state", state);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    static void check() {
        if ("checking".equals(state) || "downloading".equals(state)) return;
        state = "checking";
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(API).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                if (c.getResponseCode() != 200) throw new Exception("http " + c.getResponseCode());
                StringBuilder sb = new StringBuilder();
                try (InputStream in = c.getInputStream()) {
                    byte[] b = new byte[4096];
                    int n;
                    while ((n = in.read(b)) > 0) sb.append(new String(b, 0, n, "UTF-8"));
                }
                String body = new JSONObject(sb.toString()).optString("body", "");
                Matcher m = Pattern.compile("1\\.(\\d+)").matcher(body);
                if (m.find()) latest = Integer.parseInt(m.group(1));
                state = "idle";
            } catch (Exception e) {
                state = "idle";
            }
        }).start();
    }

    static void start(Activity a) {
        if ("downloading".equals(state)) return;
        if (!a.getPackageManager().canRequestPackageInstalls()) {
            state = "izin";
            try {
                a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + a.getPackageName())));
            } catch (Exception ignored) { }
            return;
        }
        state = "downloading";
        new Thread(() -> {
            try {
                File dir = new File(a.getCacheDir(), "updates");
                dir.mkdirs();
                File f = new File(dir, "Gorevler.apk");
                HttpURLConnection c = (HttpURLConnection) new URL(APK).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) throw new Exception("http " + c.getResponseCode());
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] b = new byte[16384];
                    int n;
                    while ((n = in.read(b)) > 0) out.write(b, 0, n);
                }
                Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".files", f);
                Intent i = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                state = "idle";
                a.runOnUiThread(() -> a.startActivity(i));
            } catch (Exception e) {
                state = "error";
            }
        }).start();
    }
}
