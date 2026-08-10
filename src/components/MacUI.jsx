export function MacFrame({ children, title = 'Vocab Quiz 1.0' }) {
  return (
    <div className="mac-desktop">
      <div className="mac-frame">
        <div className="mac-titlebar">
          <span className="mac-window-control" aria-hidden="true" />
          <div className="mac-titlebar-label">
            <MacIcon name="book" className="h-4 w-4" />
            <span>{title}</span>
          </div>
          <span className="mac-window-control mac-window-control-right" aria-hidden="true" />
        </div>
        <div className="mac-frame-body">{children}</div>
      </div>
    </div>
  )
}

export function MacPageHeader({ icon, title, actions }) {
  return (
    <div className="mac-page-header">
      <div className="flex min-w-0 items-center gap-2">
        <MacIcon name={icon} className="h-7 w-7 flex-shrink-0" />
        <h1 className="truncate text-lg font-bold text-black">{title}</h1>
      </div>
      {actions && <div className="flex flex-shrink-0 gap-2">{actions}</div>}
    </div>
  )
}

export function MacIcon({ name, className = 'h-8 w-8' }) {
  const common = {
    className,
    viewBox: '0 0 32 32',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    shapeRendering: 'crispEdges',
    'aria-hidden': true,
  }

  if (name === 'search') {
    return (
      <svg {...common}>
        <rect x="5" y="4" width="16" height="16" fill="#fff" stroke="#111" strokeWidth="2" />
        <rect x="8" y="7" width="10" height="10" fill="#9a96cf" />
        <path d="M19 18L27 26" stroke="#111" strokeWidth="4" />
        <path d="M20 18L27 25" stroke="#eee" strokeWidth="1" />
      </svg>
    )
  }

  if (name === 'test' || name === 'incorrect') {
    return (
      <svg {...common}>
        <rect x="7" y="4" width="18" height="24" fill="#fff" stroke="#111" strokeWidth="2" />
        <path d="M20 4V10H25" fill="#b7b3df" stroke="#111" strokeWidth="1" />
        <rect x="10" y="13" width="5" height="5" fill="#fff" stroke="#111" />
        <path d="M11 14L14 17M14 14L11 17" stroke="#d33b35" strokeWidth="2" />
        <path d="M17 15H22M17 20H22M10 23H22" stroke="#5650a2" strokeWidth="2" />
      </svg>
    )
  }

  if (name === 'history') {
    return (
      <svg {...common}>
        <rect x="4" y="7" width="24" height="20" fill="#fff" stroke="#111" strokeWidth="2" />
        <rect x="4" y="7" width="24" height="5" fill="#7771bd" stroke="#111" />
        <path d="M9 4V9M23 4V9" stroke="#111" strokeWidth="2" />
        <circle cx="17" cy="19" r="6" fill="#d7eef2" stroke="#111" strokeWidth="2" />
        <path d="M17 15V19L20 21" stroke="#111" strokeWidth="2" />
      </svg>
    )
  }

  if (name === 'import') {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="20" height="26" fill="#fff" stroke="#111" strokeWidth="2" />
        <rect x="9" y="7" width="14" height="5" fill="#73a66f" stroke="#111" />
        <path d="M9 15H23M9 19H23M9 23H23M14 15V26M19 15V26" stroke="#777" />
        <path d="M3 20H10M6 17L3 20L6 23" stroke="#5650a2" strokeWidth="2" />
      </svg>
    )
  }

  if (name === 'correct') {
    return (
      <svg {...common}>
        <path d="M3 10H13L16 7H29V27H3V10Z" fill="#7771bd" stroke="#111" strokeWidth="2" />
        <path d="M6 13H26V24H6V13Z" fill="#aaa6d7" />
        <path d="M9 18L13 22L22 13" stroke="#f6f6f6" strokeWidth="3" />
        <path d="M9 17L13 21L22 12" stroke="#29683d" strokeWidth="2" />
      </svg>
    )
  }

  if (name === 'digested') {
    return (
      <svg {...common}>
        <rect x="5" y="8" width="22" height="19" fill="#8580c3" stroke="#111" strokeWidth="2" />
        <rect x="8" y="4" width="16" height="5" fill="#d8d6ec" stroke="#111" strokeWidth="2" />
        <rect x="10" y="12" width="12" height="9" fill="#fff" stroke="#111" />
        <path d="M16 13L17.5 16H21L18 18L19 21L16 19L13 21L14 18L11 16H14.5L16 13Z" fill="#e4c83b" stroke="#111" />
      </svg>
    )
  }

  if (name === 'empty') {
    return (
      <svg {...common}>
        <path d="M3 10H13L16 7H29V27H3V10Z" fill="#8b86c7" stroke="#111" strokeWidth="2" />
        <rect x="7" y="14" width="18" height="10" fill="#c7c4e3" />
        <path d="M11 18H21" stroke="#666" strokeWidth="2" />
      </svg>
    )
  }

  if (name === 'lock') {
    return (
      <svg {...common}>
        <rect x="6" y="13" width="20" height="15" fill="#e2c94c" stroke="#111" strokeWidth="2" />
        <path d="M10 13V9C10 2 22 2 22 9V13" stroke="#111" strokeWidth="3" />
        <rect x="14" y="18" width="4" height="6" fill="#555" />
      </svg>
    )
  }

  if (name === 'result') {
    return (
      <svg {...common}>
        <rect x="5" y="4" width="22" height="24" fill="#fff" stroke="#111" strokeWidth="2" />
        <rect x="9" y="8" width="14" height="5" fill="#8b86c7" />
        <path d="M9 18L13 22L22 13" stroke="#34834c" strokeWidth="3" />
        <path d="M9 25H23" stroke="#555" strokeWidth="2" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M4 7L14 4V27L4 24V7Z" fill="#7771bd" stroke="#111" strokeWidth="2" />
      <path d="M14 4H27V25H14" fill="#d8d6ed" stroke="#111" strokeWidth="2" />
      <path d="M8 9L11 8V22L8 21V9Z" fill="#9d98d0" />
      <path d="M17 8H24M17 12H24M17 16H24" stroke="#5650a2" strokeWidth="2" />
      <rect x="3" y="26" width="25" height="2" fill="#666" opacity=".55" />
    </svg>
  )
}
