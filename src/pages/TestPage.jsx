import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { getCycle, startCycle, removeFromCycle, clearCycle } from '../firebase/cycleService'
import { getSession, saveSession, clearSession, saveTest } from '../firebase/testService'
import { batchUpdateWords } from '../firebase/wordService'
import { today } from '../utils/dateUtils'

const MIN_WORDS = 10

export default function TestPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { allWords, correctWords, incorrectWords, cycle, session, refresh } = useData()

  const [phase, setPhase] = useState('setup') // setup | testing | result
  const [localSession, setLocalSession] = useState(null)
  // wordPhase: 'input' → user typing | 'revealed' → answer shown, waiting O/X
  const [wordPhase, setWordPhase] = useState('input')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  const listMap = { all: allWords, correct: correctWords, incorrect: incorrectWords }
  const listLabels = { all: '전체 단어장', correct: '정답 단어장', incorrect: '오답 단어장' }

  // Restore in-progress session (날짜 바뀌면 자동 마무리)
  // sessionStorage 우선 복원 → 사전 탭 이동 후 돌아와도 진행 상태 유지
  const sessionRestored = useRef(false)
  useEffect(() => {
    if (sessionRestored.current) return
    if (session === undefined) return // 아직 DataContext 로딩 중
    sessionRestored.current = true

    // sessionStorage에 저장된 진행 상태가 있으면 우선 복원
    try {
      const stored = JSON.parse(sessionStorage.getItem('test-local-session') ?? 'null')
      if (stored?.phase === 'testing' && stored.date === today()) {
        setLocalSession(stored)
        setPhase('testing')
        setWordPhase(sessionStorage.getItem('test-word-phase') ?? 'input')
        setAnswer(sessionStorage.getItem('test-answer') ?? '')
        return
      }
    } catch {}

    // sessionStorage 없으면 Firestore 세션으로 복원
    if (!session?.phase) return
    if (session.phase === 'testing' && session.date < today()) {
      autoFinalizeSession(session)
    } else if (session.phase === 'testing') {
      setLocalSession(session)
      setPhase('testing')
      setWordPhase('input')
    }
  }, [session]) // eslint-disable-line

  async function autoFinalizeSession(sess) {
    try {
      sessionStorage.removeItem('test-local-session')
      sessionStorage.removeItem('test-word-phase')
      sessionStorage.removeItem('test-answer')
    } catch {}
    const items = sess.testItems ?? []
    if (items.length > 0) {
      await runFinalize(items, sess)
    } else {
      await clearSession(user.uid)
    }
    await refresh()
  }

  // Focus input when word phase is 'input'
  useEffect(() => {
    if (phase === 'testing' && wordPhase === 'input') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [phase, wordPhase, localSession?.testItems?.length])

  // Current word from cycle
  const cycleRemaining = cycle?.remainingWordIds ?? localSession?.remainingAtStart ?? []
  const answeredIds = new Set((localSession?.testItems ?? []).map((i) => i.wordId))
  const wordPool = cycleRemaining
    .filter((id) => !answeredIds.has(id))
    .map((id) => allWords.find((w) => w.id === id))
    .filter(Boolean)
  const currentWord = wordPool[0] ?? null

  const answeredCount = localSession?.testItems?.length ?? 0
  const canStop = answeredCount > 0 && answeredCount % 5 === 0

  // ── START TEST ────────────────────────────────────────────────
  async function handleStart(listType) {
    const dateStr = today()
    let cycleData = await getCycle(user.uid)

    if (!cycleData?.activeList || cycleData.activeList !== listType || cycleData.remainingWordIds.length === 0) {
      const wordIds = listMap[listType].map((w) => w.id)
      if (wordIds.length < MIN_WORDS) {
        alert(`${listLabels[listType]}에 단어가 ${MIN_WORDS}개 이상 있어야 해요. (현재 ${wordIds.length}개)`)
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
      remainingAtStart: cycleData.remainingWordIds,
    }
    await saveSession(user.uid, newSession)
    setLocalSession(newSession)
    setWordPhase('input')
    setAnswer('')
    setPhase('testing')
    try {
      sessionStorage.setItem('test-local-session', JSON.stringify(newSession))
      sessionStorage.setItem('test-word-phase', 'input')
      sessionStorage.removeItem('test-answer')
    } catch {}
    await refresh()
  }

  // ── SUBMIT ANSWER → reveal ────────────────────────────────────
  function handleSubmit() {
    if (!answer.trim() || !currentWord) return
    setWordPhase('revealed')
    try {
      sessionStorage.setItem('test-word-phase', 'revealed')
      sessionStorage.setItem('test-answer', answer.trim())
    } catch {}
  }

  // ── GRADE O/X → save & next word ─────────────────────────────
  async function handleGrade(isCorrect) {
    if (!currentWord) return
    const item = {
      wordId: currentWord.id,
      word: currentWord.word,
      meaning: currentWord.meaning,
      examples: currentWord.examples,
      incorrectCount: currentWord.incorrectCount,
      userAnswer: answer.trim(),
      isCorrect,
    }
    const newItems = [...(localSession?.testItems ?? []), item]
    const updated = { ...localSession, testItems: newItems }
    // 세 state를 동시에 업데이트해서 중간 렌더링 방지
    setAnswer('')
    setWordPhase('input')
    setLocalSession(updated)
    try {
      sessionStorage.setItem('test-local-session', JSON.stringify(updated))
      sessionStorage.setItem('test-word-phase', 'input')
      sessionStorage.removeItem('test-answer')
    } catch {}
    await saveSession(user.uid, updated)
  }

  // ── 일시정지 ──────────────────────────────────────────────────
  async function handlePause() {
    try {
      sessionStorage.removeItem('test-local-session')
      sessionStorage.removeItem('test-word-phase')
      sessionStorage.removeItem('test-answer')
    } catch {}
    setPhase('setup')
    setWordPhase('input')
    setAnswer('')
    await refresh()
  }

  // ── 오늘 시험 마무리 ──────────────────────────────────────────
  async function handleFinish() {
    try {
      sessionStorage.removeItem('test-local-session')
      sessionStorage.removeItem('test-word-phase')
      sessionStorage.removeItem('test-answer')
    } catch {}
    const cycleComplete = await runFinalize(localSession.testItems, localSession)
    await refresh()
    setResult({
      correctCount: localSession.testItems.filter((i) => i.isCorrect).length,
      incorrectCount: localSession.testItems.filter((i) => !i.isCorrect).length,
      totalCount: localSession.testItems.length,
      listType: localSession.wordListType,
      cycleComplete,
    })
    setPhase('result')
  }

  // 공통 마무리 로직 (직접 호출 + 자동 마무리 공유)
  async function runFinalize(items, sess) {
    const correctItems = items.filter((i) => i.isCorrect)
    const incorrectItems = items.filter((i) => !i.isCorrect)

    const updates = items.map((item) => ({
      id: item.wordId,
      status: item.isCorrect ? 'correct' : 'incorrect',
      ...(item.isCorrect ? {} : { incorrectCount: item.incorrectCount + 1 }),
    }))
    await batchUpdateWords(user.uid, updates)

    const testedIds = items.map((i) => i.wordId)
    const remaining = await removeFromCycle(user.uid, testedIds)
    if (remaining.length === 0) await clearCycle(user.uid)

    // 같은 날 같은 단어장이면 합산, 다른 단어장이면 별도 저장
    await saveTest(user.uid, sess.date, sess.wordListType, {
      date: sess.date,
      wordListType: sess.wordListType,
      items,
      correctCount: correctItems.length,
      incorrectCount: incorrectItems.length,
      totalCount: items.length,
    })

    await clearSession(user.uid)
    return remaining.length === 0 // cycleComplete
  }

  // ── RENDER ────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <SetupView
        cycle={cycle}
        listLabels={listLabels}
        listMap={listMap}
        onStart={handleStart}
        pausedSession={session?.phase === 'testing' ? session : null}
        onResume={() => {
          setLocalSession(session)
          setPhase('testing')
          setWordPhase('input')
          setAnswer('')
        }}
      />
    )
  }

  if (phase === 'testing') {
    // All cycle words done mid-session
    if (!currentWord && answeredCount < MIN_WORDS) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-4">
          <p className="text-gray-500 text-center">이 사이클의 모든 단어를 다 풀었어요!</p>
          <button onClick={handleFinish} className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold">
            결과 보기
          </button>
        </div>
      )
    }

    if (!currentWord) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-4">
          <p className="text-2xl">🎉</p>
          <p className="text-gray-700 font-semibold">사이클 완료! 모든 단어를 풀었어요.</p>
          <button onClick={handleFinish} className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold">
            오늘 시험 마무리
          </button>
        </div>
      )
    }

    return (
      <TestingView
        word={currentWord}
        answer={answer}
        onAnswerChange={setAnswer}
        onSubmit={handleSubmit}
        onGrade={handleGrade}
        onPause={handlePause}
        onFinish={handleFinish}
        wordPhase={wordPhase}
        answeredCount={answeredCount}
        canStop={canStop}
        remaining={wordPool.length}
        inputRef={inputRef}
        listLabel={listLabels[localSession?.wordListType]}
        prevItems={localSession?.testItems ?? []}
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
          navigate('/history')
        }}
      />
    )
  }

  return null
}

// ── SETUP ─────────────────────────────────────────────────────

function SetupView({ cycle, listLabels, listMap, onStart, pausedSession, onResume }) {
  const LIST_CONFIGS = [
    { key: 'all', icon: '📚', color: 'border-indigo-200 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
    { key: 'correct', icon: '✅', color: 'border-green-200 bg-green-50', badge: 'bg-green-100 text-green-700' },
    { key: 'incorrect', icon: '❌', color: 'border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700' },
  ]

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">시험</h1>

      {pausedSession && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
          <p className="text-sm font-semibold text-yellow-800 mb-1">일시정지된 시험이 있어요</p>
          <p className="text-xs text-yellow-600 mb-3">
            {pausedSession.date} · {listLabels[pausedSession.wordListType]} · {pausedSession.testItems?.length ?? 0}개 완료
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
          const blocked = pausedSession && cycle?.activeList !== key
          return (
            <button
              key={key}
              onClick={() => !blocked && onStart(key)}
              disabled={!!blocked}
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
        최소 {MIN_WORDS}개 · 10개 이후 언제든 중단 가능
      </p>
    </div>
  )
}

// ── TESTING ───────────────────────────────────────────────────

function TestingView({
  word, answer, onAnswerChange, onSubmit, onGrade,
  onPause, onFinish, wordPhase, answeredCount, canStop, remaining, inputRef, listLabel,
  prevItems,
}) {
  const navigate = useNavigate()
  const [showPrev, setShowPrev] = useState(false)

  function handleKeyDown(e) {
    if (e.key === 'Enter' && wordPhase === 'input' && answer.trim()) onSubmit()
  }

  return (
    <div className="min-h-screen flex flex-col pb-6 pt-6 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">{listLabel} · {answeredCount}번째</span>
        <div className="flex items-center gap-2">
          {answeredCount > 0 && (
            <button
              onClick={() => setShowPrev(true)}
              className="text-xs text-primary-600 font-medium bg-primary-50 px-2.5 py-1 rounded-lg"
            >
              이전 단어 {answeredCount}개 ›
            </button>
          )}
          <span className="text-xs text-gray-400">남음 {remaining}개</span>
        </div>
      </div>

      {/* 이전 단어 모달 */}
      {showPrev && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">이전 단어 ({prevItems.length}개)</h2>
            <button onClick={() => setShowPrev(false)} className="text-gray-400 p-1">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {[...prevItems].reverse().map((item, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border p-3 ${item.isCorrect ? 'border-green-100' : 'border-red-100'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">{item.word}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${item.isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                    {item.isCorrect ? '○' : '✕'}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{item.meaning}</p>
                <p className="text-xs text-blue-400 mt-1">내 답: {item.userAnswer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center gap-4">
        {/* Word card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-4xl font-bold text-gray-900 mb-2">{word.word}</p>
          {word.incorrectCount > 0 && (
            <p className="text-sm text-red-400">오답 {word.incorrectCount}회</p>
          )}
        </div>


        {/* INPUT phase */}
        {wordPhase === 'input' && (
          <>
            <textarea
              ref={inputRef}
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="한국어 뜻을 입력하세요"
              rows={3}
              className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none outline-none focus:border-primary-400 shadow-sm"
            />
            <button
              onClick={onSubmit}
              disabled={!answer.trim()}
              className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg shadow-sm disabled:opacity-40 active:scale-95 transition-all"
            >
              제출
            </button>
          </>
        )}

        {/* REVEALED phase */}
        {wordPhase === 'revealed' && (
          <>
            {/* My answer */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-blue-400 mb-1">내 답</p>
              <p className="text-base text-gray-800">{answer}</p>
            </div>

            {/* Correct answer */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-green-500">정답</p>
                <button
                  onClick={() => navigate(`/dictionary?q=${encodeURIComponent(word.word)}`)}
                  className="flex items-center gap-1 text-xs text-primary-500 font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  사전
                </button>
              </div>
              <p className="text-base font-semibold text-gray-900">{word.meaning}</p>
              {word.examples.length > 0 && (
                <div className="mt-2 space-y-1">
                  {word.examples.map((ex, i) => (
                    <p key={i} className="text-xs text-gray-500">
                      <span className="text-gray-400 mr-1">{i + 1}.</span>{ex}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* O/X grade buttons */}
            <div className="flex gap-3">
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
          </>
        )}

        {/* Stop options — shown every 5 words, between words */}
        {answeredCount > 0 && answeredCount % 5 === 0 && wordPhase === 'input' && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={onPause}
              className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium active:scale-95 transition-all"
            >
              ⏸ 일시정지
            </button>
            <button
              onClick={onFinish}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium active:scale-95 transition-all"
            >
              ✓ 오늘 시험 마무리
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── RESULT ────────────────────────────────────────────────────

function ResultView({ result, listLabels, onDone }) {
  const pct = Math.round((result.correctCount / result.totalCount) * 100)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center pb-24 px-6 max-w-lg mx-auto">
      <div className="text-5xl mb-4">{pct >= 80 ? '🎉' : pct >= 50 ? '📝' : '💪'}</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">시험 완료!</h2>
      <p className="text-sm text-gray-500 mb-8">{listLabels[result.listType]}</p>

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
          <p className="text-xs text-indigo-500 mt-1">모든 단어를 한 번씩 시험봤어요.</p>
        </div>
      )}

      <button
        onClick={onDone}
        className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg"
      >
        기록 보기
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
