import { useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { importWords } from '../firebase/wordService'
import { parseExcel } from '../utils/excelParser'

export default function ImportPage() {
  const { user } = useAuth()
  const { allWords, setWords } = useData()
  const inputRef = useRef(null)
  const [status, setStatus] = useState(null) // null | 'loading' | { added, updated, removed } | 'error'

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('loading')
    try {
      const rows = await parseExcel(file)
      if (rows.length === 0) {
        setStatus('error')
        return
      }
      // 기존 단어를 DataContext에서 바로 사용 → 재조회 없음
      const result = await importWords(user.uid, rows, allWords)
      // 저장 후 결과를 직접 반영 → refresh() 재조회 없음
      setWords(result.words)
      setStatus({ added: result.added, updated: result.updated, removed: result.removed })
    } catch {
      setStatus('error')
    }
    e.target.value = ''
  }

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Excel 불러오기</h1>

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

      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === 'loading'}
        className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold text-lg shadow-sm hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50"
      >
        {status === 'loading' ? '불러오는 중...' : 'Excel 파일 선택'}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

      {status && status !== 'loading' && (
        <div className={`mt-4 p-4 rounded-xl text-sm font-medium ${
          status === 'error'
            ? 'bg-red-50 text-red-700'
            : 'bg-green-50 text-green-700'
        }`}>
          {status === 'error'
            ? '파일을 읽는 중 오류가 발생했어요. 형식을 확인해 주세요.'
            : `완료! 추가 ${status.added}개 · 업데이트 ${status.updated}개 · 삭제 ${status.removed}개`}
        </div>
      )}
    </div>
  )
}
