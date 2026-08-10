import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { formatDate } from '../utils/dateUtils'
import { MacIcon, MacPageHeader } from '../components/MacUI'

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
    <div className="mac-page">
      <MacPageHeader icon="history" title="시험 기록" />

      {error && (
        <div className="mac-alert mb-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={refresh} className="mac-button flex-shrink-0 px-2 text-xs">
              다시 시도
            </button>
          </div>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="mac-panel py-14 text-center text-gray-600">
          <MacIcon name="history" className="mx-auto mb-3 h-12 w-12" />
          <p className="text-sm font-bold">아직 시험 기록이 없어요</p>
        </div>
      ) : (
        <div>
          {tests.map((test) => {
            const pct = Math.round((test.correctCount / test.totalCount) * 100)
            return (
              <button
                key={test.id}
                onClick={() => setSelected(test)}
                className="mac-list-row mb-2 w-full p-4 text-left"
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
    <div className="mac-page">
      <div className="mac-page-header justify-start">
        <button onClick={onBack} className="mac-button h-9 min-h-0 w-9 p-0" title="기록 목록으로">
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
      <div className="mac-segment mb-4 w-fit max-w-full">
        {[
          { key: 'all', label: `전체 ${test.totalCount}` },
          { key: 'correct', label: `정답 ${test.correctCount}` },
          { key: 'incorrect', label: `오답 ${test.incorrectCount}` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`mac-segment-button ${filter === key ? 'mac-segment-button-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

        <div>
        {items.map((item, i) => (
          <div
            key={i}
            className={`mac-list-row mb-2 border-l-4 p-4 ${item.isCorrect ? 'border-l-green-600' : 'border-l-red-500'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{item.word}</span>
                  <span className={`mac-badge ${item.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
