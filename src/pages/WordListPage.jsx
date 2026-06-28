import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'

const SEARCH_BADGES = {
  correct: 'bg-green-100 text-green-600',
  incorrect: 'bg-red-100 text-red-500',
  digested: 'bg-purple-100 text-purple-600',
}

const SEARCH_LABELS = {
  correct: '정답',
  incorrect: '오답',
  digested: '소화',
}

const LIST_TYPES = [
  { key: 'all',      label: '전체 단어장',    color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { key: 'correct',  label: '정답 단어장',    color: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'incorrect',label: '오답 단어장',    color: 'bg-red-50 text-red-700 border-red-200' },
  { key: 'digested', label: '소화한 단어장',  color: 'bg-purple-50 text-purple-700 border-purple-200' },
]

export default function WordListPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { uniqueWords, allWords, correctWords, incorrectWords, digestedWords, loading, error, refresh } = useData()
  const [active, setActive] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('default') // default | alpha-asc | alpha-desc | incorrect-asc | incorrect-desc

  const listMap = { all: allWords, correct: correctWords, incorrect: incorrectWords, digested: digestedWords }
  const rawWords = listMap[active] ?? []
  const q = searchQuery.trim().toLowerCase()

  const baseWords = q
    ? uniqueWords.filter((w) => w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
    : rawWords

  // 랜덤순: 탭 이동 후 돌아와도 순서 유지 (새로고침 시에만 재섞기)
  // allWords + digestedWords 합산 기반으로 섞어야 소화한 단어장 탭에서도 동작
  const shuffled = useMemo(() => {
    const allWordsData = [...allWords, ...digestedWords]
    try {
      const cached = JSON.parse(sessionStorage.getItem('wordlist-shuffle') ?? 'null')
      if (Array.isArray(cached) && cached.length === allWordsData.length && allWordsData.length > 0) {
        const restored = cached.map((id) => allWordsData.find((w) => w.id === id)).filter(Boolean)
        if (restored.length === allWordsData.length) return restored
      }
    } catch {}
    const result = [...allWordsData].sort(() => Math.random() - 0.5)
    try { sessionStorage.setItem('wordlist-shuffle', JSON.stringify(result.map((w) => w.id))) } catch {}
    return result
  }, [allWords.length, digestedWords.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const words = (() => {
    if (sortBy === 'alpha-asc')      return [...baseWords].sort((a, b) => a.word.localeCompare(b.word))
    if (sortBy === 'alpha-desc')     return [...baseWords].sort((a, b) => b.word.localeCompare(a.word))
    if (sortBy === 'incorrect-asc')  return [...baseWords].sort((a, b) => a.incorrectCount - b.incorrectCount)
    if (sortBy === 'incorrect-desc') return [...baseWords].sort((a, b) => b.incorrectCount - a.incorrectCount)
    if (sortBy === 'new-first')      return [...baseWords].sort((a, b) => {
      const ta = a.createdAt?.toDate?.()?.getTime() ?? 0
      const tb = b.createdAt?.toDate?.()?.getTime() ?? 0
      return tb - ta
    })
    // default: 오답 단어장은 예문 필요 단어 우선, 나머지는 랜덤
    if (!q && active === 'incorrect') {
      return [...baseWords].sort((a, b) => {
        const aNeedsEx = a.incorrectCount > 0 && a.examples.length < a.incorrectCount ? 1 : 0
        const bNeedsEx = b.incorrectCount > 0 && b.examples.length < b.incorrectCount ? 1 : 0
        return bNeedsEx - aNeedsEx
      })
    }
    if (sortBy === 'default') {
      const ids = new Set(baseWords.map((w) => w.id))
      return shuffled.filter((w) => ids.has(w.id))
    }
    return baseWords
  })()

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-3">
        <h1 className="text-xl font-bold text-gray-900">단어장</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/import')}
            className="text-xs px-3 py-1.5 bg-primary-50 text-primary-600 rounded-lg font-medium"
          >
            Excel 불러오기
          </button>
          <button
            onClick={logout}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg font-medium"
          >
            로그아웃
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={refresh} className="flex-shrink-0 font-semibold text-red-600">
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* 검색창 */}
      <div className="px-4 mb-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setExpanded(null) }}
            placeholder="단어 또는 뜻으로 검색"
            className="flex-1 text-sm outline-none bg-transparent"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs (검색 중엔 숨김) */}
      {!searchQuery && <div className="flex gap-2 px-4 mb-4 overflow-x-auto">
        {LIST_TYPES.map(({ key, label, color }) => {
          const count = listMap[key].length
          return (
            <button
              key={key}
              onClick={() => { setActive(key); setExpanded(null) }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                active === key ? color : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {label} <span className="ml-1 font-bold">{count}</span>
            </button>
          )
        })}
      </div>}

      {/* 정렬 */}
      <div className="flex gap-1.5 px-4 mb-3 overflow-x-auto">
        {[
          { key: 'default',        label: '랜덤순' },
          { key: 'new-first',      label: '최근 추가순' },
          { key: 'alpha-asc',      label: 'A→Z' },
          { key: 'alpha-desc',     label: 'Z→A' },
          { key: 'incorrect-desc', label: '오답 많은순' },
          { key: 'incorrect-asc',  label: '오답 적은순' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
              sortBy === key
                ? 'bg-gray-700 text-white border-gray-700'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Word list */}
      {words.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">단어가 없어요</p>
          {active === 'all' && (
            <button
              onClick={() => navigate('/import')}
              className="mt-4 text-sm text-primary-600 font-medium"
            >
              Excel 파일 불러오기 →
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {words.map((w) => {
            const needsExamples = w.incorrectCount > 0 && w.examples.length < w.incorrectCount
            const isOpen = expanded === w.id

            return (
              <div
                key={w.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpanded(isOpen ? null : w.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">{w.word}</span>
                      {q && SEARCH_BADGES[w.status] && (
                        <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${SEARCH_BADGES[w.status]}`}>
                          {SEARCH_LABELS[w.status]}
                        </span>
                      )}
                      {needsExamples && (
                        <span className="flex-shrink-0 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">
                          예문 추가 필요
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{w.meaning}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {w.incorrectCount > 0 && (
                      <span className="text-xs text-red-400 font-medium">오답 {w.incorrectCount}회</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/dictionary?q=${encodeURIComponent(w.word)}`) }}
                      className="p-1 text-gray-400 hover:text-primary-500 active:scale-90 transition-all"
                      title="사전 검색"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </button>
                    <ChevronIcon open={isOpen} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 pt-1 border-t border-gray-50">
                    {w.examples.length > 0 ? (
                      <div className="space-y-1.5">
                        {w.examples.map((ex, i) => (
                          <p key={i} className="text-sm text-gray-600">
                            <span className="text-gray-400 text-xs mr-1">{i + 1}.</span>{ex}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">예문 없음</p>
                    )}
                    {needsExamples && (
                      <p className="mt-2 text-xs text-orange-500">
                        오답 {w.incorrectCount}회 → 예문 {w.incorrectCount}개가 필요해요 (현재 {w.examples.length}개)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )
}
