import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './config'

const cycleDoc = (uid) => doc(db, 'users', uid, 'cycle', 'current')

export async function getCycle(uid) {
  const snap = await getDoc(cycleDoc(uid))
  if (!snap.exists()) return null
  return snap.data()
}

export async function startCycle(uid, listType, wordIds) {
  await setDoc(cycleDoc(uid), {
    activeList: listType,
    remainingWordIds: [...wordIds],
    startedAt: new Date(),
  })
}

export async function removeFromCycle(uid, testedWordIds) {
  const cycle = await getCycle(uid)
  if (!cycle) return null
  const remaining = cycle.remainingWordIds.filter((id) => !testedWordIds.includes(id))
  await updateDoc(cycleDoc(uid), { remainingWordIds: remaining })
  return remaining
}

export async function clearCycle(uid) {
  await setDoc(cycleDoc(uid), {
    activeList: null,
    remainingWordIds: [],
    startedAt: null,
  })
}
