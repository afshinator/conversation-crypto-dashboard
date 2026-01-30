import { useState } from 'react'
import { Link } from 'react-router-dom'

const API_NOT_IMPLEMENTED = 'API not implemented or server not running'

type RefreshStatus = 'idle' | 'loading' | 'success' | 'error'
type DeleteStatus = 'idle' | 'confirm' | 'loading' | 'success' | 'error'

export default function FetchDataPage() {
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>('idle')
  const [refreshMessage, setRefreshMessage] = useState('')
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>('idle')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  async function handleRefresh() {
    setRefreshStatus('loading')
    setRefreshMessage('')
    try {
      const res = await fetch('/api/fetch', { method: 'POST' })
      const text = await res.text()
      if (res.ok) {
        setRefreshStatus('success')
        setRefreshMessage(text || 'Data refreshed.')
      } else {
        setRefreshStatus('error')
        setRefreshMessage(res.status === 404 ? API_NOT_IMPLEMENTED : text || `Error ${res.status}`)
      }
    } catch (e) {
      setRefreshStatus('error')
      setRefreshMessage(API_NOT_IMPLEMENTED)
    }
  }

  async function handleDelete() {
    if (deleteStatus !== 'confirm') return
    setDeleteStatus('loading')
    setDeleteMessage('')
    try {
      const res = await fetch('/api/data', { method: 'DELETE' })
      const text = await res.text()
      if (res.ok) {
        setDeleteStatus('success')
        setDeleteMessage(text || 'Data deleted.')
        setDeleteConfirmText('')
      } else {
        setDeleteStatus('error')
        setDeleteMessage(res.status === 404 ? API_NOT_IMPLEMENTED : text || `Error ${res.status}`)
      }
    } catch (e) {
      setDeleteStatus('error')
      setDeleteMessage(API_NOT_IMPLEMENTED)
    }
  }

  const deleteConfirmed = deleteConfirmText.trim().toUpperCase() === 'DELETE'

  return (
    <div className="fetch-data-page">
      <nav className="page-nav">
        <Link to="/">Home</Link>
        <Link to="/cryptochat">Chat</Link>
      </nav>
      <h1>Data (introspect &amp; refresh)</h1>

      <section className="fetch-actions">
        <div className="status-block">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshStatus === 'loading'}
          >
            {refreshStatus === 'loading' ? 'Refreshing…' : 'Refresh data'}
          </button>
          {refreshStatus === 'loading' && <p className="status loading">Loading…</p>}
          {refreshStatus === 'success' && <p className="status success">{refreshMessage}</p>}
          {refreshStatus === 'error' && <p className="status error">{refreshMessage}</p>}
        </div>

        <div className="status-block">
          {deleteStatus !== 'confirm' ? (
            <button
              type="button"
              onClick={() => setDeleteStatus('confirm')}
              disabled={deleteStatus === 'loading'}
            >
              Delete data
            </button>
          ) : (
            <div className="delete-confirm">
              <label>
                Type <strong>DELETE</strong> to confirm:
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                />
              </label>
              <div className="delete-confirm-actions">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!deleteConfirmed || deleteStatus === 'loading'}
                >
                  {deleteStatus === 'loading' ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteStatus('idle')
                    setDeleteConfirmText('')
                    setDeleteMessage('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {deleteStatus === 'success' && <p className="status success">{deleteMessage}</p>}
          {deleteStatus === 'error' && <p className="status error">{deleteMessage}</p>}
        </div>
      </section>

      <section className="data-accordion-placeholder">
        <h2>Stored data by endpoint</h2>
        <p className="muted">Collapsible accordion per endpoint will go here. No data loaded yet (or API not implemented).</p>
      </section>
    </div>
  )
}
