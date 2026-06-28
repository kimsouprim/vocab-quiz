import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getAllWords } from '../firebase/wordService'
import { getCycle } from '../firebase/cycleService'
import { getSession, getAllTests } from '../firebase/testService'
import { normalizeWordKey } from '../utils/wordUtils'

const DataContext = createContext(null)

function describeError(error) {
  const code = error?.code ? String(error.code) : ''
  const message = error?.message ? String(error.message) : ''
  if (code && message) return `${code}: ${message}`
  return code || message || '알 수 없는 오류'
}

const statusPriority = { digested: 4, incorrect: 3, correct: 2, untested: 1 }

function getStatusPriority(word) {
  return statusPriority[word?.status] ?? statusPriority.untested
}

function getCreatedTime(word) {
  return word?.createdAt?.toDate?.()?.getTime?.() ?? 0
}

function pickCanonicalWord(a, b) {
  if (!a) return b
  if (getStatusPriority(b) !== getStatusPriority(a)) {
    return getStatusPriority(b) > getStatusPriority(a) ? b : a
  }
  if ((b?.incorrectCount ?? 0) !== (a?.incorrectCount ?? 0)) {
    return (b?.incorrectCount ?? 0) > (a?.incorrectCount ?? 0) ? b : a
  }
  return getCreatedTime(b) > getCreatedTime(a) ? b : a
}

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [words, setWords] = useState([])
  const [cycle, setCycle] = useState(null)
  const [session, setSession] = useState(null)
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!user) return

    const requests = [
      ['단어장', getAllWords(user.uid), setWords],
      ['사이클', getCycle(user.uid), setCycle],
      ['진행 중인 시험', getSession(user.uid), (s) => setSession(s?.phase ? s : null)],
      ['시험 기록', getAllTests(user.uid), setTests],
    ]

    const results = await Promise.allSettled(requests.map(([, request]) => request))
    const failed = []

    results.forEach((result, index) => {
      const [label,, apply] = requests[index]
      if (result.status === 'fulfilled') {
        apply(result.value)
      } else {
        failed.push(`${label} (${describeError(result.reason)})`)
        console.error(`[DataContext] ${label} load failed:`, result.reason)
      }
    })

    setError(failed.length ? `${failed.join(', ')} 데이터를 불러오지 못했어요.` : null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (user) {
      setLoading(true)
      refresh().catch((err) => {
        console.error('[DataContext] refresh failed:', err)
        setError('데이터를 불러오지 못했어요.')
        setLoading(false)
      })
    } else if (user === null) {
      setWords([])
      setCycle(null)
      setSession(null)
      setTests([])
      setError(null)
      setLoading(false)
    }
  }, [user, refresh])

  const uniqueWordMap = new Map()
  for (const w of words) {
    const key = normalizeWordKey(w.word)
    uniqueWordMap.set(key, pickCanonicalWord(uniqueWordMap.get(key), w))
  }
  const uniqueWords = [...uniqueWordMap.values()]

  const allWords = uniqueWords.filter((w) => w.status !== 'digested')
  const correctWords = uniqueWords.filter((w) => w.status === 'correct')
  const incorrectWords = uniqueWords.filter((w) => w.status === 'incorrect')
  const digestedWords = uniqueWords.filter((w) => w.status === 'digested')

  return (
    <DataContext.Provider value={{
      words, uniqueWords, allWords, correctWords, incorrectWords, digestedWords,
      cycle, session, tests,
      loading, error, refresh, setWords,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
