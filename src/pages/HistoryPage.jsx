import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { formatDate } from '../utils/dateUtils'

const listLabels = {
  all: '전체 단어장',
  correct: '정답 단어장',
  incorrect: '오답 단어장',
  digested: '소화한 단어장',
}

export default function HistoryPage() {
  const { tests, error, refresh } = useData()
  const [selected, setSelected] = useState(null)

  if (selected) {
    return <HistoryDetail test={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">시험 기록</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={refresh} className="flex-shrink-0 font-semibold text-red-600">
              다시 시도
            </button>
          </div>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">아직 시험 기록이 없어요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => {
            const pct = Math.round((test.correctCount / test.totalCount) * 100)
            return (
              <button
                key={test.id}
                onClick={() => setSelected(test)}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-primary-200 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-800">{formatDate(test.date)}</p>
                    <p className="text-xs text-gray-400">{listLabels[test.wordListType]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary-600">{pct}%</p>
                    <p className="text-xs text-gray-400">{test.totalCount}단어</p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-500 font-medium">정답 {test.correctCount}</span>
                  <span className="text-red-400 font-medium">오답 {test.incorrectCount}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HistoryDetail({ test, onBack }) {
  const [filter, setFilter] = useState('all') // all | correct | incorrect
  const items = (test.items ?? []).filter((item) => {
    if (filter === 'correct') return item.isCorrect
    if (filter === 'incorrect') return !item.isCorrect
    return true
  })

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="font-bold text-gray-900">{formatDate(test.date)}</h2>
          <p className="text-xs text-gray-400">{listLabels[test.wordListType]}</p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: `전체 ${test.totalCount}`, color: 'bg-gray-100 text-gray-700' },
          { key: 'correct', label: `정답 ${test.correctCount}`, color: 'bg-green-100 text-green-700' },
          { key: 'incorrect', label: `오답 ${test.incorrectCount}`, color: 'bg-red-100 text-red-700' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-opacity ${color} ${filter === key ? 'opacity-100' : 'opacity-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className={`bg-white rounded-xl border shadow-sm p-4 ${
              item.isCorrect ? 'border-green-100' : 'border-red-100'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{item.word}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${item.isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                    {item.isCorrect ? '○' : '✕'}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{item.meaning}</p>
                <p className="text-xs text-blue-400 mt-1">내 답: {item.userAnswer}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
