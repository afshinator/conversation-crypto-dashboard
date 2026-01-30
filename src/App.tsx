import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Frontpage from './pages/Frontpage'
import AuthGuard from './components/AuthGuard'
import ChatPage from './pages/ChatPage'
import FetchDataPage from './pages/FetchDataPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Frontpage />} />
        <Route path="/cryptochat" element={<AuthGuard />}>
          <Route index element={<ChatPage />} />
          <Route path="data" element={<FetchDataPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
