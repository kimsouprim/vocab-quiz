import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import Navigation from './components/Navigation'
import LoginPage from './pages/LoginPage'
import WordListPage from './pages/WordListPage'
import DictionaryPage from './pages/DictionaryPage'
import TestPage from './pages/TestPage'
import HistoryPage from './pages/HistoryPage'
import ImportPage from './pages/ImportPage'
import { MacFrame } from './components/MacUI'

function AppRoutes() {
  const { user } = useAuth()

  if (user === undefined) {
    return (
      <MacFrame>
        <div className="mac-loading">
          <div>
            <p className="mb-2 text-center text-sm font-bold">단어장 여는 중...</p>
            <div className="mac-progress" />
          </div>
        </div>
      </MacFrame>
    )
  }

  if (!user) {
    return (
      <MacFrame title="Vocab Quiz Login">
        <LoginPage />
      </MacFrame>
    )
  }

  return (
    <DataProvider>
      <MacFrame>
        <Routes>
          <Route path="/" element={<Navigate to="/words" replace />} />
          <Route path="/words" element={<WordListPage />} />
          <Route path="/dictionary" element={<DictionaryPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="*" element={<Navigate to="/words" replace />} />
        </Routes>
        <Navigation />
      </MacFrame>
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
