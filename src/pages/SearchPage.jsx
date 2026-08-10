import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { MacIcon, MacPageHeader } from '../components/MacUI'

export default function SearchPage() {
  const { allWords } = useData()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const results = q.length < 1
    ? []
    : allWords.filter(
        (w) =>
          w.word.toLowerCase().includes(q) ||
          w.meaning.toLowerCase().includes(q)
      )

  return (
    <div className="mac-page">
      <MacPageHeader icon="search" title="단어 검색" />

      <div className="mb-4">
        <div className="mac-field flex items-center gap-2 px-3 py-2.5">
          <MacIcon name="search" className="h-5 w-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="영단어 또는 뜻으로 검색"
            className="flex-1 bg-transparent text-base outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="mac-icon-button h-7 w-7" title="검색어 지우기">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div>
        {q.length > 0 && results.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">검색 결과가 없어요</p>
        )}
        {results.map((w) => (
          <SearchResultCard key={w.id} word={w} />
        ))}
      </div>
    </div>
  )
}

function SearchResultCard({ word: w }) {
  const [open, setOpen] = useState(false)
  const statusColors = {
    untested: 'bg-gray-100 text-gray-500',
    correct: 'bg-green-100 text-green-600',
    incorrect: 'bg-red-100 text-red-600',
  }
  const statusLabels = { untested: '미시험', correct: '정답', incorrect: '오답' }

  return (
    <div className="mac-list-row">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{w.word}</span>
            <span className={`mac-badge ${statusColors[w.status]}`}>
              {statusLabels[w.status]}
            </span>
          </div>
          <p className="text-sm text-gray-500">{w.meaning}</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && w.examples.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-500 bg-white px-4 pb-3 pt-3">
          {w.examples.map((ex, i) => (
            <p key={i} className="text-sm text-gray-600">
              <span className="text-gray-400 text-xs mr-1">{i + 1}.</span>{ex}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
