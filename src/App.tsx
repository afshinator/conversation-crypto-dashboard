import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Frontpage from './pages/Frontpage'
import ChatPage from './pages/ChatPage'
import FetchDataPage from './pages/FetchDataPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Frontpage />} />
        <Route path="/cryptochat" element={<ChatPage />} />
        <Route path="/cryptochat/data" element={<FetchDataPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
