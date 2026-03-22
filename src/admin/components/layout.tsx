import React from 'react'

interface LayoutProps {
  children: React.ReactNode
  currentRoute: string
  onLogout: () => void
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {label}
    </a>
  )
}

export function Layout({ children, currentRoute, onLogout }: LayoutProps) {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-700">
          <span className="text-white font-bold text-base leading-tight">
            Email Service
            <br />
            <span className="text-blue-400 font-semibold text-sm">Admin</span>
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink href="#/templates" label="Templates" active={currentRoute.startsWith('/templates')} />
          <NavLink href="#/logs" label="Logs" active={currentRoute.startsWith('/logs')} />
        </nav>

        <div className="px-3 py-4 border-t border-gray-700">
          <button
            onClick={onLogout}
            className="w-full text-left px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <h1 className="text-lg font-semibold text-gray-800">Email Service Admin</h1>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
