import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { MacIcon, MacPageHeader } from '../components/MacUI'

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

const MAX_EXAMPLES = 5

const LIST_TYPES = [
  { key: 'all',       label: '전체 단어장' },
  { key: 'correct',   label: '정답 단어장' },
  { key: 'incorrect', label: '오답 단어장' },
  { key: 'digested',  label: '소화한 단어장' },
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
        const aNeedsEx = a.incorrectCount > 0 && a.examples.length < Math.min(a.incorrectCount, MAX_EXAMPLES) ? 1 : 0
        const bNeedsEx = b.incorrectCount > 0 && b.examples.length < Math.min(b.incorrectCount, MAX_EXAMPLES) ? 1 : 0
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
    <div className="mac-page">
      <MacPageHeader
        icon="book"
        title="단어장"
        actions={(
          <>
          <button
            onClick={() => navigate('/import')}
            className="mac-button px-2.5 text-xs"
          >
            <MacIcon name="import" className="h-5 w-5" />
            <span className="hidden sm:inline">Excel </span>불러오기
          </button>
          <button
            onClick={logout}
            className="mac-button px-2.5 text-xs"
          >
            로그아웃
          </button>
          </>
        )}
      />

      {error && (
        <div className="mac-alert mb-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={refresh} className="mac-button flex-shrink-0 px-2 text-xs">
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* 검색창 */}
      <div className="mb-3">
        <div className="mac-field flex items-center gap-2 px-2.5 py-2">
          <MacIcon name="search" className="h-5 w-5 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setExpanded(null) }}
            placeholder="단어 또는 뜻으로 검색"
            className="flex-1 bg-transparent text-base outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="mac-icon-button h-7 w-7" title="검색어 지우기">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs (검색 중엔 숨김) */}
      {!searchQuery && <div className="mac-tabs mb-3">
        {LIST_TYPES.map(({ key, label }) => {
          const count = listMap[key].length
          return (
            <button
              key={key}
              onClick={() => { setActive(key); setExpanded(null) }}
              className={`mac-tab ${active === key ? 'mac-tab-active' : ''}`}
            >
              {label} <span className="ml-1 font-bold">{count}</span>
            </button>
          )
        })}
      </div>}

      {/* 정렬 */}
      <div className="mac-segment mb-3">
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
            className={`mac-segment-button ${sortBy === key ? 'mac-segment-button-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Word list */}
      {words.length === 0 ? (
        <div className="mac-panel py-14 text-center text-gray-600">
          <MacIcon name="empty" className="mx-auto mb-3 h-12 w-12" />
          <p className="text-sm font-bold">단어가 없어요</p>
          {active === 'all' && (
            <button
              onClick={() => navigate('/import')}
              className="mac-button mt-4 px-4 text-sm"
            >
              Excel 파일 불러오기 →
            </button>
          )}
        </div>
      ) : (
        <div>
          {words.map((w) => {
            const needsExamples = w.incorrectCount > 0 && w.examples.length < Math.min(w.incorrectCount, MAX_EXAMPLES)
            const isOpen = expanded === w.id

            return (
              <div
                key={w.id}
                className="mac-list-row"
              >
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpanded(isOpen ? null : w.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">{w.word}</span>
                      {q && SEARCH_BADGES[w.status] && (
                        <span className={`mac-badge flex-shrink-0 ${SEARCH_BADGES[w.status]}`}>
                          {SEARCH_LABELS[w.status]}
                        </span>
                      )}
                      {needsExamples && (
                        <span className="mac-badge flex-shrink-0 bg-orange-100 text-orange-700">
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
                      className="mac-icon-button"
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
                  <div className="border-t border-gray-500 bg-white px-4 pb-3 pt-3">
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
                      <p className="mt-2 text-xs font-medium text-orange-500">
                        오답 {w.incorrectCount}회
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
    <div className="mac-loading">
      <div>
        <p className="mb-2 text-center text-sm font-bold">단어장 여는 중...</p>
        <div className="mac-progress" />
      </div>
    </div>
  )
}
