package co.oktan.gorev;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/** Arka planda 15 dakikada bir planı eşitler (bilgisayardan eklenen görevler telefona da kurulsun). */
final class Sync {
    private Sync() {}

    private static Constraints net() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    static void start(Context c) {
        PeriodicWorkRequest w = new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(net()).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("sync", ExistingPeriodicWorkPolicy.KEEP, w);
    }

    static void now(Context c) {
        OneTimeWorkRequest w = new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(net()).build();
        WorkManager.getInstance(c).enqueueUniqueWork("syncNow", ExistingWorkPolicy.REPLACE, w);
    }
}
