import React, { useState, useEffect, createContext, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import { Layout } from './components/layout'
import { TemplatesPage } from './pages/templates'
import { LogsPage } from './pages/logs'

// ---------------------------------------------------------------------------
// API context
// ---------------------------------------------------------------------------

interface ApiContextValue {
  apiKey: string
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const ApiContext = createContext<ApiContextValue | null>(null)

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext)
  if (!ctx) throw new Error('useApi must be used inside ApiProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Simple hash router helpers
// ---------------------------------------------------------------------------

function getRoute(): string {
  const hash = window.location.hash
  if (!hash || hash === '#' || hash === '#/') return '/templates'
  return hash.replace(/^#/, '')
}

// ---------------------------------------------------------------------------
// Login screen
// ---------------------------------------------------------------------------

function LoginScreen({ onLogin }: { onLogin: (key: string) => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/admin/api/templates', {
        headers: { 'X-Admin-Key': key },
      })
      if (res.status === 401) {
        setError('Invalid API key. Please try again.')
      } else {
        onLogin(key)
      }
    } catch {
      setError('Network error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-md p-10 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Email Service Admin</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your admin API key to continue.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
              Admin API Key
            </label>
            <input
              id="apiKey"
              type="password"
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !key}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root app
// ---------------------------------------------------------------------------

const BASIC_AUTH_MARKER = '__basic_auth__'

function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => sessionStorage.getItem('adminApiKey'))
  const [route, setRoute] = useState(getRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      window.location.hash = '#/templates'
    }
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Auto-detect Basic Auth: the browser sends credentials automatically
  useEffect(() => {
    if (apiKey) return
    fetch('/admin/api/templates')
      .then((res) => {
        if (res.ok) setApiKey(BASIC_AUTH_MARKER)
      })
      .catch(() => {})
  }, [apiKey])

  function handleLogin(key: string) {
    sessionStorage.setItem('adminApiKey', key)
    setApiKey(key)
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      window.location.hash = '#/templates'
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('adminApiKey')
    setApiKey(null)
  }

  if (!apiKey) {
    return <LoginScreen onLogin={handleLogin} />
  }

  function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    }
    // When behind Basic Auth, browser sends credentials automatically
    if (apiKey !== BASIC_AUTH_MARKER) {
      headers['X-Admin-Key'] = apiKey!
    }
    return fetch(path, { ...init, headers })
  }

  let page: React.ReactNode
  if (route.startsWith('/templates')) {
    page = <TemplatesPage />
  } else if (route.startsWith('/logs')) {
    page = <LogsPage />
  } else {
    page = <TemplatesPage />
  }

  return (
    <ApiContext.Provider value={{ apiKey, apiFetch }}>
      <Layout currentRoute={route} onLogout={handleLogout}>
        {page}
      </Layout>
    </ApiContext.Provider>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
