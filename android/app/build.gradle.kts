plugins { id("com.android.application") }

// Sürüm numarasını GitHub derleme sırası verir (her derlemede bir artar)
val vCode = (project.findProperty("vcode") as String?)?.toIntOrNull() ?: 1

android {
    namespace = "co.oktan.gorev"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.oktan.gorev"
        minSdk = 26
        targetSdk = 34
        versionCode = vCode
        versionName = "1.$vCode"
    }

    // Güncellemelerin eskisinin üstüne kurulabilmesi için hep aynı anahtarla imzalanır.
    // Anahtar depoda değil, GitHub'daki ANDROID_KEYSTORE gizli ayarından gelir.
    val ks = file("../release.jks")
    signingConfigs {
        create("release") {
            storeFile = ks
            storePassword = "gorevler-apk"
            keyAlias = "gorev"
            keyPassword = "gorevler-apk"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (ks.exists()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.work:work-runtime:2.9.1")
    implementation("androidx.annotation:annotation:1.8.2")
    implementation("androidx.core:core:1.13.1")
}
