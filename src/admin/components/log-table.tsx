import React from 'react'

export interface EmailLog {
  id: string
  to: string
  subject: string
  template?: string
  status: 'queued' | 'sent' | 'failed'
  attempt: number
  error?: string | null
  variables?: Record<string, unknown> | null
  createdAt: string
}

interface LogTableProps {
  logs: EmailLog[]
  expandedId: string | null
  onToggle: (id: string) => void
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    sent: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    queued: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
        classes[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {status}
    </span>
  )
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function LogTable({ logs, expandedId, onToggle }: LogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p className="text-base font-medium mb-1">No logs found</p>
        <p className="text-sm">Try adjusting the filters above.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempt</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created At
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id
            return (
              <React.Fragment key={log.id}>
                <tr
                  className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  onClick={() => onToggle(log.id)}
                >
                  <td className="px-5 py-3 text-sm text-gray-900 font-medium max-w-[180px] truncate">{log.to}</td>
                  <td className="px-5 py-3 text-sm text-gray-700 max-w-[200px] truncate">{log.subject || '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{log.template || '—'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{log.attempt ?? 1}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(log.createdAt)}</td>
                </tr>

                {isExpanded && (
                  <tr className="bg-blue-50 border-t border-blue-100">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="space-y-3">
                        {log.error && (
                          <div>
                            <p className="text-xs font-semibold text-red-600 uppercase mb-1">Error</p>
                            <pre className="text-xs bg-red-50 border border-red-200 rounded-lg p-3 overflow-auto text-red-800 whitespace-pre-wrap">
                              {log.error}
                            </pre>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Variables</p>
                          <pre className="text-xs bg-gray-100 border border-gray-200 rounded-lg p-3 overflow-auto text-gray-700 whitespace-pre-wrap">
                            {log.variables ? JSON.stringify(log.variables, null, 2) : 'none'}
                          </pre>
                        </div>
                        <div className="text-xs text-gray-400">
                          Log ID: <span className="font-mono">{log.id}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
