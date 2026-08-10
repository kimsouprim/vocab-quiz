import { NavLink } from 'react-router-dom'
import { MacIcon } from './MacUI'

const tabs = [
  { to: '/words', label: '단어장', icon: 'book' },
  { to: '/dictionary', label: '사전', icon: 'search' },
  { to: '/test', label: '시험', icon: 'test' },
  { to: '/history', label: '기록', icon: 'history' },
]

export default function Navigation() {
  return (
    <nav className="mac-nav safe-bottom">
      <div className="mac-nav-inner">
        {tabs.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `mac-nav-item ${isActive ? 'mac-nav-item-active' : ''}`
            }
          >
            <MacIcon name={icon} className="h-8 w-8" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
