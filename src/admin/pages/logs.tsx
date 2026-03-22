import React, { useState, useEffect, useCallback } from 'react'
import { LogTable, EmailLog } from '../components/log-table'
import { useApi } from '../app'

interface Filters {
  status: string
  template: string
  to: string
  from: string
  to_date: string
}

interface PaginatedLogs {
  data: EmailLog[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const PAGE_SIZE = 50

export function LogsPage() {
  const { apiFetch } = useApi()
  const [filters, setFilters] = useState<Filters>({
    status: '',
    template: '',
    to: '',
    from: '',
    to_date: '',
  })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PaginatedLogs>({
    data: [],
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      if (filters.status) params.set('status', filters.status)
      if (filters.template) params.set('template', filters.template)
      if (filters.to) params.set('to', filters.to)
      if (filters.from) params.set('from', filters.from)
      if (filters.to_date) params.set('to_date', filters.to_date)

      const res = await apiFetch(`/admin/api/logs?${params.toString()}`)
      if (!res.ok) throw new Error(`Failed to load logs (${res.status})`)
      const data = await res.json()

      // Handle both {data, total, page, totalPages} and plain array responses
      if (Array.isArray(data)) {
        setResult({
          data,
          total: data.length,
          page,
          limit: PAGE_SIZE,
          totalPages: 1,
        })
      } else {
        setResult({
          data: data.data ?? [],
          total: data.total ?? 0,
          page: data.page ?? page,
          limit: data.limit ?? PAGE_SIZE,
          totalPages: (data.totalPages ?? Math.ceil((data.total ?? 0) / PAGE_SIZE)) || 1,
        })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [apiFetch, filters, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  function setFilter<K extends keyof Filters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
    setExpandedId(null)
  }

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Email Logs</h2>
        <button onClick={fetchLogs} className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Template */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Template</label>
            <input
              type="text"
              placeholder="Filter by template…"
              value={filters.template}
              onChange={(e) => setFilter('template', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Recipient</label>
            <input
              type="text"
              placeholder="Search email address…"
              value={filters.to}
              onChange={(e) => setFilter('to', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From date</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilter('from', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To date</label>
            <input
              type="date"
              value={filters.to_date}
              onChange={(e) => setFilter('to_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Clear button */}
        {Object.values(filters).some(Boolean) && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                setFilters({ status: '', template: '', to: '', from: '', to_date: '' })
                setPage(1)
              }}
              className="text-xs text-gray-500 hover:text-red-500 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-red-700 text-sm">
          <strong>Error:</strong> {error}
          <button onClick={fetchLogs} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-gray-400 text-sm">Loading logs…</div>
        </div>
      ) : (
        <LogTable logs={result.data} expandedId={expandedId} onToggle={handleToggle} />
      )}

      {/* Pagination */}
      {!loading && result.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Page <strong>{result.page}</strong> of <strong>{result.totalPages}</strong>{' '}
            <span className="text-gray-400">({result.total} total)</span>
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= result.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
