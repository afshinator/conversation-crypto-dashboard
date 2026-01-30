import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

type Message = { role: 'user' | 'assistant'; content: string }

export default function ChatPage() {
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
        setMessages((prev) => [...prev, { role: 'assistant', content: data.text }])
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
      </nav>
      <h1>Crypto-Chat</h1>
      <p className="chat-intro">Ask questions about the persisted crypto data. Fetch data first from the Data page if you haven’t.</p>

      <section className="chat-messages">
        {messages.length === 0 && (
          <p className="muted">Send a message to start (e.g. “What’s BTC dominance?” or “Is Bitcoin in a golden cross?”).</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message--${msg.role}`}>
            <span className="chat-message-role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
            <div className="chat-message-content">{msg.content}</div>
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
