import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import Layout from './components/Layout'
import PrivateRoute from './components/PrivateRoute'
import './utils/debugWebSocket' // Load debug utility

// Pages
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Bookmarks from './pages/Bookmarks'
import Search from './pages/Search'
import Import from './pages/Import'
import ImportA2A from './pages/ImportA2A'
// import Import from './pages/ImportSimple'
import Collections from './pages/Collections'
import Settings from './pages/Settings'
import Tags from './pages/Tags'
import AdminDashboard from './pages/AdminDashboard'
import TestManagement from './pages/TestManagement'

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router future={{
          v7_relativeSplatPath: true,
          v7_startTransition: true
        }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="bookmarks" element={<Bookmarks />} />
              <Route path="search" element={<Search />} />
              <Route path="import" element={<Import />} />
              <Route path="import-a2a" element={<ImportA2A />} />
              <Route path="collections" element={<Collections />} />
              <Route path="collections/:id" element={<Collections />} />
              <Route path="tags" element={<Tags />} />
              <Route path="settings" element={<Settings />} />
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="test-management" element={<TestManagement />} />
            </Route>
          </Routes>
        </Router>
      </SocketProvider>
    </AuthProvider>
  )
}

export default App