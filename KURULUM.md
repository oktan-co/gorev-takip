# Görevlerim — kurulum

Sırayla git, her adım 2-3 dakika. Takıldığın yerde bana yaz.

---

## 1. Firebase projesi

1. https://console.firebase.google.com → **Proje ekle** → isim: `gorev-takip` → Analytics'e gerek yok.
2. Sol menü **Build > Authentication** → *Başlayın* → **E-posta/Şifre** → etkinleştir → kaydet.
3. **Users** sekmesi → *Kullanıcı ekle*:
   - E-posta: `admin@gorev.local`
   - Şifre: `222222`
   - Eklendikten sonra satırdaki **Kullanıcı UID**'sini kopyala (uzun bir metin).
4. Sol menü **Build > Firestore Database** → *Veritabanı oluştur* → konum **eur3 (europe-west)** → *Production mode*.

## 2. Yönetici kartını ekle

Firestore'da **Koleksiyon başlat**:

- Koleksiyon adı: `users`
- Belge kimliği: *(3. adımda kopyaladığın UID)*
- Alanlar:

| Alan | Tip | Değer |
|---|---|---|
| `username` | string | `admin` |
| `displayName` | string | `Emre` |
| `role` | string | `admin` |

Bu kart olmadan hiçbir hesap veriye erişemez — Firebase'e dışarıdan kaydolan birine karşı koruma budur.

## 3. Güvenlik kuralları

Firestore > **Rules** sekmesi → içindekini sil, `firestore.rules` dosyasının tamamını yapıştır → **Yayınla**.

## 4. Web ayarlarını dosyaya yaz

1. **Proje ayarları (dişli) > Genel** → en altta *Uygulamalarınız* → **</>** (Web) ikonu → takma ad `gorev` → kaydet.
2. Çıkan `firebaseConfig` bloğundaki değerleri `firebase-config.js` içine yapıştır.
3. **Proje ayarları > Cloud Messaging** → *Web yapılandırması* → **Anahtar çifti oluştur** → çıkan anahtarı `firebase-config.js` içindeki `vapidKey` alanına yapıştır.

## 5. GitHub'a yükle

1. Yeni bir repo aç (`gorev-takip`).
2. Bu klasördeki **tüm dosyaları** (`.github` klasörü dahil) repoya yükle.
3. Repo **Settings > Pages** → Source: *Deploy from a branch* → Branch: `main` / `root` → Save.
4. Birkaç dakika sonra adres hazır: `https://KULLANICI-ADIN.github.io/gorev-takip/`

Repoyu herkese açık yaparsan `firebase-config.js` içindeki bilgiler görünür olur. Bu normaldir (Firebase web anahtarları gizli bilgi değildir); verini koruyan şey 3. adımdaki kurallardır.

## 6. Hatırlatma otomasyonu

1. Firebase **Proje ayarları > Hizmet hesapları** → *Yeni özel anahtar oluştur* → inen JSON dosyasını aç, **tamamını** kopyala.
2. GitHub repo **Settings > Secrets and variables > Actions**:
   - *New repository secret* → isim `FIREBASE_SERVICE_ACCOUNT` → değer: kopyaladığın JSON.
   - *Variables* sekmesi → *New variable* → isim `APP_URL` → değer: 5. adımdaki site adresin.
3. **Actions** sekmesi → *Görev hatırlatması* → **Run workflow** diyerek elle test et.

Bu JSON dosyası veritabanının tam yetkili anahtarıdır — sadece GitHub secret'ına koy, repoya dosya olarak yükleme.

Nasıl çalışır: iş akışı her saat başı çalışır, uygulamadaki **Ayarlar > Saat** değerine bakar, sadece o saatte bildirim gönderir. Saati telefondan değiştirdiğinde otomasyon da onu takip eder.

Bilmen gereken iki şey:
- GitHub'ın zamanlayıcısı yoğun saatlerde 5-15 dakika gecikebilir. 11:00 yerine 11:10'da gelebilir.
- Repoda 60 gün hiç hareket olmazsa GitHub zamanlanmış işleri durdurur ve e-posta atar; Actions sekmesinden tek tıkla yeniden açarsın.

## 7. Telefon

1. Siteyi Chrome'da aç, `admin` / `222222` ile gir.
2. Menü (⋮) → **Ana ekrana ekle**. Uygulama gibi açılır.
3. İçeriden **Ayarlar > Bu cihaza bildirim gönder > İzin ver**.
4. Aynısını bilgisayarda da yap (orada da izin ver), böylece hatırlatma iki cihaza birden gider.

İlk iş olarak **Ayarlar > Şifre değiştir**'den şifreyi değiştir.

---

## Kullanım notları

- **Gruplar ve listeler:** Yan menüde *+ Grup* ile "Domino's Pizza" gibi bir grup aç, *Yeni liste* ile içine şube listeleri ekle.
- **Bugüne al:** Tarihsiz bir görevin yanındaki ↗ işareti onu bugüne taşır.
- **Gecikmiş:** Tarihi geçen görev kaybolmaz; Bugün ekranının en üstünde kırmızı "3 gün gecikti" etiketiyle durur.
- **Hangi listeler hatırlatılsın:** Ayarlar ekranında her listenin kendi anahtarı var.
- **Paylaşım:** Ayarlar > Kullanıcılar'dan kişi ekle (örn. `serik` kullanıcısı), sonra o kişiyi Serik listesine ekle. O kişi girdiğinde sadece kendi listelerini görür. Göreve tıklayıp "Atanan kişi" seçersen görev o kişide de görünür.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html`, `app.css`, `app.js` | Uygulamanın kendisi |
| `firebase-config.js` | Senin doldurduğun ayarlar |
| `firebase-messaging-sw.js` | Arka plan bildirimleri |
| `manifest.json`, `icon-*.png` | Ana ekrana eklenince uygulama görünümü |
| `firestore.rules` | Veritabanı güvenlik kuralları (Firebase'e yapıştırılır) |
| `scripts/reminder.mjs` | Hatırlatmayı gönderen betik |
| `.github/workflows/hatirlatma.yml` | Saatlik otomasyon |
