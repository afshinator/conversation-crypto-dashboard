import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'

type AuthStatus = 'loading' | 'loggedOut' | 'loggedIn'

export default function AuthGuard() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/auth', { method: 'GET', credentials: 'include' })
        if (!cancelled) {
          setStatus(res.ok ? 'loggedIn' : 'loggedOut')
        }
      } catch {
        if (!cancelled) setStatus('loggedOut')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        setStatus('loggedIn')
      } else {
        const data = await res.json().catch(() => ({}))
        setLoginError(data.error || 'Invalid password.')
      }
    } catch {
      setLoginError('Request failed.')
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } finally {
      window.location.href = '/cryptochat'
    }
  }

  if (status === 'loading') {
    return (
      <div className="auth-guard">
        <p className="muted">Checking authentication…</p>
      </div>
    )
  }

  if (status === 'loggedOut') {
    return (
      <div className="auth-guard">
        <div className="auth-login">
          <h1>Log in</h1>
          <p className="muted">Enter the app password to continue.</p>
          <form onSubmit={handleLogin}>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                aria-invalid={!!loginError}
              />
            </label>
            {loginError && (
              <p className="status error" role="alert">{loginError}</p>
            )}
            <button type="submit" disabled={!password.trim()}>
              Log in
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <Outlet context={{ logout: handleLogout }} />
}
