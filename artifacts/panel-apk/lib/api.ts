// API calls to the panel backend (axecodi.ai)
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://panel.kimiaxe.com';

export async function apiLogin(email: string, password: string): Promise<{ telegramId: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  return data;
}

export async function apiVerifyOtp(
  telegramId: string,
  otp: string
): Promise<{ telegramId: string; isAdmin: boolean; username: string }> {
  const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, otp: otp.trim() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'OTP verification failed');
  return data;
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Password change failed');
}
