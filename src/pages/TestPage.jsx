import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { getCycle, startCycle, removeFromCycle, clearCycle } from '../firebase/cycleService'
import { getSession, saveSession, clearSession, saveTest } from '../firebase/testService'
import { batchUpdateWords } from '../firebase/wordService'
import { today } from '../utils/dateUtils'

const MIN_WORDS = 10

export default function TestPage() {
  const { user } = useAuth()
  const { allWords, correctWords, incorrectWords, cycle, session, refresh } = useData()
  const [phase, setPhase] = useState('setup') // setup | testing | grading | result
  const [localSession, setLocalSession] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)

  // Restore session on mount
  useEffect(() => {
    if (session?.phase) {
      setLocalSession(session)
      setPhase(session.phase)
      if (session.phase === 'testing') {
        setCurrentIdx(session.testItems.length)
      }
    }
  }, [session])

  const listMap = { all: allWords, correct: correctWords, incorrect: incorrectWords }
  const listLabels = { all: '전체 단어장', correct: '정답 단어장', incorrect: '오답 단어장' }

  // ── SETUP PHASE ──────────────────────────────────────────────
  async function handleStartTest(listType) {
    const dateStr = today()
    let cycleData = await getCycle(user.uid)

    // If no active cycle or different list, start a new one
    if (!cycleData?.activeList || cycleData.activeList !== listType || cycleData.remainingWordIds.length === 0) {
      const wordIds = listMap[listType].map((w) => w.id)
      if (wordIds.length < MIN_WORDS) {
        alert(`${listLabels[listType]}에 단어가 ${MIN_WORDS}개 이상 있어야 시험을 볼 수 있어요. (현재 ${wordIds.length}개)`)
        return
      }
      await startCycle(user.uid, listType, shuffle(wordIds))
      cycleData = await getCycle(user.uid)
    }

    const newSession = {
      date: dateStr,
      wordListType: listType,
      phase: 'testing',
      testItems: [],
      gradedItems: [],
      remainingAtStart: cycleData.remainingWordIds,
    }
    await saveSession(user.uid, newSession)
    setLocalSession(newSession)
    setCurrentIdx(0)
    setAnswer('')
    setPhase('testing')
    await refresh()
  }

  // ── TESTING PHASE ─────────────────────────────────────────────
  const currentCycleRemaining = cycle?.remainingWordIds ?? localSession?.remainingAtStart ?? []
  const wordPool = currentCycleRemaining
    .map((id) => allWords.find((w) => w.id === id))
    .filter(Boolean)

  const currentWord = wordPool[localSession?.testItems.length ?? 0]

  async function handleNext() {
    if (!answer.trim() || !currentWord) return

    const item = {
      wordId: currentWord.id,
      word: currentWord.word,
      meaning: currentWord.meaning,
      examples: currentWord.examples,
      incorrectCount: currentWord.incorrectCount,
      userAnswer: answer.trim(),
    }

    const newItems = [...(localSession?.testItems ?? []), item]
    const updated = { ...localSession, testItems: newItems }
    setLocalSession(updated)
    await saveSession(user.uid, updated)
    setAnswer('')
  }

  async function handleStop() {
    if ((localSession?.testItems?.length ?? 0) < MIN_WORDS) {
      alert(`최소 ${MIN_WORDS}개 이상 풀어야 중단할 수 있어요.`)
      return
    }
    const updated = { ...localSession, phase: 'grading' }
    setLocalSession(updated)
    await saveSession(user.uid, updated)
    setPhase('grading')
  }

  // ── GRADING PHASE ─────────────────────────────────────────────
  const [gradingIdx, setGradingIdx] = useState(0)
  const gradingItem = localSession?.testItems?.[gradingIdx]

  async function handleGrade(isCorrect) {
    const graded = { ...gradingItem, isCorrect }
    const newGraded = [...(localSession?.gradedItems ?? []), graded]

    if (gradingIdx + 1 < localSession.testItems.length) {
      const updated = { ...localSession, gradedItems: newGraded }
      setLocalSession(updated)
      await saveSession(user.uid, updated)
      setGradingIdx(gradingIdx + 1)
    } else {
      // All graded — finalize
      await finalizeTest(newGraded)
    }
  }

  async function finalizeTest(gradedItems) {
    const correct = gradedItems.filter((i) => i.isCorrect)
    const incorrect = gradedItems.filter((i) => !i.isCorrect)
    const dateStr = localSession.date

    // Update word statuses and incorrect counts
    const updates = gradedItems.map((item) => ({
      id: item.wordId,
      status: item.isCorrect ? 'correct' : 'incorrect',
      ...(item.isCorrect ? {} : { incorrectCount: item.incorrectCount + 1 }),
    }))
    await batchUpdateWords(user.uid, updates)

    // Remove tested words from cycle
    const testedIds = gradedItems.map((i) => i.wordId)
    const remaining = await removeFromCycle(user.uid, testedIds)

    // If cycle complete, clear it
    if (remaining.length === 0) {
      await clearCycle(user.uid)
    }

    // Save test record
    await saveTest(user.uid, dateStr, {
      date: dateStr,
      wordListType: localSession.wordListType,
      items: gradedItems,
      correctCount: correct.length,
      incorrectCount: incorrect.length,
      totalCount: gradedItems.length,
    })

    await clearSession(user.uid)
    await refresh()

    setResult({
      date: dateStr,
      listType: localSession.wordListType,
      correctCount: correct.length,
      incorrectCount: incorrect.length,
      totalCount: gradedItems.length,
      cycleComplete: remaining.length === 0,
    })
    setPhase('result')
  }

  // ── RENDER ────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <SetupView
        cycle={cycle}
        listLabels={listLabels}
        listMap={listMap}
        onStart={handleStartTest}
        session={session}
        onResume={() => {
          setPhase(session.phase)
          setLocalSession(session)
          if (session.phase === 'grading') setGradingIdx(session.gradedItems?.length ?? 0)
        }}
      />
    )
  }

  if (phase === 'testing') {
    if (!currentWord) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6">
          <p className="text-gray-500 mb-4">이 단어장의 모든 단어를 다 풀었어요!</p>
          <button onClick={handleStop} className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold">
            채점하기
          </button>
        </div>
      )
    }
    return (
      <TestingView
        word={currentWord}
        answer={answer}
        onAnswerChange={setAnswer}
        onNext={handleNext}
        onStop={handleStop}
        progress={localSession?.testItems?.length ?? 0}
        minWords={MIN_WORDS}
        total={wordPool.length}
      />
    )
  }

  if (phase === 'grading') {
    if (!gradingItem) return null
    return (
      <GradingView
        item={gradingItem}
        idx={gradingIdx}
        total={localSession.testItems.length}
        onGrade={handleGrade}
      />
    )
  }

  if (phase === 'result' && result) {
    return (
      <ResultView
        result={result}
        listLabels={listLabels}
        onDone={() => {
          setPhase('setup')
          setLocalSession(null)
          setResult(null)
          setGradingIdx(0)
        }}
      />
    )
  }

  return null
}

// ── SUB-COMPONENTS ────────────────────────────────────────────

function SetupView({ cycle, listLabels, listMap, onStart, session, onResume }) {
  const LIST_CONFIGS = [
    { key: 'all', icon: '📚', color: 'border-indigo-200 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
    { key: 'correct', icon: '✅', color: 'border-green-200 bg-green-50', badge: 'bg-green-100 text-green-700' },
    { key: 'incorrect', icon: '❌', color: 'border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700' },
  ]

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">시험</h1>

      {session?.phase && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
          <p className="text-sm font-semibold text-yellow-800 mb-1">진행 중인 시험이 있어요</p>
          <p className="text-xs text-yellow-600 mb-3">
            {session.date} · {listLabels[session.wordListType]} ·{' '}
            {session.phase === 'testing'
              ? `${session.testItems?.length ?? 0}개 완료`
              : `채점 중 (${session.gradedItems?.length ?? 0}/${session.testItems?.length ?? 0})`}
          </p>
          <button
            onClick={onResume}
            className="w-full py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold"
          >
            이어서 하기
          </button>
        </div>
      )}

      {cycle?.activeList && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-600">
          현재 사이클: <strong>{listLabels[cycle.activeList]}</strong> · 남은 단어 {cycle.remainingWordIds?.length ?? 0}개
        </div>
      )}

      <div className="space-y-3">
        {LIST_CONFIGS.map(({ key, icon, color, badge }) => {
          const count = listMap[key].length
          const isActive = cycle?.activeList === key
          const disabled = session?.phase && cycle?.activeList !== key
          return (
            <button
              key={key}
              onClick={() => !disabled && onStart(key)}
              disabled={!!disabled}
              className={`w-full p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] disabled:opacity-40 ${color}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <p className="font-semibold text-gray-800">{listLabels[key]}</p>
                    <p className="text-sm text-gray-500">단어 {count}개</p>
                  </div>
                </div>
                {isActive && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>진행 중</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-gray-400 text-center">
        하루 1회 · 최소 {MIN_WORDS}개 · 단어장 선택 시 현재 사이클 이어서 진행
      </p>
    </div>
  )
}

function TestingView({ word, answer, onAnswerChange, onNext, onStop, progress, minWords, total }) {
  const hintsToShow = word.incorrectCount > 0
    ? word.examples.slice(0, word.incorrectCount)
    : []

  function handleKeyDown(e) {
    if (e.key === 'Enter' && answer.trim()) onNext()
  }

  return (
    <div className="min-h-screen flex flex-col pb-24 pt-6 px-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-gray-500">
          {progress}번째 · 이 사이클 {total}개 남음
        </span>
        {progress >= minWords && (
          <button
            onClick={onStop}
            className="text-sm text-gray-400 border border-gray-200 px-3 py-1 rounded-lg"
          >
            중단 후 채점
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-6 text-center">
          <p className="text-4xl font-bold text-gray-900 mb-2">{word.word}</p>
          {word.incorrectCount > 0 && (
            <p className="text-sm text-red-400">오답 {word.incorrectCount}회</p>
          )}
        </div>

        {hintsToShow.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6">
            <p className="text-xs font-semibold text-amber-600 mb-2">예문 힌트</p>
            {hintsToShow.map((ex, i) => (
              <p key={i} className="text-sm text-gray-700 mb-1">
                <span className="text-amber-400 mr-1">{i + 1}.</span>{ex}
              </p>
            ))}
          </div>
        )}

        <textarea
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="한국어 뜻을 입력하세요"
          rows={3}
          className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none outline-none focus:border-primary-400 shadow-sm"
          autoFocus
        />

        <button
          onClick={onNext}
          disabled={!answer.trim()}
          className="mt-4 w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg shadow-sm disabled:opacity-40 active:scale-95 transition-all"
        >
          다음 →
        </button>
      </div>
    </div>
  )
}

function GradingView({ item, idx, total, onGrade }) {
  return (
    <div className="min-h-screen flex flex-col pb-24 pt-6 px-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">채점</h2>
        <span className="text-sm text-gray-500">{idx + 1} / {total}</span>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-4">
        {/* Word */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="text-3xl font-bold text-gray-900 mb-1">{item.word}</p>
          <p className="text-base text-gray-500 font-medium">{item.meaning}</p>
        </div>

        {/* Examples */}
        {item.examples.length > 0 && (
          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-400 mb-2">예문</p>
            {item.examples.map((ex, i) => (
              <p key={i} className="text-sm text-gray-600 mb-1">
                <span className="text-gray-400 mr-1">{i + 1}.</span>{ex}
              </p>
            ))}
          </div>
        )}

        {/* User answer */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-blue-400 mb-1">내 답</p>
          <p className="text-base text-gray-800">{item.userAnswer}</p>
        </div>

        {/* Grade buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => onGrade(false)}
            className="flex-1 py-5 bg-red-50 border-2 border-red-200 text-red-600 rounded-2xl text-2xl font-bold active:scale-95 transition-all"
          >
            ✕ 오답
          </button>
          <button
            onClick={() => onGrade(true)}
            className="flex-1 py-5 bg-green-50 border-2 border-green-200 text-green-600 rounded-2xl text-2xl font-bold active:scale-95 transition-all"
          >
            ○ 정답
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultView({ result, listLabels, onDone }) {
  const pct = Math.round((result.correctCount / result.totalCount) * 100)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center pb-24 px-6 max-w-lg mx-auto">
      <div className="text-5xl mb-4">{pct >= 80 ? '🎉' : pct >= 50 ? '📝' : '💪'}</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">시험 완료!</h2>
      <p className="text-sm text-gray-500 mb-8">{listLabels[result.listType]} · {result.date}</p>

      <div className="w-full bg-white rounded-3xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="text-center mb-6">
          <span className="text-5xl font-bold text-primary-600">{pct}%</span>
          <p className="text-sm text-gray-400 mt-1">정답률</p>
        </div>
        <div className="flex justify-around">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">{result.correctCount}</p>
            <p className="text-xs text-gray-400 mt-1">정답</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{result.incorrectCount}</p>
            <p className="text-xs text-gray-400 mt-1">오답</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{result.totalCount}</p>
            <p className="text-xs text-gray-400 mt-1">총 단어</p>
          </div>
        </div>
      </div>

      {result.cycleComplete && (
        <div className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl mb-6 text-center">
          <p className="text-sm font-semibold text-indigo-700">사이클 완료!</p>
          <p className="text-xs text-indigo-500 mt-1">모든 단어를 한 번씩 시험봤어요. 다음 사이클이 시작돼요.</p>
        </div>
      )}

      <button
        onClick={onDone}
        className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg"
      >
        확인
      </button>
    </div>
  )
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
