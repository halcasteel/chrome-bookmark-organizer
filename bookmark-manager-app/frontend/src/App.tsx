import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import PrivateRoute from './components/PrivateRoute'

// Pages
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Bookmarks from './pages/Bookmarks'
import Search from './pages/Search'
import Import from './pages/Import'
import Collections from './pages/Collections'
import Settings from './pages/Settings'
import Tags from './pages/Tags'

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="bookmarks" element={<Bookmarks />} />
            <Route path="search" element={<Search />} />
            <Route path="import" element={<Import />} />
            <Route path="collections" element={<Collections />} />
            <Route path="collections/:id" element={<Collections />} />
            <Route path="tags" element={<Tags />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App