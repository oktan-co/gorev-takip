// Firebase bilgilerini buraya yapıştır.
// Firebase Console > Proje ayarları > Genel > Web uygulaması > SDK kurulumu
export const firebaseConfig = {
  apiKey: "BURAYA_API_KEY",
  authDomain: "PROJE-ADI.firebaseapp.com",
  projectId: "PROJE-ADI",
  storageBucket: "PROJE-ADI.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

// Bildirimler için: Firebase Console > Proje ayarları > Cloud Messaging >
// Web yapılandırması > Web Push sertifikaları > Anahtar çifti oluştur
export const vapidKey = "BURAYA_VAPID_ANAHTARI";

// Kullanıcı adları Firebase'de bu alan adıyla saklanır (admin -> admin@gorev.local).
// Gerçek bir e-posta adresi olması gerekmez, değiştirmene gerek yok.
export const userDomain = "gorev.local";
