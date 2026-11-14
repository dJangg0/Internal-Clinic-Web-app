import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Activity, ArrowRight, Check, ClipboardList, Eye, EyeOff, ImagePlus, Info, LockKeyhole, Mail, RotateCcw, Stethoscope, UserRound } from 'lucide-react'
import './login.css'
import { DEMO_ACCOUNTS, matchDemoCredentials, type DemoRole } from './demoLogin'

type LoginRole = DemoRole
type FieldErrors = { email?: string; password?: string }

const roles = {
  Patient: { label: 'Patient', detail: 'Your care', icon: UserRound, heading: 'Your care starts here.', description: 'A little less waiting. A little more peace of mind.', email: 'you@example.com', access: 'Patient accounts are not available yet. Ask reception about registration or use the clinic’s daily QR for check-in.' },
  Attendant: { label: 'Attendant', detail: '/ Secretary', icon: ClipboardList, heading: 'A smoother day starts here.', description: 'Help every patient feel expected, from the moment they arrive.', email: 'name@clinic.com', access: 'Staff accounts will be provided by your clinic administrator once sign-in is connected. Contact your administrator for access.' },
  Doctor: { label: 'Doctor', detail: 'Your practice', icon: Stethoscope, heading: 'Welcome back, doctor.', description: 'Make room for what matters most. Your patients.', email: 'doctor@clinic.com', access: 'Doctor accounts will be provided by your clinic administrator once sign-in is connected. Contact your administrator for access.' },
}

export default function LoginPage({ onExploreDemo, onDemoLogin, coverImage, onCoverChange }: { onExploreDemo: () => void; onDemoLogin: (role: DemoRole) => void; coverImage: string | null; onCoverChange: (image: string | null) => void }) {
  const [role, setRole] = useState<LoginRole>('Doctor')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState('')
  const [credentialError, setCredentialError] = useState(false)
  const [coverError, setCoverError] = useState('')
  const [coverStatus, setCoverStatus] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const pendingCoverRef = useRef<{ image: HTMLImageElement; url: string } | null>(null)
  const selected = roles[role]

  function cancelPendingCover() {
    const pending = pendingCoverRef.current
    if (!pending) return
    pendingCoverRef.current = null
    pending.image.onload = null
    pending.image.onerror = null
    URL.revokeObjectURL(pending.url)
  }

  useEffect(() => cancelPendingCover, [])

  function changeCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    cancelPendingCover()
    setCoverStatus('')
    setCoverError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCoverError('Choose a JPEG, PNG or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverError('Choose an image no larger than 5 MB.')
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    const pending = { image, url }
    pendingCoverRef.current = pending
    image.onload = () => {
      if (pendingCoverRef.current !== pending) return
      pendingCoverRef.current = null
      onCoverChange(url)
      setCoverStatus('Cover updated. Your image stays in this preview until you refresh.')
    }
    image.onerror = () => {
      if (pendingCoverRef.current !== pending) return
      cancelPendingCover()
      setCoverError('This image could not be opened. Choose a valid JPEG, PNG or WebP image.')
    }
    image.src = url
  }

  function resetCover() {
    cancelPendingCover()
    onCoverChange(null)
    setCoverError('')
    setCoverStatus('Default cover restored.')
  }

  function selectRole(next: LoginRole) {
    if (next === role) return
    setRole(next)
    setEmail('')
    setPassword('')
    setShowPassword(false)
    setErrors({})
    setNotice('')
    setCredentialError(false)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: FieldErrors = {}
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.'
    if (!password.trim()) next.password = 'Enter your password.'
    setErrors(next)
    setNotice('')
    setCredentialError(false)
    if (next.email) { emailRef.current?.focus(); return }
    if (next.password) { passwordRef.current?.focus(); return }
    const matches = matchDemoCredentials(role, email, password)
    setPassword('')
    if (!matches) { setCredentialError(true); return }
    onDemoLogin(role)
  }

  return <main className="login-shell">
    <header className="login-header">
      <a className="login-brand" href="/login" aria-label="Northstar Clinic home">
        <span className="login-brand-mark"><Activity size={23} strokeWidth={1.8} /></span>
        <span><strong>northstar<span>✳</span></strong><small>CLINIC WORKSPACE</small></span>
      </a>
      <span className="login-header-tagline">CARE, THOUGHTFULLY CONNECTED.</span>
      <div className="login-header-actions">
        <input ref={coverInputRef} type="file" hidden aria-label="Choose a cover image" accept="image/jpeg,image/png,image/webp" onChange={changeCover} />
        {coverImage && <button className="login-cover-reset" type="button" aria-label="Reset cover" onClick={resetCover}><RotateCcw size={14} /><span>Reset cover</span></button>}
        <button className="login-cover-button" type="button" aria-describedby="login-cover-help" onClick={() => coverInputRef.current?.click()}><ImagePlus size={16} /><span>Change cover</span></button>
        <span id="login-cover-help" className="login-visually-hidden">Choose a JPEG, PNG or WebP image, up to 5 MB. Cover changes last until you refresh.</span>
        <span className="login-preview-badge"><span />Demo environment</span>
      </div>
    </header>
    {(coverError || coverStatus) && <p className={`login-cover-feedback ${coverError ? 'is-error' : ''}`} role={coverError ? 'alert' : 'status'}><Info size={15} />{coverError || coverStatus}</p>}
    <div className="login-hero">
      <img className="login-hero-image" src={coverImage ?? '/images/clinic-hero.jpg'} alt="" aria-hidden="true" fetchPriority="high" />
      <div className="login-hero-shade" aria-hidden="true" />
      <aside className="login-story" aria-label="About Northstar">
        <div className="login-story-content">
          <div className="login-eyebrow"><span /> THE NORTHSTAR WAY</div>
          <h2>A calmer space.<br /><em>For better care.</em></h2>
          <p>One thoughtful space for patients and the people who care for them. From the first hello to the next visit.</p>
          <div className="login-story-signature"><span />A little more human. A little more care.</div>
        </div>
        <div className="login-story-footer"><span>01 — ARRIVE</span><span>02 — CONNECT</span><span>03 — CARE</span></div>
      </aside>
      <section className="login-main" aria-labelledby="login-heading">
      <div className="login-form-wrap">
        <div className="login-form-eyebrow">A PLACE FOR EVERY PART OF CARE</div>
        <h1 id="login-heading">{selected.heading}</h1>
        <p className="login-intro">{selected.description}</p>

        <div className="login-role-label" id="login-role-label">I’m signing in as</div>
        <div className="login-roles" role="group" aria-labelledby="login-role-label">
          {(Object.keys(roles) as LoginRole[]).map((choice) => {
            const item = roles[choice]
            const Icon = item.icon
            return <button key={choice} type="button" className={`login-role ${role === choice ? 'is-selected' : ''}`} aria-pressed={role === choice} aria-label={choice === 'Attendant' ? 'Attendant / Secretary' : choice} onClick={() => selectRole(choice)}>
              <Icon size={21} strokeWidth={1.6} /><strong>{item.label}</strong><small>{item.detail}</small>{role === choice && <span className="login-role-check"><Check size={9} strokeWidth={3} /></span>}
            </button>
          })}
        </div>

        <form className="login-form" noValidate onSubmit={submit} aria-label={`${role} sign-in`}>
          <div className="login-field">
            <label htmlFor="login-email">Email address</label>
            <div className={`login-input-wrap ${errors.email ? 'has-error' : ''}`}><Mail size={18} strokeWidth={1.6} /><input ref={emailRef} id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={selected.email} value={email} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : undefined} required onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined })); setCredentialError(false) }} /></div>
            {errors.email && <p id="login-email-error" className="login-field-error">{errors.email}</p>}
          </div>
          <div className="login-field">
            <div className="login-password-label"><label htmlFor="login-password">Password</label><button className="login-text-button" type="button" onClick={() => { setCredentialError(false); setNotice('Password recovery is not available in this demo. Once sign-in is connected, your clinic administrator can help restore account access.') }}>Forgot password?</button></div>
            <div className={`login-input-wrap ${errors.password ? 'has-error' : ''}`}><LockKeyhole size={18} strokeWidth={1.6} /><input ref={passwordRef} id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : undefined} required onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })); setCredentialError(false) }} /><button className="login-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} strokeWidth={1.6} /> : <Eye size={18} strokeWidth={1.6} />}</button></div>
            {errors.password && <p id="login-password-error" className="login-field-error">{errors.password}</p>}
          </div>

          {notice && <p className="login-notice" role="status"><Info size={17} /><span>{notice}</span></p>}
          {credentialError && <p className="login-notice" role="alert"><Info size={17} /><span>These demo credentials do not match the selected role.</span></p>}
          <button className="login-submit" type="submit"><span>Sign in as {role}</span><ArrowRight size={18} /></button>
        </form>
        <details className="login-demo-credentials">
          <summary>Demo credentials</summary>
          <div><span>{DEMO_ACCOUNTS[role].email}</span><code>{DEMO_ACCOUNTS[role].password}</code><button type="button" className="login-text-button" onClick={() => { setEmail(DEMO_ACCOUNTS[role].email); setPassword(DEMO_ACCOUNTS[role].password); setShowPassword(false); setErrors({}); setNotice(''); setCredentialError(false) }}>Use demo credentials</button></div>
        </details>
        <p className="login-access">New to Northstar? <button className="login-text-button" type="button" onClick={() => { setCredentialError(false); setNotice(selected.access) }}>Need access?</button></p>
        <div className="login-demo-divider"><span />HERE FOR A LOOK AROUND?<span /></div>
        <button className="login-demo-button" type="button" onClick={onExploreDemo}><span>Explore demo workspace</span><ArrowRight size={17} /></button>
        <p className="login-demo-note"><Info size={13} /><span>Demo accounts open sample role views only.<br />Production authentication is not connected.</span></p>
      </div>
      </section>
    </div>
    <footer className="login-page-footer"><span>Northstar Clinic Workspace</span><span>Thoughtfully built. Human by design.</span><span>Sample data · Demo preview</span></footer>
  </main>
}
