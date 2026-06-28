import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { getCycle, startCycle, removeFromCycle, clearCycle, setCycleRemainingIds } from '../firebase/cycleService'
import { getSession, saveSession, clearSession, saveTest } from '../firebase/testService'
import { batchUpdateWords } from '../firebase/wordService'
import { today } from '../utils/dateUtils'

function isUntestedWord(word) {
  return !word?.status || word.status === 'untested'
}

export default function TestPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { allWords, correctWords, incorrectWords, digestedWords, cycle, session, loading, error, refresh } = useData()

  const [phase, setPhase] = useState('setup') // setup | testing | result
  const [localSession, setLocalSession] = useState(null)
  // wordPhase: 'input' → user typing | 'revealed' → answer shown, waiting O/X
  const [wordPhase, setWordPhase] = useState('input')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [isStopping, setIsStopping] = useState(false)
  const inputRef = useRef(null)

  const listMap = { all: allWords, correct: correctWords, incorrect: incorrectWords }
  const listLabels = { all: '전체 단어장', correct: '정답 단어장', incorrect: '오답 단어장' }

  // Restore in-progress session + 날짜 지난 세션 자동 마무리
  const sessionRestored = useRef(false)
  const autoFinalizeStarted = useRef(false)
  useEffect(() => {
    if (loading) return // DataContext 아직 로딩 중

    // ① 날짜 지난 Firestore 세션 → sessionStorage 유무와 관계없이 자동 마무리
    if (!autoFinalizeStarted.current && session?.phase === 'testing' && session.date < today()) {
      autoFinalizeStarted.current = true
      autoFinalizeSession(session)
    }

    // ② 세션 복원은 한 번만
    if (sessionRestored.current) return
    sessionRestored.current = true

    // sessionStorage에 오늘 진행 상태가 있으면 우선 복원
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

    // sessionStorage 없고 오늘 날짜 Firestore 세션이면 복원
    if (session?.phase === 'testing' && session.date === today()) {
      setLocalSession(session)
      setPhase('testing')
      setWordPhase('input')
    }
  }, [loading, session]) // eslint-disable-line

  async function autoFinalizeSession(sess) {
    try {
      sessionStorage.removeItem('test-local-session')
      sessionStorage.removeItem('test-word-phase')
      sessionStorage.removeItem('test-answer')
    } catch {}
    try {
      const items = sess.testItems ?? []
      if (items.length > 0) {
        await runFinalize(items, sess)
      } else {
        await clearSession(user.uid)
      }
    } catch {
      // runFinalize 실패해도 세션은 반드시 지움
      await clearSession(user.uid).catch(() => {})
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
  const activeListType = localSession?.wordListType ?? cycle?.activeList
  const cycleRemaining = localSession?.remainingAtStart ?? cycle?.remainingWordIds ?? []
  const answeredIds = new Set((localSession?.testItems ?? []).map((i) => i.wordId))
  const digestedIds = new Set(digestedWords.map((w) => w.id))

  function prioritizeAllTestIds(remainingIds) {
    const remainingSet = new Set(remainingIds)
    const wordMap = new Map(allWords.map((w) => [w.id, w]))
    const notInCycleIds = allWords
      .filter((w) => isUntestedWord(w) && !remainingSet.has(w.id))
      .map((w) => w.id)
    const untestedIds = remainingIds.filter((id) => {
      const w = wordMap.get(id)
      return w != null && isUntestedWord(w)
    })
    const testedIds = remainingIds.filter((id) => {
      const w = wordMap.get(id)
      return w != null && !isUntestedWord(w)
    })

    return [...notInCycleIds, ...untestedIds, ...testedIds]
  }

  const prioritizedRemaining = activeListType === 'all'
    ? prioritizeAllTestIds(cycleRemaining)
    : cycleRemaining
  const wordPool = prioritizedRemaining
    .filter((id) => !answeredIds.has(id) && !digestedIds.has(id))
    .map((id) => allWords.find((w) => w.id === id))
    .filter(Boolean)
  const currentWord = wordPool[0] ?? null

  const answeredCount = localSession?.testItems?.length ?? 0

  // 전체단어장 사이클에서 untested 단어를 앞으로 재정렬
  // - 사이클 미포함 신규 단어: 앞에 추가
  // - 사이클 내 untested 단어: 앞으로 이동
  // - 나머지(correct/incorrect): 뒤에 유지
  async function injectNewWordsIfAny(cycleData) {
    const remainingIds = cycleData?.remainingWordIds ?? []
    const newOrder = prioritizeAllTestIds(remainingIds)

    // 신규 untested 단어가 없고 digested 제거도 없으면 업데이트 불필요
    const hasChanges = newOrder.length !== remainingIds.length || newOrder.some((id, i) => id !== remainingIds[i])
    if (!hasChanges) return false

    await setCycleRemainingIds(user.uid, newOrder)
    return true
  }

  // ── START TEST ────────────────────────────────────────────────
  async function handleStart(listType) {
    const dateStr = today()
    const wordsForList = listMap[listType]
    let cycleData = await getCycle(user.uid)

    if (!cycleData?.activeList || cycleData.activeList !== listType || cycleData.remainingWordIds.length === 0) {
      // 새 사이클 시작
      if (wordsForList.length === 0) {
        alert(`${listLabels[listType]}에 단어가 없어요.`)
        return
      }

      let wordIds
      if (listType === 'all') {
        // untested(한 번도 시험 안 본) 단어를 앞에 배치 → 새로 추가된 단어 우선 출제
        const untested = wordsForList.filter(isUntestedWord)
        const tested   = wordsForList.filter((w) => !isUntestedWord(w))
        wordIds = [...shuffle(untested.map((w) => w.id)), ...shuffle(tested.map((w) => w.id))]
      } else {
        wordIds = shuffle(wordsForList.map((w) => w.id))
      }

      await startCycle(user.uid, listType, wordIds)
    } else if (listType === 'all') {
      // 기존 사이클 진행 중: 새로 추가된 단어가 있으면 앞에 삽입 (실패해도 시험은 계속)
      try { await injectNewWordsIfAny(cycleData) } catch {}
    }

    cycleData = await getCycle(user.uid)

    // 사이클에 남아있는 digested 단어 ID 정리 (방어적 클린업)
    const digestedSet = new Set(digestedWords.map((w) => w.id))
    const cleanRemaining = cycleData.remainingWordIds.filter((id) => !digestedSet.has(id))
    if (cleanRemaining.length !== cycleData.remainingWordIds.length) {
      await setCycleRemainingIds(user.uid, cleanRemaining).catch(() => {})
      cycleData = { ...cycleData, remainingWordIds: cleanRemaining }
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

  // ── 소화한 단어장으로 이동 (정답 단어장에서만) ─────────────────
  async function handleDigest() {
    if (!currentWord) return
    const item = {
      wordId: currentWord.id,
      word: currentWord.word,
      meaning: currentWord.meaning,
      examples: currentWord.examples,
      incorrectCount: currentWord.incorrectCount,
      userAnswer: answer.trim(),
      isCorrect: true,
      isDigested: true,
    }
    const newItems = [...(localSession?.testItems ?? []), item]
    const updated = { ...localSession, testItems: newItems }
    setAnswer('')
    setWordPhase('input')
    setLocalSession(updated)
    try {
      sessionStorage.setItem('test-local-session', JSON.stringify(updated))
      sessionStorage.setItem('test-word-phase', 'input')
      sessionStorage.removeItem('test-answer')
    } catch {}
    await saveSession(user.uid, updated)
    try {
      await batchUpdateWords(user.uid, [{ id: currentWord.id, status: 'digested' }])
      await refresh()
    } catch (e) {
      console.error('[handleDigest] immediate digest update failed:', e)
    }
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

  // ── 시험 중단 (기록 저장 후 결과 화면) ───────────────────────
  async function handleStop() {
    if (!localSession?.testItems?.length) return // 안전 가드
    if (isStopping) return                        // 중복 호출 방지
    setIsStopping(true)
    try {
      sessionStorage.removeItem('test-local-session')
      sessionStorage.removeItem('test-word-phase')
      sessionStorage.removeItem('test-answer')
    } catch {}
    const items = localSession.testItems
    let cycleComplete = false
    try {
      cycleComplete = await runFinalize(items, localSession)
    } catch (e) {
      console.error('[handleStop] runFinalize error:', e)
      await clearSession(user.uid).catch(() => {})
    }
    await refresh().catch(() => {})
    setResult({
      correctCount: items.filter((i) => i.isCorrect && !i.isDigested).length,
      incorrectCount: items.filter((i) => !i.isCorrect && !i.isDigested).length,
      digestedCount: items.filter((i) => i.isDigested).length,
      totalCount: items.length,
      listType: localSession.wordListType,
      cycleComplete,
    })
    setIsStopping(false)
    setPhase('result')
  }

  // 공통 마무리 로직 (직접 호출 + 자동 마무리 공유)
  async function runFinalize(items, sess) {
    const correctItems = items.filter((i) => i.isCorrect)
    const incorrectItems = items.filter((i) => !i.isCorrect)

    const updates = items.map((item) => ({
      id: item.wordId,
      status: item.isDigested ? 'digested' : (item.isCorrect ? 'correct' : 'incorrect'),
      ...(item.isCorrect || item.isDigested ? {} : { incorrectCount: item.incorrectCount + 1 }),
    }))
    await batchUpdateWords(user.uid, updates)

    const testedIds = items.map((i) => i.wordId)
    const remaining = await removeFromCycle(user.uid, testedIds)
    const cycleComplete = remaining != null && remaining.length === 0
    if (cycleComplete) await clearCycle(user.uid)

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
    return cycleComplete
  }

  // ── RENDER ────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <SetupView
        cycle={cycle}
        listLabels={listLabels}
        listMap={listMap}
        onStart={handleStart}
        error={error}
        onRetry={refresh}
      />
    )
  }

  if (phase === 'testing') {
    // 사이클 단어를 모두 풀었을 때
    if (!currentWord) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-4">
          <p className="text-4xl">🎉</p>
          <p className="text-gray-700 font-semibold text-center">사이클 완료! 모든 단어를 풀었어요.</p>
          <button
            onClick={handleStop}
            disabled={isStopping}
            className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold disabled:opacity-50"
          >
            {isStopping ? '저장 중...' : '결과 저장'}
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
        onDigest={handleDigest}
        onStop={handleStop}
        wordPhase={wordPhase}
        answeredCount={answeredCount}
        isStopping={isStopping}
        remaining={wordPool.length}
        inputRef={inputRef}
        listType={localSession?.wordListType}
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

function SetupView({ cycle, listLabels, listMap, onStart, error, onRetry }) {
  const LIST_CONFIGS = [
    { key: 'all', icon: '📚', color: 'border-indigo-200 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
    { key: 'correct', icon: '✅', color: 'border-green-200 bg-green-50', badge: 'bg-green-100 text-green-700' },
    { key: 'incorrect', icon: '❌', color: 'border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700' },
  ]

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">시험</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={onRetry} className="flex-shrink-0 font-semibold text-red-600">
              다시 시도
            </button>
          </div>
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
          return (
            <button
              key={key}
              onClick={() => onStart(key)}
              className={`w-full p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${color}`}
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
        1개 이상 답하면 언제든 중단 가능
      </p>
    </div>
  )
}

// ── TESTING ───────────────────────────────────────────────────

function TestingView({
  word, answer, onAnswerChange, onSubmit, onGrade, onDigest,
  onStop, wordPhase, answeredCount, isStopping, remaining, inputRef,
  listType, listLabel, prevItems,
}) {
  const navigate = useNavigate()
  const [showPrev, setShowPrev] = useState(false)
  const [reviewWordId, setReviewWordId] = useState(null)
  const reviewItems = [...prevItems].reverse()
  const selectedReviewItem = reviewItems.find((item) => item.wordId === reviewWordId) ?? reviewItems[0]

  function openPreviousReview(item = prevItems[prevItems.length - 1]) {
    if (!item) return
    setReviewWordId(item.wordId)
    setShowPrev(true)
  }

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
              onClick={() => openPreviousReview()}
              className="text-xs text-primary-600 font-medium bg-primary-50 px-2.5 py-1 rounded-lg"
            >
              이전 정답 {answeredCount}개 ›
            </button>
          )}
          <span className="text-xs text-gray-400">남음 {remaining}개</span>
        </div>
      </div>

      {/* 이전 단어 모달 */}
      {showPrev && (
        <div className="fixed inset-0 z-50 bg-gray-50">
          <div className="mx-auto flex h-full w-full max-w-lg flex-col bg-white">
            <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">이전 정답 확인 ({prevItems.length}개)</h2>
              <button onClick={() => setShowPrev(false)} className="text-gray-400 p-1">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-gray-50">
              {reviewItems.map((item) => (
                <button
                  key={item.wordId}
                  onClick={() => setReviewWordId(item.wordId)}
                  className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    selectedReviewItem?.wordId === item.wordId
                      ? 'border-primary-200 bg-primary-50 text-primary-600'
                      : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  {item.word}
                </button>
              ))}
            </div>

            {selectedReviewItem && (
              <div className="flex-1 overflow-y-auto px-4 py-5">
                <div className="mb-4 rounded-3xl border border-gray-100 bg-white p-7 text-center shadow-sm">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <p className="text-3xl font-bold text-gray-900">{selectedReviewItem.word}</p>
                    <ReviewBadge item={selectedReviewItem} />
                  </div>
                  {selectedReviewItem.incorrectCount > 0 && (
                    <p className="text-sm text-red-400">오답 {selectedReviewItem.incorrectCount}회</p>
                  )}
                </div>

                <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="mb-1 text-xs font-semibold text-blue-400">내 답</p>
                  <p className="text-base text-gray-800">{selectedReviewItem.userAnswer || '-'}</p>
                </div>

                <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-semibold text-green-500">정답</p>
                    <button
                      onClick={() => navigate(`/dictionary?q=${encodeURIComponent(selectedReviewItem.word)}`)}
                      className="flex items-center gap-1 text-xs font-medium text-primary-500"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                      사전
                    </button>
                  </div>
                  <p className="text-base font-semibold text-gray-900">{selectedReviewItem.meaning}</p>
                  {selectedReviewItem.examples?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {selectedReviewItem.examples.map((ex, i) => (
                        <p key={i} className="text-sm leading-relaxed text-gray-700">
                          <span className="mr-1 text-gray-400">{i + 1}.</span>{ex}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
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
              className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-base resize-none outline-none focus:border-primary-400 shadow-sm"
            />
            <button
              onClick={onSubmit}
              disabled={!answer.trim()}
              className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg shadow-sm disabled:opacity-40 active:scale-95 transition-all"
            >
              제출
            </button>
            {answeredCount > 0 && (
              <button
                onClick={() => openPreviousReview()}
                className="w-full rounded-xl border border-primary-100 bg-primary-50 py-3 text-sm font-semibold text-primary-600 active:scale-95 transition-all"
              >
                직전 정답 보기
              </button>
            )}
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
                <div className="mt-3 space-y-2">
                  {word.examples.map((ex, i) => (
                    <p key={i} className="text-sm text-gray-700 leading-relaxed">
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
            {/* 소화한 단어장으로 이동 (정답 단어장에서만) */}
            {listType === 'correct' && (
              <button
                onClick={onDigest}
                className="w-full py-3 bg-purple-50 border border-purple-200 text-purple-600 rounded-2xl text-sm font-medium active:scale-95 transition-all"
              >
                ✓ 더이상 시험 안 볼게요 → 소화한 단어장
              </button>
            )}
          </>
        )}

        {/* 중단 버튼 — 1개 이상 답하면 항상 노출 */}
        {answeredCount > 0 && wordPhase === 'input' && (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl text-sm font-medium active:scale-95 transition-all border border-gray-200 disabled:opacity-50"
          >
            {isStopping ? '저장 중...' : '■ 중단하고 기록 저장'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── RESULT ────────────────────────────────────────────────────

function ResultView({ result, listLabels, onDone }) {
  const gradedCount = result.correctCount + result.incorrectCount
  const pct = gradedCount > 0 ? Math.round((result.correctCount / gradedCount) * 100) : 0
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
          {result.digestedCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-500">{result.digestedCount}</p>
              <p className="text-xs text-gray-400 mt-1">소화</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{result.totalCount}</p>
            <p className="text-xs text-gray-400 mt-1">총</p>
          </div>
        </div>
      </div>

      {result.cycleComplete && (
        <div className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl mb-6 text-center">
          <p className="text-sm font-semibold text-indigo-700">🎊 사이클 완료!</p>
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

function ReviewBadge({ item }) {
  if (item.isDigested) {
    return (
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-600">
        소화
      </span>
    )
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
      {item.isCorrect ? '○' : '✕'}
    </span>
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
