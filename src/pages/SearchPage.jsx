import { useState } from 'react'
import { useData } from '../contexts/DataContext'

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
    <div className="min-h-screen pb-24 pt-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4 px-4">단어 검색</h1>

      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="영단어 또는 뜻으로 검색"
            className="flex-1 text-sm outline-none bg-transparent"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-4 space-y-2">
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{w.word}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColors[w.status]}`}>
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
        <div className="px-4 pb-3 pt-1 border-t border-gray-50 space-y-1.5">
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
