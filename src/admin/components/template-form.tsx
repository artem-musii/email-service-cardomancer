import React, { useState, useEffect } from 'react'
import type { Template } from './template-list'

interface TemplateFormProps {
  template?: Template | null
  onSave: (data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

interface FormState {
  name: string
  subject: string
  htmlBody: string
  variables: string
  maxRetries: number
}

type TabKey = 'editor' | 'preview'

export function TemplateForm({ template, onSave, onCancel }: TemplateFormProps) {
  const [form, setForm] = useState<FormState>({
    name: template?.name ?? '',
    subject: template?.subject ?? '',
    htmlBody: template?.htmlBody ?? '',
    variables: Array.isArray(template?.variables) ? template!.variables.join(', ') : '',
    maxRetries: template?.maxRetries ?? 3,
  })
  const [tab, setTab] = useState<TabKey>('editor')
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name ?? '',
        subject: template.subject ?? '',
        htmlBody: template.htmlBody ?? '',
        variables: Array.isArray(template.variables) ? template.variables.join(', ') : '',
        maxRetries: template.maxRetries ?? 3,
      })
    }
  }, [template])

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) newErrors.name = 'Name is required.'
    if (!form.htmlBody.trim()) newErrors.htmlBody = 'HTML body is required.'
    if (form.maxRetries < 0 || form.maxRetries > 10) newErrors.maxRetries = 'Must be between 0 and 10.'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const variables = form.variables
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)

    onSave({
      name: form.name.trim(),
      subject: form.subject.trim(),
      htmlBody: form.htmlBody,
      variables,
      maxRetries: Number(form.maxRetries),
    })
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            {template ? `Edit Template: ${template.name}` : 'Create Template'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. welcome-email"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="e.g. Welcome to {{appName}}!"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Variables */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Variables <span className="text-gray-400 font-normal text-xs">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.variables}
              onChange={(e) => set('variables', e.target.value)}
              placeholder="e.g. firstName, lastName, appName"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">These are the dynamic placeholders used inside the HTML body.</p>
          </div>

          {/* Max Retries */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Retries</label>
            <input
              type="number"
              min={0}
              max={10}
              value={form.maxRetries}
              onChange={(e) => set('maxRetries', parseInt(e.target.value, 10) || 0)}
              className={`w-32 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.maxRetries ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.maxRetries && <p className="text-xs text-red-500 mt-1">{errors.maxRetries}</p>}
          </div>

          {/* HTML Body with Preview Tabs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              HTML Body <span className="text-red-500">*</span>
            </label>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-0">
              {(['editor', 'preview'] as TabKey[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                    tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'editor' ? (
              <textarea
                value={form.htmlBody}
                onChange={(e) => set('htmlBody', e.target.value)}
                rows={16}
                spellCheck={false}
                placeholder="<!DOCTYPE html><html>…</html>"
                className={`w-full border rounded-b-lg rounded-tr-lg px-3 py-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y ${
                  errors.htmlBody ? 'border-red-400' : 'border-gray-300'
                }`}
              />
            ) : (
              <div className="border border-gray-300 rounded-b-lg rounded-tr-lg overflow-hidden min-h-72 bg-white">
                {form.htmlBody ? (
                  <iframe
                    srcDoc={form.htmlBody}
                    title="Template preview"
                    className="w-full"
                    style={{ minHeight: '400px', border: 'none' }}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                    No HTML to preview yet.
                  </div>
                )}
              </div>
            )}
            {errors.htmlBody && <p className="text-xs text-red-500 mt-1">{errors.htmlBody}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {template ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
