import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Activity, ArrowLeft, ArrowRight, ClipboardList, Eye, EyeOff, LockKeyhole, ShieldCheck, Stethoscope, UserRound } from 'lucide-react'

export type UserRole = 'admin_doctor' | 'attendant_secretary'
export type LoginRole = UserRole | 'patient'
export type AuthUser = { id: string; username: string; fullName: string; role: UserRole }

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  signIn: (username: string, password: string, role: UserRole) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const apiBase = import.meta.env.VITE_API_URL ?? ''

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' })
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? 'The request could not be completed.')
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch<{ user: AuthUser }>('/api/auth/me')
      .then(({ user: currentUser }) => { if (active) setUser(currentUser) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const signIn = useCallback(async (username: string, password: string, role: UserRole) => {
    const result = await apiFetch<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    })
    setUser(result.user)
  }, [])

  const signOut = useCallback(async () => {
    try { await apiFetch<void>('/api/auth/logout', { method: 'POST' }) }
    finally { setUser(null) }
  }, [])

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}

export function RoleSelectionScreen({ onSelect }: { onSelect: (role: LoginRole) => void }) {
  const roles: Array<{ role: LoginRole; name: string; label: string; description: string; icon: ReactNode }> = [
    { role: 'admin_doctor', name: 'Doctor', label: 'Clinical workspace', description: 'Consultations, patient records, and prescriptions.', icon: <Stethoscope size={23} strokeWidth={1.8} /> },
    { role: 'attendant_secretary', name: 'Attendant', label: 'Front desk', description: 'Patient intake, appointments, and triage.', icon: <ClipboardList size={23} strokeWidth={1.8} /> },
    { role: 'patient', name: 'Patient', label: 'Patient access', description: 'Patient sign-in isn’t enabled for this workspace yet.', icon: <UserRound size={23} strokeWidth={1.8} /> },
  ]

  return <main className="auth-screen auth-role-screen">
    <section className="auth-role-panel" aria-labelledby="role-title">
      <div className="auth-brand"><span className="auth-mark"><Activity size={21} /></span><span><strong>northstar</strong><small>CLINIC WORKSPACE</small></span></div>
      <div className="auth-role-heading">
        <div className="section-kicker">A BETTER DAY IN HEALTHCARE</div>
        <h1 id="role-title">Welcome back, log in as?</h1>
        <p>Choose the account type you use to access Northstar Clinic.</p>
      </div>
      <div className="auth-role-grid">
        {roles.map(({ role, name, label, description, icon }) => <button type="button" className="auth-role-option" key={role} onClick={() => onSelect(role)}>
          <span className="auth-role-icon">{icon}</span>
          <span className="auth-role-copy"><small>{label}</small><strong>{name}</strong><span>{description}</span></span>
          <span className="auth-role-arrow" aria-hidden="true"><ArrowRight size={17} /></span>
        </button>)}
      </div>
      <div className="auth-role-note"><ShieldCheck size={15} /><span>Your access is based on your clinic account. Contact the clinic if you need help signing in.</span></div>
    </section>
    <p className="auth-footer">Northstar Clinic · Secure access</p>
  </main>
}

export function LoginScreen({ role, onBack }: { role: LoginRole; onBack: () => void }) {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const patientRole = role === 'patient'
  const roleName = role === 'admin_doctor' ? 'Doctor' : role === 'attendant_secretary' ? 'Attendant' : 'Patient'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (patientRole) return
    setSubmitting(true)
    setError('')
    try {
      await signIn(username.trim(), password, role)
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Sign-in failed. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-screen auth-login-screen">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand"><span className="auth-mark"><Activity size={21} /></span><span><strong>northstar</strong><small>CLINIC WORKSPACE</small></span></div>
      <button type="button" className="auth-back" onClick={onBack}><ArrowLeft size={15} />Choose another role</button>
      <div className="auth-heading"><span className="auth-lock"><LockKeyhole size={18} /></span><div><div className="section-kicker">{patientRole ? 'PATIENT SIGN IN' : 'SECURE SIGN IN'}</div><h1 id="auth-title">{roleName} sign in</h1><p>{patientRole ? 'Patient sign-in is currently unavailable in this clinic workspace.' : 'Sign in with your clinic account to continue.'}</p></div></div>
      {patientRole ? <div className="patient-login-unavailable" role="status">
        <span className="patient-login-icon"><UserRound size={20} /></span>
        <div><strong>Patient sign-in isn’t enabled yet.</strong><p>Patient accounts aren’t connected to this clinic workspace. Please contact the clinic for help accessing your records.</p></div>
      </div> : <>
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field"><span>Username</span><input autoComplete="username" autoFocus required maxLength={100} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="auth-field"><span>Password</span><span className="auth-password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-visibility" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary auth-submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in as ' + roleName}</button>
      </form>
      {import.meta.env.DEV && <section className="demo-credentials" aria-label="Development demo account">
        <div className="demo-credentials-heading"><strong>Development demo account</strong><span>Click to fill sign-in details.</span></div>
        {role === 'admin_doctor' && <button type="button" className="demo-account" onClick={() => { setUsername('clinic-admin'); setPassword('ClinicAdmin!2026'); setError('') }}>
          <span><strong>Admin / Doctor</strong><small>clinic-admin</small></span><code>ClinicAdmin!2026</code>
        </button>}
        {role === 'attendant_secretary' && <button type="button" className="demo-account" onClick={() => { setUsername('clinic-attendant'); setPassword('ClinicAttendant!2026'); setError('') }}>
          <span><strong>Attendant / Secretary</strong><small>clinic-attendant</small></span><code>ClinicAttendant!2026</code>
        </button>}
      </section>}
      <div className="auth-note"><ShieldCheck size={15} /><span>Your access is determined by your clinic account. Ask an administrator if you need an account.</span></div>
      </>}
    </section>
    <p className="auth-footer">Northstar Clinic · {patientRole ? 'Patient access' : 'Authorized staff only'}</p>
  </main>
}
