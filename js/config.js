// ══════════════════════════════════════════════
// Firebase 設定
// ══════════════════════════════════════════════
// 步驟：
// 1. 前往 https://console.firebase.google.com
// 2. 新建專案（例如 "pilot-logbook"）
// 3. 啟用 Firestore Database（production mode）
// 4. 啟用 Authentication → Sign-in method → Google
// 5. 新增 Web App，複製設定值貼到下方
// 6. Firestore 安全規則設定為：
//    match /users/{uid}/{document=**} {
//      allow read, write: if request.auth.uid == uid;
//    }

export const firebaseConfig = {
  apiKey:            'AIzaSyCArGgLWdA1ExDLdpVEmBDteVWGDzLIhmI',
  authDomain:        'pilot-logbook-ef111.firebaseapp.com',
  projectId:         'pilot-logbook-ef111',
  storageBucket:     'pilot-logbook-ef111.firebasestorage.app',
  messagingSenderId: '814037098425',
  appId:             '1:814037098425:web:1f1cb378b253375e272068',
}

// GitHub Pages URL（用於 OAuth redirect）
// 部署後需在 Firebase Console → Authentication → Authorized domains 加入
export const APP_URL = 'https://karsten77114.github.io/Logbook'
