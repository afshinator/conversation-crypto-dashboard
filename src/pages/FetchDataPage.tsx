import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { AuthOutletContext } from './ChatPage'

const API_NOT_IMPLEMENTED = 'API not implemented or server not running'
const TOTAL_STEPS = 9 // 8 sources + 1 derive step
const PAUSE_MS_BETWEEN_COINGECKO = 6_000 // same as backend default; client paces to avoid timeout

type RefreshStatus = 'idle' | 'loading' | 'success' | 'error'
type DeleteStatus = 'idle' | 'confirm' | 'loading' | 'success' | 'error'

interface StepResponse {
  ok: boolean
  step: number
  key?: string
  status?: number
  isOk?: boolean
  error?: string
  done?: boolean
}


export default function FetchDataPage() {
  const { logout } = useOutletContext<AuthOutletContext>() ?? {}
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>('idle')
  const [refreshMessage, setRefreshMessage] = useState('')
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; key?: string } | null>(null)
  const [fetchedData, setFetchedData] = useState<Record<string, unknown> | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>('idle')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function handleRefresh() {
    setRefreshStatus('loading')
    setRefreshMessage('')
    setFetchedData(null)
    setRefreshProgress(null)
    const failed: { key: string; status: number; error?: string }[] = []
    try {
      for (let step = 1; step <= TOTAL_STEPS; step++) {
        setRefreshProgress({
          current: step,
          total: TOTAL_STEPS,
          key: step <= 8 ? ['global', 'topCoins', 'bitcoinChart', 'trending', 'categories', 'coinbaseSpot', 'krakenTicker', 'binancePrice'][step - 1] : 'derived',
        })
        const res = await fetch('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step }),
        })
        const text = await res.text()
        if (!res.ok) {
          setRefreshStatus('error')
          setRefreshMessage(text || `Error ${res.status}`)
          return
        }
        let stepBody: StepResponse
        try {
          stepBody = JSON.parse(text) as StepResponse
        } catch {
          setRefreshStatus('error')
          setRefreshMessage('Invalid response from server.')
          return
        }
        if (!stepBody.ok && stepBody.key) {
          failed.push({
            key: stepBody.key,
            status: stepBody.status ?? 0,
            error: stepBody.error,
          })
        }
        if (stepBody.done) break
        // Pause between CoinGecko steps (1–5) to avoid rate limit; client paces
        if (step >= 1 && step <= 4) await sleep(PAUSE_MS_BETWEEN_COINGECKO)
      }
      setRefreshProgress(null)
      setRefreshStatus('success')
      if (failed.length > 0) {
        const failedSummary = failed.map((r) => `${r.key} (${r.status}${r.error ? `: ${r.error}` : ''})`).join('; ')
        setRefreshMessage(`Data refreshed with ${TOTAL_STEPS - failed.length}/${TOTAL_STEPS} steps. Failed: ${failedSummary}`)
      } else {
        setRefreshMessage('Data refreshed.')
      }
      const dataRes = await fetch('/api/data', { method: 'GET' })
      if (dataRes.ok) {
        try {
          const dataBody = (await dataRes.json()) as { data?: Record<string, unknown> }
          if (dataBody.data && Object.keys(dataBody.data).length > 0) {
            setFetchedData(dataBody.data)
            setExpandedKey(Object.keys(dataBody.data)[0] ?? null)
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setRefreshProgress(null)
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
        try {
          const body = JSON.parse(text) as { deleted?: number }
          setDeleteMessage(body.deleted != null ? `Data deleted (${body.deleted} blobs).` : 'Data deleted.')
        } catch {
          setDeleteMessage('Data deleted.')
        }
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
        {logout && <button type="button" onClick={logout} className="nav-logout">Log out</button>}
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
          {refreshStatus === 'loading' && (
            <>
              <p className="status loading">
                {refreshProgress
                  ? `Fetching ${refreshProgress.current}/${refreshProgress.total}${refreshProgress.key ? ` (${refreshProgress.key})` : ''}…`
                  : 'Loading…'}
              </p>
              {refreshProgress && refreshProgress.current <= 4 && (
                <p className="muted" style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
                  Pausing ${PAUSE_MS_BETWEEN_COINGECKO/1000}s between CoinGecko calls to avoid rate limit…
                </p>
              )}
            </>
          )}
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
                  disabled={!deleteConfirmed}
                >
                  Confirm delete
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
          {deleteStatus === 'loading' && <p className="status loading">Deleting…</p>}
          {deleteStatus === 'success' && <p className="status success">{deleteMessage}</p>}
          {deleteStatus === 'error' && <p className="status error">{deleteMessage}</p>}
        </div>
      </section>

      <section className="data-accordion">
        <h2>Fetched data by endpoint</h2>
        {fetchedData && Object.keys(fetchedData).length > 0 ? (
          <div className="accordion-list">
            {Object.keys(fetchedData).map((key) => (
              <div key={key} className="accordion-item">
                <button
                  type="button"
                  className="accordion-heading"
                  onClick={() => setExpandedKey((k) => (k === key ? null : key))}
                >
                  {key}
                  <span className="accordion-toggle">{expandedKey === key ? '−' : '+'}</span>
                </button>
                {expandedKey === key && (
                  <pre className="accordion-body">{JSON.stringify(fetchedData[key], null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Refresh data to see a quick look here. No data loaded yet (or API not implemented).</p>
        )}
      </section>
    </div>
  )
}
