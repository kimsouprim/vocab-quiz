import {
  collection, doc, getDocs, setDoc, updateDoc,
  query, orderBy, writeBatch, getDoc,
} from 'firebase/firestore'
import { db } from './config'

const wordsCol = (uid) => collection(db, 'users', uid, 'words')
const wordDoc = (uid, wordId) => doc(db, 'users', uid, 'words', wordId)

// 단어 정규화: 소문자 + 앞뒤 공백 제거 + 연속 공백 단일화
function normalizeKey(word) {
  return word.toLowerCase().trim().replace(/\s+/g, ' ')
}

// existingWords: DataContext에서 받아서 재조회 생략 (없으면 직접 fetch)
export async function importWords(uid, rows, existingWords = null) {
  const existing = existingWords ?? await getAllWords(uid)
  const existingMap = Object.fromEntries(existing.map((w) => [normalizeKey(w.word), w]))
  const incomingKeys = new Set(rows.map((r) => normalizeKey(r.word)))

  const batch = writeBatch(db)
  let added = 0
  let updated = 0
  let removed = 0
  const resultWords = []

  // 추가 또는 업데이트
  for (const row of rows) {
    const key = normalizeKey(row.word)
    if (existingMap[key]) {
      const existing = existingMap[key]
      batch.update(wordDoc(uid, existing.id), { examples: row.examples, meaning: row.meaning })
      resultWords.push({ ...existing, examples: row.examples, meaning: row.meaning })
      updated++
    } else {
      const ref = doc(wordsCol(uid))
      const newWord = {
        word: row.word.trim(),
        meaning: row.meaning.trim(),
        examples: row.examples,
        incorrectCount: 0,
        status: 'untested',
        createdAt: new Date(),
      }
      batch.set(ref, newWord)
      resultWords.push({ id: ref.id, ...newWord })
      added++
    }
  }

  // Excel에 없는 단어 삭제
  for (const w of existing) {
    if (!incomingKeys.has(normalizeKey(w.word))) {
      batch.delete(wordDoc(uid, w.id))
      removed++
    }
  }

  await batch.commit()
  return { added, updated, removed, words: resultWords }
}

export async function getAllWords(uid) {
  const snap = await getDocs(query(wordsCol(uid), orderBy('createdAt', 'asc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function updateWordStatus(uid, wordId, status) {
  await updateDoc(wordDoc(uid, wordId), { status })
}

export async function incrementIncorrectCount(uid, wordId) {
  const snap = await getDoc(wordDoc(uid, wordId))
  const current = snap.data()?.incorrectCount ?? 0
  await updateDoc(wordDoc(uid, wordId), { incorrectCount: current + 1 })
}

export async function batchUpdateWords(uid, updates) {
  // updates: [{ id, status?, incorrectCount? }]
  const batch = writeBatch(db)
  for (const u of updates) {
    const ref = wordDoc(uid, u.id)
    const fields = {}
    if (u.status !== undefined) fields.status = u.status
    if (u.incorrectCount !== undefined) fields.incorrectCount = u.incorrectCount
    batch.update(ref, fields)
  }
  await batch.commit()
}
