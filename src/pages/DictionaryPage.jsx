import { useState } from 'react'

const DICT_URL = 'https://dic.daum.net/index.do?dic=eng'

export default function DictionaryPage() {
  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)

  return (
    <div className="flex flex-col h-screen pb-16">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-3 bg-white border-b border-gray-100 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">사전</h1>
        <a
          href={DICT_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg font-medium"
        >
          새 탭으로 열기 ↗
        </a>
      </div>

      {/* iframe */}
      {!blocked ? (
        <div className="flex-1 relative">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          )}
          <iframe
            src={DICT_URL}
            className="w-full h-full border-none"
            onLoad={() => setLoaded(true)}
            onError={() => setBlocked(true)}
            title="Daum 영어사전"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <p className="text-4xl">🔒</p>
          <p className="text-gray-600 font-medium text-center">
            사이트 보안 정책으로 앱 내에서 열 수 없어요
          </p>
          <a
            href={DICT_URL}
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold"
          >
            다음 사전 열기 ↗
          </a>
        </div>
      )}
    </div>
  )
}
