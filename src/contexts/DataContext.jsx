import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getAllWords } from '../firebase/wordService'
import { getCycle } from '../firebase/cycleService'
import { getSession, getAllTests } from '../firebase/testService'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [words, setWords] = useState([])
  const [cycle, setCycle] = useState(null)
  const [session, setSession] = useState(null)
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) return
    const [w, c, s, t] = await Promise.all([
      getAllWords(user.uid),
      getCycle(user.uid),
      getSession(user.uid),
      getAllTests(user.uid),
    ])
    setWords(w)
    setCycle(c)
    setSession(s?.phase ? s : null)
    setTests(t)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (user) {
      setLoading(true)
      refresh()
    } else if (user === null) {
      setWords([])
      setCycle(null)
      setSession(null)
      setTests([])
      setLoading(false)
    }
  }, [user, refresh])

  const allWords = words
  const correctWords = words.filter((w) => w.status === 'correct')
  const incorrectWords = words.filter((w) => w.status === 'incorrect')

  return (
    <DataContext.Provider value={{
      words, allWords, correctWords, incorrectWords,
      cycle, session, tests,
      loading, refresh, setWords,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
