import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api, { authService } from '@/services/api'
import type { User, LoginResult } from '@/types'

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string, twoFactorCode?: string) => Promise<LoginResult>
  register: (email: string, password: string, name: string) => Promise<LoginResult>
  logout: () => void
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(false)

  useEffect(() => {
    if (!isCheckingAuth) {
      checkAuth()
    }
  }, [])

  const checkAuth = async (): Promise<void> => {
    if (isCheckingAuth) return
    
    setIsCheckingAuth(true)
    try {
      const storedToken = localStorage.getItem('token')
      if (storedToken) {
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
        const response = await authService.me()
        setUser(response.data.user)
        setToken(storedToken)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      localStorage.removeItem('token')
      delete api.defaults.headers.common['Authorization']
      setToken(null)
    } finally {
      setLoading(false)
      setIsCheckingAuth(false)
    }
  }

  const login = async (
    email: string, 
    password: string, 
    twoFactorCode?: string
  ): Promise<LoginResult> => {
    try {
      setError(null)
      const response = await authService.login(email, password, twoFactorCode)
      const { token, user } = response.data
      
      localStorage.setItem('token', token)
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      setToken(token)
      
      return { success: true }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed'
      const requires2FA = error.response?.data?.requires2FA
      const requires2FASetup = error.response?.data?.requires2FASetup
      
      setError(message)
      return { 
        success: false, 
        error: message,
        requires2FA,
        requires2FASetup
      }
    }
  }

  const register = async (
    email: string, 
    password: string, 
    name: string
  ): Promise<LoginResult> => {
    try {
      setError(null)
      const response = await authService.register(email, password, name)
      const { token, user } = response.data
      
      localStorage.setItem('token', token)
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      setToken(token)
      
      return { success: true }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Registration failed'
      setError(message)
      return { success: false, error: message }
    }
  }

  const logout = (): void => {
    localStorage.removeItem('token')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    setToken(null)
  }

  const value: AuthContextType = {
    user,
    token,
    loading,
    error,
    login,
    register,
    logout,
    checkAuth,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}