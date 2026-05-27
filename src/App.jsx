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

function AppRoutes() {
  const { user } = useAuth()

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <DataProvider>
      <div className="max-w-lg mx-auto">
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
      </div>
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
