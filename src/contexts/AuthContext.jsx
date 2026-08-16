import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { auth } from '../firebase/config'

const AuthContext = createContext(null)
const REDIRECT_FALLBACK_ERRORS = new Set([
  'auth/operation-not-supported-in-this-environment',
  'auth/popup-blocked',
  'auth/web-storage-unsupported',
])

function shouldUseRedirect() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const mobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  return mobileDevice || standalone
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u ?? null))
    getRedirectResult(auth).catch((error) => {
      console.error('[AuthContext] redirect login failed:', error)
      setAuthError(error)
    })
    return unsubscribe
  }, [])

  async function login() {
    setAuthError(null)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })

    try {
      if (shouldUseRedirect()) {
        await signInWithRedirect(auth, provider)
        return
      }
      await signInWithPopup(auth, provider)
    } catch (error) {
      if (REDIRECT_FALLBACK_ERRORS.has(error?.code)) {
        await signInWithRedirect(auth, provider)
        return
      }
      console.error('[AuthContext] Google login failed:', error)
      setAuthError(error)
      throw error
    }
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, login, logout, authError, clearAuthError: () => setAuthError(null) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
