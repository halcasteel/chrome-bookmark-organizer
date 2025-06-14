export interface User {
  id: string;
  email: string;
  name: string;
  two_factor_enabled: boolean;
  two_factor_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  requires2FA?: boolean;
  requires2FASetup?: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
}