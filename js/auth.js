// ══════════════════════════════════════════════
// Firebase Authentication
// ══════════════════════════════════════════════
import { initializeApp }                          from 'firebase/app'
import { getAuth, GoogleAuthProvider, OAuthProvider,
         signInWithPopup, signInWithRedirect,
         getRedirectResult, onAuthStateChanged,
         signOut }                                from 'firebase/auth'
import { firebaseConfig }                         from './config.js'

let _app, _auth

export function initFirebase() {
  _app  = initializeApp(firebaseConfig)
  _auth = getAuth(_app)
  return { app: _app, auth: _auth }
}

export function getFirebaseAuth() { return _auth }
export function getFirebaseApp()  { return _app }

/**
 * Google 登入（iOS Safari 用 redirect，桌面用 popup）
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (isIOS) {
    await signInWithRedirect(_auth, provider)
    return null // redirect，結果在下次載入時取得
  } else {
    const result = await signInWithPopup(_auth, provider)
    return result.user
  }
}

/**
 * Apple 登入（需要 Apple Developer 設定）
 */
export async function signInWithApple() {
  const provider = new OAuthProvider('apple.com')
  provider.addScope('name')
  provider.addScope('email')
  provider.setCustomParameters({ locale: 'zh-TW' })

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (isIOS) {
    await signInWithRedirect(_auth, provider)
    return null
  } else {
    const result = await signInWithPopup(_auth, provider)
    return result.user
  }
}

/**
 * 處理 redirect 結果（iOS 登入後回來時呼叫）
 */
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(_auth)
    return result?.user || null
  } catch (e) {
    console.error('Redirect result error:', e)
    return null
  }
}

/**
 * 監聽 auth 狀態變化
 */
export function onAuth(callback) {
  return onAuthStateChanged(_auth, callback)
}

/**
 * 登出
 */
export async function logout() {
  await signOut(_auth)
}

/**
 * 目前登入使用者
 */
export function currentUser() {
  return _auth?.currentUser || null
}
