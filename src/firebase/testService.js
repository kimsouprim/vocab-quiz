import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs,
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
// 문서 ID: {date}_{listType} → 같은 날 같은 단어장은 합산, 다른 단어장은 별도 저장

export async function saveTest(uid, date, listType, data) {
  const id = `${date}_${listType}`
  const ref = doc(db, 'users', uid, 'tests', id)
  const existing = await getDoc(ref)

  if (existing.exists()) {
    // 같은 날 같은 단어장: 기록 합산
    const prev = existing.data()
    await updateDoc(ref, {
      items: [...(prev.items ?? []), ...data.items],
      correctCount: (prev.correctCount ?? 0) + data.correctCount,
      incorrectCount: (prev.incorrectCount ?? 0) + data.incorrectCount,
      totalCount: (prev.totalCount ?? 0) + data.totalCount,
      completedAt: new Date(),
    })
  } else {
    await setDoc(ref, { ...data, completedAt: new Date() })
  }
}

export async function getTest(uid, date, listType) {
  const id = `${date}_${listType}`
  const snap = await getDoc(doc(db, 'users', uid, 'tests', id))
  if (!snap.exists()) return null
  return snap.data()
}

export async function getAllTests(uid) {
  const snap = await getDocs(query(testsCol(uid), orderBy('completedAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
