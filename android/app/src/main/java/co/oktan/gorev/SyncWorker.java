package co.oktan.gorev;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (Store.uid(c) == null) return Result.success();
        try {
            Remote.pullPlan(c);
        } catch (Exception e) {
            Scheduler.apply(c, false);
            return Result.success();
        }
        Scheduler.apply(c, false);
        long last = Store.p(c).getLong("nativeMarked", 0);
        if (System.currentTimeMillis() - last > 6L * 3600000L) {
            try { Remote.markNative(c); } catch (Exception ignored) { }
        }
        return Result.success();
    }
}
