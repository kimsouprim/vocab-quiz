import { useRef, useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { importWords } from '../firebase/wordService'
import { parseExcel } from '../utils/excelParser'

// ── IndexedDB: FileSystemFileHandle 저장/불러오기 ──────────────────────────
const DB_NAME = 'vocab-quiz-fs'
const STORE = 'file-handles'
const KEY = 'excel-handle'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function saveHandle(handle) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, KEY)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}
async function loadHandle() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

const supportsFileAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window

// ── 컴포넌트 ───────────────────────────────────────────────────────────────
export default function ImportPage() {
  const { user } = useAuth()
  const { allWords, setWords } = useData()
  const inputRef = useRef(null)
  const [status, setStatus] = useState(null) // null | 'loading' | { added, updated, removed } | 'error'
  const [savedHandle, setSavedHandle] = useState(null) // FileSystemFileHandle

  // 저장된 파일 핸들 복원
  useEffect(() => {
    if (!supportsFileAccess) return
    loadHandle().then(setSavedHandle).catch(() => {})
  }, [])

  // 공통: rows → Firestore 저장
  async function processFile(file) {
    const rows = await parseExcel(file)
    if (rows.length === 0) { setStatus('error'); return }
    const result = await importWords(user.uid, rows, allWords)
    setWords(result.words)
    setStatus({ added: result.added, updated: result.updated, removed: result.removed })
  }

  // ① 기억된 파일로 바로 동기화
  async function handleQuickSync() {
    if (!savedHandle) return
    setStatus('loading')
    try {
      let perm = await savedHandle.queryPermission({ mode: 'read' })
      if (perm !== 'granted') perm = await savedHandle.requestPermission({ mode: 'read' })
      if (perm !== 'granted') { setStatus('error'); return }
      await processFile(await savedHandle.getFile())
    } catch {
      setStatus('error')
    }
  }

  // ② File System Access API로 파일 선택 후 기억
  async function handlePickAndRemember() {
    setStatus('loading')
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Excel 파일', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xls'] } }],
        multiple: false,
      })
      await saveHandle(handle).catch(() => {}) // 저장 실패해도 계속
      setSavedHandle(handle)
      await processFile(await handle.getFile())
    } catch (e) {
      if (e?.name === 'AbortError') setStatus(null) // 취소
      else setStatus('error')
    }
  }

  // ③ 일반 파일 input (폴백: iPhone 등)
  async function handleFileInput(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('loading')
    try {
      await processFile(file)
    } catch {
      setStatus('error')
    }
    e.target.value = ''
  }

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Excel 불러오기</h1>

      {/* 파일 형식 안내 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">Excel 파일 형식</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <div className="flex gap-3"><span className="font-mono bg-gray-100 px-2 rounded">A열</span><span>영단어</span></div>
          <div className="flex gap-3"><span className="font-mono bg-gray-100 px-2 rounded">B열</span><span>한국어 뜻</span></div>
          <div className="flex gap-3"><span className="font-mono bg-gray-100 px-2 rounded">C~G열</span><span>예문 1~5 (선택)</span></div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          이미 있는 단어는 예문만 업데이트됩니다. 오답 횟수와 정답/오답 상태는 유지돼요.
        </p>
      </div>

      {supportsFileAccess ? (
        <>
          {/* 기억된 파일 있을 때: 바로 동기화 버튼 */}
          {savedHandle && (
            <button
              onClick={handleQuickSync}
              disabled={status === 'loading'}
              className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg shadow-sm hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50 mb-3"
            >
              {status === 'loading' ? '불러오는 중...' : '⚡ 바로 동기화'}
            </button>
          )}

          {/* 파일 선택 (처음이거나 다른 파일로 바꿀 때) */}
          <button
            onClick={handlePickAndRemember}
            disabled={status === 'loading'}
            className={`w-full py-3 rounded-2xl font-semibold text-base shadow-sm active:scale-95 transition-all disabled:opacity-50 ${
              savedHandle
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-primary-600 text-white hover:bg-primary-700 py-4 text-lg'
            }`}
          >
            {savedHandle ? '다른 파일 선택' : 'Excel 파일 선택 후 기억하기'}
          </button>

          {!savedHandle && (
            <p className="text-xs text-gray-400 text-center mt-2">
              한 번 선택하면 다음부터 ⚡ 바로 동기화 버튼으로 바로 업로드돼요.
            </p>
          )}
        </>
      ) : (
        // 폴백: 일반 파일 input (iPhone 등)
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={status === 'loading'}
            className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg shadow-sm hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {status === 'loading' ? '불러오는 중...' : 'Excel 파일 선택'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
        </>
      )}

      {/* 결과 메시지 */}
      {status && status !== 'loading' && (
        <div className={`mt-4 p-4 rounded-xl text-sm font-medium ${
          status === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {status === 'error'
            ? '파일을 읽는 중 오류가 발생했어요. 파일을 다시 선택해 주세요.'
            : `완료! 추가 ${status.added}개 · 업데이트 ${status.updated}개 · 삭제 ${status.removed}개`}
        </div>
      )}
    </div>
  )
}
