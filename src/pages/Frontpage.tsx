import { Link } from 'react-router-dom'

export default function Frontpage() {
  return (
    <div className="frontpage">
      <h1>Afshin's Playground</h1>
      <p>in progress...</p>
      <h3>Conversational Crypto Dashboard</h3>
      <p>Proof-of-concept: fetch crypto data and chat over it.</p>
      <nav className="frontpage-nav">
        <Link to="/cryptochat">Chat</Link>
        <Link to="/cryptochat/data">Data (introspect &amp; refresh)</Link>
      </nav>
    </div>
  )
}
