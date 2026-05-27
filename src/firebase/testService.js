import {
  doc, getDoc, setDoc, collection, getDocs,
  query, orderBy,
} from 'firebase/firestore'
import { db } from './config'

const sessionDoc = (uid) => doc(db, 'users', uid, 'session', 'current')
const testDoc = (uid, date) => doc(db, 'users', uid, 'tests', date)
const testsCol = (uid) => collection(db, 'users', uid, 'tests')

// --- In-progress session ---

export async function getSession(uid) {
  const snap = await getDoc(sessionDoc(uid))
  if (!snap.exists()) return null
  return snap.data()
}

export async function saveSession(uid, sessionData) {
  await setDoc(sessionDoc(uid), sessionData)
}

export async function clearSession(uid) {
  await setDoc(sessionDoc(uid), { phase: null, testItems: [], gradedItems: [], date: null, wordListType: null })
}

// --- Completed tests ---

export async function saveTest(uid, date, data) {
  await setDoc(testDoc(uid, date), { ...data, completedAt: new Date() })
}

export async function getTest(uid, date) {
  const snap = await getDoc(testDoc(uid, date))
  if (!snap.exists()) return null
  return snap.data()
}

export async function getAllTests(uid) {
  const snap = await getDocs(query(testsCol(uid), orderBy('completedAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
