import { Link } from 'react-router-dom'

export default function ChatPage() {
  return (
    <div className="chat-page">
      <nav className="page-nav">
        <Link to="/">Home</Link>
        <Link to="/cryptochat/data">Data</Link>
      </nav>
      <h1>Chat</h1>
      <p>Chat over crypto data (coming soon).</p>
    </div>
  )
}
