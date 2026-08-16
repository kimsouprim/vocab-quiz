import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MacIcon, MacPageHeader } from '../components/MacUI'

const BASE_URL = 'https://en.dict.naver.com/#'

export default function DictionaryPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const dictUrl = query
    ? `${BASE_URL}/search?query=${encodeURIComponent(query)}`
    : `${BASE_URL}/main`

  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setBlocked(false)
  }, [dictUrl])

  return (
    <div className="mac-page mac-dictionary-page flex min-h-0 flex-col overflow-hidden">
      <MacPageHeader
        icon="search"
        title={query ? `"${query}"` : '사전'}
        actions={(
          <a
            href={dictUrl}
            target="_blank"
            rel="noreferrer"
            className="mac-button px-3 text-xs"
          >
            전체 화면으로 열기 ↗
          </a>
        )}
      />

      {/* iframe */}
      {!blocked ? (
        <div className="mac-well relative min-h-0 flex-1 overflow-hidden">
          {!loaded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-200">
              <div>
                <p className="mb-2 text-center text-sm font-bold">사전 여는 중...</p>
                <div className="mac-progress" />
              </div>
            </div>
          )}
          <iframe
            src={dictUrl}
            className="block h-full min-h-full w-full border-none"
            onLoad={() => setLoaded(true)}
            onError={() => setBlocked(true)}
            title="Naver 영어사전"
          />
        </div>
      ) : (
        <div className="mac-panel flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
          <MacIcon name="lock" className="h-12 w-12" />
          <p className="text-gray-600 font-medium text-center">
            사이트 보안 정책으로 앱 내에서 열 수 없어요
          </p>
          <a
            href={dictUrl}
            target="_blank"
            rel="noreferrer"
            className="mac-button mac-button-primary px-6 py-3"
          >
            네이버 사전 열기 ↗
          </a>
        </div>
      )}
    </div>
  )
}
