import { useState, useRef, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

export type AuthOutletContext = { logout: () => void }

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  usage?: TokenUsage | null
}

function TokenCounter({ messages }: { messages: Message[] }) {
  const usages = messages.filter((m): m is Message & { usage: TokenUsage } => m.role === 'assistant' && m.usage != null)
  if (usages.length === 0) return null
  const totalPrompt = usages.reduce((a, m) => a + m.usage.promptTokens, 0)
  const totalCompletion = usages.reduce((a, m) => a + m.usage.completionTokens, 0)
  const totalTokens = usages.reduce((a, m) => a + m.usage.totalTokens, 0)
  return (
    <section className="token-counter" aria-label="Token usage summary">
      <h2 className="token-counter-heading">Token counter</h2>
      <p className="token-counter-stats">
        <span className="token-counter-label">This session:</span>{' '}
        <strong>{totalPrompt.toLocaleString()}</strong> prompt ·{' '}
        <strong>{totalCompletion.toLocaleString()}</strong> completion ·{' '}
        <strong>{totalTokens.toLocaleString()}</strong> total
        {totalPrompt > 0 && (
          <span className="token-counter-pct">
            {' '}
            ({((totalPrompt / 128_000) * 100).toFixed(2)}% of 128k context used by prompts)
          </span>
        )}
      </p>
      <p className="token-counter-hint muted">Per-response tokens are shown under each assistant reply.</p>
    </section>
  )
}

export default function ChatPage() {
  const { logout } = useOutletContext<AuthOutletContext>() ?? {}
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.text === 'string') {
        const usage: TokenUsage | null =
          data.usage &&
          typeof data.usage.promptTokens === 'number' &&
          typeof data.usage.completionTokens === 'number' &&
          typeof data.usage.totalTokens === 'number'
            ? {
                promptTokens: data.usage.promptTokens,
                completionTokens: data.usage.completionTokens,
                totalTokens: data.usage.totalTokens,
              }
            : null
        setMessages((prev) => [...prev, { role: 'assistant', content: data.text, usage }])
      } else {
        const errMsg = data.error || data.message || (res.status === 200 && data.text == null ? 'No data yet. Fetch data first from the Data page.' : `Error ${res.status}`)
        setError(errMsg)
        setMessages((prev) => [...prev, { role: 'assistant', content: errMsg }])
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Request failed'
      setError(errMsg)
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chat-page">
      <nav className="page-nav">
        <Link to="/">Home</Link>
        <Link to="/cryptochat/data">Data</Link>
        {logout && <button type="button" onClick={logout} className="nav-logout">Log out</button>}
      </nav>
      <h1>Crypto-Chat</h1>
      <p className="chat-intro">Ask questions about the persisted crypto data. Fetch data first from the Data page if you haven’t.</p>

      <TokenCounter messages={messages} />

      <section className="chat-messages">
        {messages.length === 0 && (
          <p className="muted">Send a message to start (e.g. “What’s BTC dominance?” or “Is Bitcoin in a golden cross?”).</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message--${msg.role}`}>
            <span className="chat-message-role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
            <div className="chat-message-content">{msg.content}</div>
            {msg.role === 'assistant' && msg.usage && (
              <div className="chat-message-usage" aria-label="Token usage for this response">
                <span className="usage-label">Tokens:</span>{' '}
                <span className="usage-prompt">{msg.usage.promptTokens} prompt</span>
                <span className="usage-sep"> · </span>
                <span className="usage-completion">{msg.usage.completionTokens} completion</span>
                <span className="usage-sep"> · </span>
                <span className="usage-total">{msg.usage.totalTokens} total</span>
                {msg.usage.promptTokens > 0 && (
                  <span className="usage-pct">
                    {' '}
                    ({((msg.usage.promptTokens / 128_000) * 100).toFixed(2)}% of 128k context)
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-message chat-message--assistant">
            <span className="chat-message-role">Assistant</span>
            <div className="chat-message-content chat-message-content--loading">Thinking…</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </section>

      {error && (
        <p className="status error" role="alert">{error}</p>
      )}

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the crypto data…"
          disabled={loading}
          autoFocus
          aria-label="Chat message"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
