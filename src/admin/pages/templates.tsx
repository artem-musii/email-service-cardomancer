import React, { useState, useEffect, useCallback } from 'react'
import { TemplateList, Template } from '../components/template-list'
import { TemplateForm } from '../components/template-form'
import { useApi } from '../app'

type EditingState = Template | null
type CreatingState = boolean

export function TemplatesPage() {
  const { apiFetch } = useApi()
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<EditingState>(null)
  const [creating, setCreating] = useState<CreatingState>(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/admin/api/templates')
      if (!res.ok) throw new Error(`Failed to load templates (${res.status})`)
      const data = await res.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  async function handleCreate(data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const res = await apiFetch('/admin/api/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Create failed (${res.status})`)
      }
      setCreating(false)
      await fetchTemplates()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create template')
    }
  }

  async function handleUpdate(data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!editing) return
    try {
      const res = await apiFetch(`/admin/api/templates/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Update failed (${res.status})`)
      }
      setEditing(null)
      await fetchTemplates()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update template')
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await apiFetch(`/admin/api/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Delete failed (${res.status})`)
      }
      await fetchTemplates()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-400 text-sm">Loading templates…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
        <strong>Error:</strong> {error}
        <button onClick={fetchTemplates} className="ml-4 underline text-red-600 hover:text-red-800">
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <TemplateList
        templates={templates}
        onEdit={(t) => {
          setEditing(t)
          setCreating(false)
        }}
        onDelete={handleDelete}
        onCreate={() => {
          setCreating(true)
          setEditing(null)
        }}
      />

      {creating && <TemplateForm template={null} onSave={handleCreate} onCancel={() => setCreating(false)} />}

      {editing && <TemplateForm template={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}
    </>
  )
}
