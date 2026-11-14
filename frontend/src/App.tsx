import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Pill,
  Plus,
  Printer,
  QrCode,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react'
import QRCode from 'qrcode'
import LoginPage from './LoginPage'
import { demoPath, type DemoRole } from './demoLogin'
import { PatientDemoPage, ReceptionDemoPage } from './DemoRoleViews'
import {
  ageFromBirthDate, dateKey, hasAppointmentConflict, isStoredAppointments,
  isQueueSession, parseStoredPatients, readStored, saveStored,
  type AllergyStatus, type Patient, type MedicalRecord, type Prescription,
  type Appointment, type QueueEntry, type QueueSession,
} from './clinic'

type Page = 'dashboard' | 'patients' | 'appointments' | 'queue'
type ChartTab = 'overview' | 'visit' | 'history' | 'prescriptions'
type ModalName = 'walk-in' | 'appointment' | null

const STORAGE_PATIENTS = 'northstar-demo-patients-v1'
const STORAGE_APPOINTMENTS = 'northstar-demo-appointments-v1'
const STORAGE_QUEUE = 'northstar-demo-daily-queue-v1'
const clinicianName = 'Dr. Maya Reyes (sample clinician)'

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function todayLabel() {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
}

function createSeedPatients(): Patient[] {
  return [
    {
      id: 'p-1001', name: 'Sofia Reyes', initials: 'SR', birthDate: '1994-05-12', sex: 'Female', phone: '0917-555-0142', email: 'sofia.reyes@example.test', patientNumber: 'PT-10482', joined: '2023-08-18', allergy: 'Penicillin', allergyStatus: 'known', lastVisit: dateKey(new Date()),
      notes: 'Patient reports a mild headache since yesterday afternoon. Hydration and sleep have been normal. No vision changes reported.',
      records: [{ id: 'r-1', date: '2026-02-13', signs: 'Afebrile; vitals within expected range.', symptoms: 'Seasonal nasal congestion and sneezing.', diagnosis: 'Allergic rhinitis' }],
      prescriptions: [{ id: 'rx-1', date: '2026-02-13', medication: 'Cetirizine', strength: '10 mg', instructions: 'Take one tablet by mouth once daily.', duration: '14 days', notes: 'Demo record' }],
    },
    {
      id: 'p-1002', name: 'Mateo Cruz', initials: 'MC', birthDate: '2017-11-03', sex: 'Male', phone: '0917-555-0186', email: 'ana.cruz@example.test', patientNumber: 'PT-10476', joined: '2023-08-15', allergy: 'No known allergies', allergyStatus: 'none', lastVisit: '2026-10-22',
      notes: '', records: [{ id: 'r-2', date: '2026-10-22', signs: 'Temperature 37.1°C.', symptoms: 'Intermittent cough for two days.', diagnosis: 'Acute upper respiratory symptoms' }], prescriptions: [],
    },
    {
      id: 'p-1003', name: 'Elena Santos', initials: 'ES', birthDate: '1982-01-29', sex: 'Female', phone: '0917-555-0108', email: 'elena.santos@example.test', patientNumber: 'PT-10394', joined: '2023-06-29', allergy: 'No known allergies', allergyStatus: 'none', lastVisit: '2026-10-30',
      notes: '', records: [{ id: 'r-3', date: '2026-10-30', signs: 'Blood pressure 122/78 mmHg.', symptoms: 'Routine follow-up; no new concerns.', diagnosis: 'Preventive visit' }], prescriptions: [],
    },
    {
      id: 'p-1004', name: 'Paolo Mendoza', initials: 'PM', birthDate: '1990-07-08', sex: 'Male', phone: '0917-555-0173', email: 'paolo.mendoza@example.test', patientNumber: 'PT-10381', joined: '2023-06-17', allergy: 'Sulfa drugs', allergyStatus: 'known', lastVisit: '2026-10-18',
      notes: '', records: [], prescriptions: [],
    },
    {
      id: 'p-1005', name: 'Liza Garcia', initials: 'LG', birthDate: '2001-03-17', sex: 'Female', phone: '0917-555-0112', email: 'liza.garcia@example.test', patientNumber: 'PT-10365', joined: '2023-05-28', allergy: 'No known allergies', allergyStatus: 'none', lastVisit: '2026-10-14',
      notes: '', records: [], prescriptions: [],
    },
  ]
}

function createSeedAppointments(): Appointment[] {
  const today = dateKey(new Date())
  const next = new Date()
  next.setDate(next.getDate() + 1)
  const tomorrow = dateKey(next)
  return [
    { id: 'a-1', patientId: 'p-1001', date: today, time: '09:00', duration: 30, reason: 'Follow-up · headache', status: 'checked_in', clinician: clinicianName },
    { id: 'a-2', patientId: 'p-1002', date: today, time: '09:30', duration: 30, reason: 'Cough and congestion', status: 'confirmed', clinician: clinicianName },
    { id: 'a-3', patientId: 'p-1003', date: today, time: '10:30', duration: 45, reason: 'Annual wellness visit', status: 'scheduled', clinician: clinicianName },
    { id: 'a-4', patientId: 'p-1004', date: today, time: '13:00', duration: 30, reason: 'Medication review', status: 'scheduled', clinician: clinicianName },
    { id: 'a-5', patientId: 'p-1005', date: tomorrow, time: '10:00', duration: 30, reason: 'New patient consultation', status: 'confirmed', clinician: clinicianName },
  ]
}

function readStoredPatients(): Patient[] {
  const stored = readStored<unknown>(STORAGE_PATIENTS, createSeedPatients, () => true)
  return parseStoredPatients(stored) ?? createSeedPatients()
}

function initialsFromName(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}

function createRandomToken() {
  const bytes = new Uint8Array(16)
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes)
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256) })
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function queueLink(token: string) {
  const url = new URL(window.location.pathname, window.location.origin)
  url.searchParams.set('queue', token)
  return url.toString()
}

function App() {
  const [patients, setPatients] = useState<Patient[]>(readStoredPatients)
  const [appointments, setAppointments] = useState<Appointment[]>(() => readStored(STORAGE_APPOINTMENTS, createSeedAppointments, isStoredAppointments))
  const [queueSession, setQueueSession] = useState<QueueSession | null>(() => {
    const stored = readStored<QueueSession | null>(STORAGE_QUEUE, () => null, (value): value is QueueSession | null => value === null || isQueueSession(value))
    return stored?.date === dateKey(new Date()) ? stored : null
  })
  const [queueScanToken, setQueueScanToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('queue'))
  const [page, setPage] = useState<Page>('dashboard')
  const [chartPatientId, setChartPatientId] = useState<string | null>(null)
  const [chartTab, setChartTab] = useState<ChartTab>('overview')
  const [modal, setModal] = useState<ModalName>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoVisited, setDemoVisited] = useState(false)
  const [demoRole, setDemoRole] = useState<DemoRole>('Doctor')
  const demoSessionRef = useRef<DemoRole | null>(null)
  const [loginCover, setLoginCover] = useState<string | null>(null)
  const [triageEntryId, setTriageEntryId] = useState<string | null>(null)
  const [consultEntryId, setConsultEntryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [storageFailed, setStorageFailed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (loginCover) URL.revokeObjectURL(loginCover) }, [loginCover])

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get('queue')) window.history.replaceState({}, '', '/login')
  }, [])

  useEffect(() => {
    if (!saveStored(STORAGE_PATIENTS, patients)) setStorageFailed(true)
  }, [patients])
  useEffect(() => {
    if (!saveStored(STORAGE_APPOINTMENTS, appointments)) setStorageFailed(true)
  }, [appointments])
  useEffect(() => {
    const current = queueSession?.date === dateKey(new Date()) ? queueSession : null
    if (!saveStored(STORAGE_QUEUE, current)) setStorageFailed(true)
  }, [queueSession])
  useEffect(() => {
    function syncQueue(event: StorageEvent) {
      if (event.key !== STORAGE_QUEUE) return
      try {
        const next = event.newValue ? JSON.parse(event.newValue) as QueueSession : null
        setQueueSession(isQueueSession(next) && next.date === dateKey(new Date()) ? next : null)
      } catch {
        setQueueSession(null)
      }
    }
    function syncCheckInRoute() {
      const token = new URLSearchParams(window.location.search).get('queue')
      setQueueScanToken(token)
      if (token) return
      const role = demoSessionRef.current
      if (role && window.location.pathname === demoPath(role)) {
        setDemoRole(role)
        setDemoOpen(true)
      } else showLogin(true)
    }
    window.addEventListener('storage', syncQueue)
    window.addEventListener('popstate', syncCheckInRoute)
    return () => {
      window.removeEventListener('storage', syncQueue)
      window.removeEventListener('popstate', syncCheckInRoute)
    }
  }, [])
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (demoSessionRef.current === 'Doctor' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  const todayAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.date === dateKey(new Date()) && appointment.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time)), [appointments])
  const todayQueue = queueSession?.date === dateKey(new Date()) ? queueSession : null
  const chartPatient = patients.find((patient) => patient.id === chartPatientId) ?? null
  const searchResults = search.trim().length > 1
    ? patients.filter((patient) => `${patient.name} ${patient.patientNumber} ${patient.phone}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 5)
    : []

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  function showLogin(replace = false) {
    demoSessionRef.current = null
    setDemoOpen(false)
    setModal(null); setTriageEntryId(null); setConsultEntryId(null)
    setMobileNavOpen(false); setSearch('')
    if (window.location.pathname !== '/login' || window.location.search) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', '/login')
    }
  }

  function openDemo(role: DemoRole) {
    demoSessionRef.current = role
    setDemoRole(role)
    if (role === 'Doctor') setDemoVisited(true)
    setDemoOpen(true)
    if (window.location.pathname !== demoPath(role)) window.history.pushState({}, '', demoPath(role))
  }

  function openPatient(patientId: string, tab: ChartTab = 'overview') {
    setChartPatientId(patientId)
    setChartTab(tab)
    setSearch('')
    setPage('patients')
    setMobileNavOpen(false)
  }

  function updatePatient(patientId: string, update: Partial<Patient>) {
    setPatients((current) => current.map((patient) => patient.id === patientId ? { ...patient, ...update } : patient))
  }

  function addPatient(values: { name: string; birthDate: string; sex: string; phone: string; email: string; allergy: string; allergyStatus: AllergyStatus }) {
    const patient: Patient = {
      ...values,
      id: `p-${createRandomToken()}`,
      initials: initialsFromName(values.name),
      patientNumber: `PT-${String(10500 + patients.length).padStart(5, '0')}`,
      joined: dateKey(new Date()),
      lastVisit: 'New patient',
      notes: '',
      records: [],
      prescriptions: [],
    }
    setPatients((current) => [patient, ...current])
    setModal(null)
    if (demoSessionRef.current === 'Attendant') notify('Patient registered and added to reception.')
    else { openPatient(patient.id, 'overview'); notify('Patient registered. Their chart is ready.') }
  }

  function addAppointment(values: Omit<Appointment, 'id' | 'clinician'>) {
    const overlaps = hasAppointmentConflict(values, appointments)
    if (overlaps) return 'That time overlaps an existing appointment. Choose another slot.'
    setAppointments((current) => [...current, { ...values, id: `a-${createRandomToken()}`, clinician: clinicianName }])
    setModal(null)
    setPage('appointments')
    setChartPatientId(null)
    notify('Appointment booked and added to the calendar.')
    return ''
  }

  function generateDailyQueue() {
    setQueueSession((current) => current?.date === dateKey(new Date())
      ? { ...current, token: createRandomToken(), isOpen: true }
      : { date: dateKey(new Date()), token: createRandomToken(), isOpen: true, entries: [] })
  }

  function joinQueue(token: string, details: { name: string; phone: string; birthDate: string; sex: string; allergyStatus: AllergyStatus; allergy: string }) {
    if (!todayQueue || todayQueue.date !== dateKey(new Date()) || !todayQueue.isOpen || todayQueue.token !== token) return null
    const name = details.name.trim()
    const phone = details.phone.trim()
    const duplicate = todayQueue.entries.find((entry) => entry.status !== 'completed'
      && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      && entry.phone.replace(/\D/g, '') === phone.replace(/\D/g, '')
      && entry.birthDate === details.birthDate)
    if (duplicate) return duplicate
    const existingPatient = patients.find((patient) => patient.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      && patient.phone.replace(/\D/g, '') === phone.replace(/\D/g, '') && patient.birthDate === details.birthDate)
    const patient = existingPatient ?? {
      id: `p-${createRandomToken()}`, name, initials: initialsFromName(name), birthDate: details.birthDate,
      sex: details.sex, phone, email: '', patientNumber: `PT-${String(10500 + patients.length).padStart(5, '0')}`,
      joined: dateKey(new Date()), allergy: details.allergyStatus === 'known' ? details.allergy.trim() : details.allergyStatus === 'none' ? 'No known allergies' : 'Not recorded',
      allergyStatus: details.allergyStatus, lastVisit: 'New patient', notes: '', records: [], prescriptions: [],
    } satisfies Patient
    if (!existingPatient) setPatients((current) => [patient, ...current])
    const entry: QueueEntry = {
      id: `q-${createRandomToken()}`,
      number: String(todayQueue.entries.length + 1).padStart(3, '0'),
      name,
      phone,
      joinedAt: new Date().toISOString(),
      status: 'waiting',
      patientId: patient.id,
      birthDate: details.birthDate,
      stage: 'triage',
    }
    setQueueSession((current) => current?.token === token ? { ...current, entries: [...current.entries, entry] } : current)
    return entry
  }

  function updateQueueEntry(entryId: string, status: QueueEntry['status']) {
    setQueueSession((current) => current ? {
      ...current,
      entries: current.entries.map((entry) => entry.id === entryId ? { ...entry, status } : entry),
    } : current)
  }

  function updateQueueStage(entryId: string, stage: NonNullable<QueueEntry['stage']>, triage?: QueueEntry['triage']) {
    setQueueSession((current) => current ? { ...current, entries: current.entries.map((entry) => entry.id === entryId ? { ...entry, stage, ...(triage ? { triage } : {}) } : entry) } : current)
  }

  function completeQueueVisit(entry: QueueEntry, values: { signs: string; symptoms: string; diagnosis: string; notes: string; medication: string; strength: string; instructions: string; duration: string }) {
    if (!entry.patientId) return
    const encounterId = entry.encounterId ?? entry.id
    const record: MedicalRecord = {
      id: `r-${createRandomToken()}`, date: dateKey(new Date()), signs: values.signs.trim(), symptoms: values.symptoms.trim(),
      diagnosis: values.diagnosis.trim(), notes: values.notes.trim(), encounterId, triage: entry.triage,
    }
    const prescription: Prescription | null = values.medication.trim() ? {
      id: `rx-${createRandomToken()}`, date: record.date, medication: values.medication.trim(), strength: values.strength.trim(),
      instructions: values.instructions.trim(), duration: values.duration.trim(), notes: '', encounterId,
    } : null
    setPatients((current) => current.map((patient) => patient.id === entry.patientId ? {
      ...patient, records: [record, ...patient.records], lastVisit: record.date, notes: '',
      prescriptions: prescription ? [prescription, ...patient.prescriptions] : patient.prescriptions,
    } : patient))
    setQueueSession((current) => current ? { ...current, entries: current.entries.map((item) => item.id === entry.id ? { ...item, status: 'completed', stage: 'complete', encounterId } : item) } : current)
    setConsultEntryId(null)
    notify('Visit, triage, and prescription saved to the same patient encounter.')
  }

  function resetDemo() {
    const nextPatients = createSeedPatients()
    const nextAppointments = createSeedAppointments()
    setPatients(nextPatients)
    setAppointments(nextAppointments)
    setQueueSession(null)
    setModal(null); setTriageEntryId(null); setConsultEntryId(null)
    setChartPatientId(null); setPage('dashboard')
    notify('Synthetic demo scenario reset to its starting state.')
  }

  function toggleQueue() {
    setQueueSession((current) => current ? { ...current, isOpen: !current.isOpen } : current)
  }

  function openQueueCheckIn() {
    if (!todayQueue) return
    window.history.pushState({}, '', queueLink(todayQueue.token))
    setQueueScanToken(todayQueue.token)
  }

  function closeQueueCheckIn() {
    const role = demoSessionRef.current
    window.history.replaceState({}, '', role ? demoPath(role) : '/login')
    setQueueScanToken(null)
    if (!role) showLogin(true)
  }

  function createMedicalRecord(patient: Patient, record: Omit<MedicalRecord, 'id' | 'date'>) {
    const nextRecord = { ...record, id: `r-${createRandomToken()}`, date: dateKey(new Date()) }
    updatePatient(patient.id, { records: [nextRecord, ...patient.records], lastVisit: nextRecord.date, notes: '' })
    notify('Visit summary saved to the patient history.')
  }

  function createPrescription(patient: Patient, prescription: Omit<Prescription, 'id' | 'date'>) {
    updatePatient(patient.id, { prescriptions: [{ ...prescription, id: `rx-${createRandomToken()}`, date: dateKey(new Date()) }, ...patient.prescriptions] })
    notify('Prescription added to the chart.')
  }

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setChartPatientId(null)
    setMobileNavOpen(false)
  }

  if (queueScanToken) {
    return <QueueJoinPage token={queueScanToken} session={todayQueue} storageFailed={storageFailed} onJoin={joinQueue} onBack={closeQueueCheckIn} />
  }

  const title = chartPatient ? 'Patient chart' : page === 'dashboard' ? 'Overview' : page === 'patients' ? 'Patients' : page === 'appointments' ? 'Appointments' : 'Daily queue'
  const doctorOpen = demoOpen && demoRole === 'Doctor'

  return (
    <>
    {!demoOpen && <LoginPage coverImage={loginCover} onCoverChange={setLoginCover} onDemoLogin={openDemo} onExploreDemo={() => openDemo('Doctor')} />}
    {demoOpen && demoRole === 'Patient' && <PatientDemoPage onSignOut={() => showLogin()} onCheckIn={openQueueCheckIn} queueAvailable={todayQueue?.isOpen === true} />}
    {demoOpen && demoRole === 'Attendant' && <><ReceptionDemoPage patients={patients} appointments={appointments} session={todayQueue} onSignOut={() => showLogin()} onRegister={() => setModal('walk-in')} onSchedule={() => setModal('appointment')} onTriage={setTriageEntryId} onToggleQueue={toggleQueue} />{storageFailed && <StorageWarning />}</>}
    {demoVisited && <div className="app-shell" hidden={!doctorOpen} inert={!doctorOpen || undefined} style={doctorOpen ? undefined : { display: 'none' }}>
      {mobileNavOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => navigate('dashboard')} aria-label="Northstar Clinic home">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.5} /></span>
          <span className="brand-copy"><strong>northstar</strong><small>CLINIC WORKSPACE</small></span>
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <NavButton icon={<LayoutDashboard size={18} />} label="Overview" active={page === 'dashboard' && !chartPatient} onClick={() => navigate('dashboard')} />
          <NavButton icon={<Users size={18} />} label="Patients" active={page === 'patients' && !chartPatient} onClick={() => navigate('patients')} badge={String(patients.length)} />
          <NavButton icon={<CalendarDays size={18} />} label="Appointments" active={page === 'appointments'} onClick={() => navigate('appointments')} />
          <NavButton icon={<QrCode size={18} />} label="Daily queue" active={page === 'queue'} onClick={() => navigate('queue')} badge={todayQueue ? String(todayQueue.entries.filter((entry) => entry.status === 'waiting').length) : undefined} />
        </nav>
        <div className="sidebar-label sidebar-label-spaced">CLINICAL</div>
        <nav className="primary-nav" aria-label="Clinical tools">
          <NavButton icon={<FileText size={18} />} label="Clinical notes" active={Boolean(chartPatient && chartTab === 'visit')} onClick={() => chartPatient ? setChartTab('visit') : (navigate('patients'), notify('Choose a patient to open their clinical notes.'))} />
          <NavButton icon={<Pill size={18} />} label="Prescriptions" active={Boolean(chartPatient && chartTab === 'prescriptions')} onClick={() => chartPatient ? setChartTab('prescriptions') : (navigate('patients'), notify('Choose a patient to review prescriptions.'))} />
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span className="tip-icon"><ShieldCheck size={17} /></span><div><strong>Demo workspace</strong><span>Sample records only</span></div></div>
          <div className="user-profile">
            <span className="avatar avatar-teal">MR</span>
            <span className="user-copy"><strong>Dr. Maya Reyes</strong><small>Primary care</small></span>
            <MoreHorizontal size={19} className="user-more" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
            <div className="breadcrumb"><span>Northstar Clinic</span><ChevronRight size={14} /><strong>{title}</strong></div>
          </div>
          <div className="topbar-actions">
            <button className="button button-soft demo-reset-button" onClick={resetDemo}>Reset demo</button>
            <button className="button button-secondary role-login-button" onClick={() => showLogin()}>Log in as</button>
            <div className="global-search">
              <Search size={16} />
              <input ref={searchInputRef} aria-label="Search patients" placeholder="Search patients..." value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearch('') }} />
              <kbd>⌘ K</kbd>
              {searchResults.length > 0 && <div className="search-popover">{searchResults.map((patient) => <button key={patient.id} onClick={() => openPatient(patient.id)}><Avatar patient={patient} /><span><strong>{patient.name}</strong><small>{patient.patientNumber} · {ageFromBirthDate(patient.birthDate) ?? '—'} yrs</small></span><ChevronRight size={16} /></button>)}</div>}
            </div>
            <span className="topbar-divider" />
            <NotificationMenu appointments={todayAppointments} patients={patients} onOpenPatient={openPatient} onViewAppointments={() => navigate('appointments')} />
            <div className="topbar-user"><span className="avatar avatar-teal avatar-small">MR</span><ChevronDown size={14} /></div>
          </div>
        </header>

        <main className="main-content">
          {chartPatient ? (
            <PatientChart
              key={chartPatient.id}
              patient={chartPatient}
              tab={chartTab}
              onTabChange={setChartTab}
              onBack={() => setChartPatientId(null)}
              onUpdate={(update) => updatePatient(chartPatient.id, update)}
              onAddRecord={(record) => createMedicalRecord(chartPatient, record)}
              onAddPrescription={(prescription) => createPrescription(chartPatient, prescription)}
              onSchedule={() => setModal('appointment')}
              onToast={notify}
            />
          ) : page === 'dashboard' ? (
            <Dashboard
              patients={patients}
              appointments={todayAppointments}
              onOpenPatient={openPatient}
              onNewPatient={() => setModal('walk-in')}
              onNewAppointment={() => setModal('appointment')}
              onViewAppointments={() => navigate('appointments')}
              onViewPatients={() => navigate('patients')}
            />
          ) : page === 'patients' ? (
            <PatientsPage patients={patients} onOpenPatient={openPatient} onNewPatient={() => setModal('walk-in')} />
          ) : page === 'appointments' ? (
            <AppointmentsPage appointments={appointments} patients={patients} onOpenPatient={openPatient} onNewAppointment={() => setModal('appointment')} />
          ) : (
            <DailyQueuePage
              session={todayQueue}
              onGenerate={generateDailyQueue}
              onToggleQueue={toggleQueue}
              onUpdateEntry={updateQueueEntry}
              onTriage={(entryId) => setTriageEntryId(entryId)}
              onConsult={(entryId) => { setConsultEntryId(entryId); updateQueueStage(entryId, 'consulting') }}
              onOpenHistory={(patientId) => openPatient(patientId, 'history')}
              onPreviewCheckIn={openQueueCheckIn}
            />
          )}
        </main>
        {storageFailed && <StorageWarning />}
        <footer className="page-footer"><span>Northstar Clinic workspace · Demo</span><span><span className="online-dot" />Demo data stays in this browser</span></footer>
      </div>

    </div>}

    {demoOpen && demoRole !== 'Patient' && <>
      {modal === 'walk-in' && <WalkInModal submitLabel={demoRole === 'Attendant' ? 'Register patient' : undefined} onClose={() => setModal(null)} onCreate={addPatient} />}
      {modal === 'appointment' && <AppointmentModal patients={patients} initialPatientId={chartPatientId ?? undefined} onClose={() => setModal(null)} onCreate={addAppointment} />}
      {triageEntryId && todayQueue && <TriageModal entry={todayQueue.entries.find((entry) => entry.id === triageEntryId)!} patient={patients.find((patient) => patient.id === todayQueue.entries.find((entry) => entry.id === triageEntryId)?.patientId)} onClose={() => setTriageEntryId(null)} onSave={(triage) => { updateQueueStage(triageEntryId, 'ready', triage); setTriageEntryId(null); notify('Triage saved. Patient is ready for doctor handoff.') }} />}
      {consultEntryId && todayQueue && <ConsultationModal entry={todayQueue.entries.find((entry) => entry.id === consultEntryId)!} patient={patients.find((patient) => patient.id === todayQueue.entries.find((entry) => entry.id === consultEntryId)?.patientId)} onClose={() => { updateQueueStage(consultEntryId, 'ready'); setConsultEntryId(null) }} onComplete={(values) => { const entry = todayQueue.entries.find((item) => item.id === consultEntryId); if (entry) completeQueueVisit(entry, values) }} />}
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </>}
    </>
  )
}

function DailyQueuePage({ session, onGenerate, onToggleQueue, onUpdateEntry, onTriage, onConsult, onOpenHistory, onPreviewCheckIn }: {
  session: QueueSession | null
  onGenerate: () => void
  onToggleQueue: () => void
  onUpdateEntry: (entryId: string, status: QueueEntry['status']) => void
  onTriage: (entryId: string) => void
  onConsult: (entryId: string) => void
  onOpenHistory: (patientId: string) => void
  onPreviewCheckIn: () => void
}) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrError, setQrError] = useState('')
  const [copied, setCopied] = useState(false)
  const checkInUrl = session ? queueLink(session.token) : ''
  const waiting = session?.entries.filter((entry) => entry.status === 'waiting' && entry.stage !== 'consulting') ?? []
  const called = session?.entries.find((entry) => entry.status === 'called' || entry.stage === 'consulting')
  const consulting = session?.entries.find((entry) => entry.stage === 'consulting')
  const completedCount = session?.entries.filter((entry) => entry.status === 'completed').length ?? 0
  const nextWaiting = waiting.find((entry) => !entry.stage || entry.stage === 'ready')

  useEffect(() => {
    let cancelled = false
    setQrDataUrl('')
    setQrError('')
    if (!checkInUrl) return
    QRCode.toDataURL(checkInUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#163f43', light: '#ffffff' },
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl)
    }).catch(() => {
      if (!cancelled) setQrError('The QR code could not be created. Try refreshing this page.')
    })
    return () => { cancelled = true }
  }, [checkInUrl])

  async function copyCheckInLink() {
    try {
      await navigator.clipboard.writeText(checkInUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setQrError('Copy is unavailable in this browser. Print the QR code to share it.')
    }
  }

  function callNext() {
    if (!called && nextWaiting) onUpdateEntry(nextWaiting.id, 'called')
  }

  return <div className="page-wrap queue-page">
    <div className="page-heading-row queue-heading-row">
          <div><div className="eyebrow"><span className="eyebrow-dot" />{fullDate(dateKey(new Date()))}</div><h1>Daily patient queue</h1><p>Follow a walk-in from check-in through triage, consultation, and chart history.</p></div>
      <span className={`queue-open-badge ${session?.isOpen ? 'queue-is-open' : ''}`}><i />{session ? (session.isOpen ? 'Accepting check-ins' : 'Check-in paused') : 'Not started'}</span>
    </div>

    <div className="queue-overview-grid">
      <section className="surface queue-qr-card">
        <div className="queue-qr-content">
          <div className="section-kicker">PATIENT SELF CHECK-IN</div>
          <h2>Today’s queue QR</h2>
          <p>Open the same-browser preview to register a synthetic patient and issue a queue ticket linked to their clinic chart.</p>
          {!session ? <button className="button button-primary" onClick={onGenerate}><QrCode size={16} />Generate today’s QR</button> : <div className="queue-qr-actions">
            <button className="button button-primary" onClick={onPreviewCheckIn}><QrCode size={15} />Preview patient check-in</button>
            <button className="button button-secondary" onClick={() => window.print()}><Printer size={15} />Print QR</button>
          </div>}
          {session && <div className="queue-link-row"><span className="queue-link-lock"><ShieldCheck size={14} /></span><span><strong>Unique link for today</strong><small>{session.date} · The link stops working when the queue closes.</small></span><button className="icon-button subtle-icon" aria-label="Copy patient check-in link" onClick={copyCheckInLink}><Copy size={16} /></button></div>}
          {copied && <small className="queue-copy-confirmation" role="status">Check-in link copied.</small>}
          {qrError && <small className="form-error" role="alert">{qrError}</small>}
          {session && <div className="queue-demo-note"><ShieldCheck size={15} /><span>Same-browser preview only. A separate phone cannot send data to this clinic browser without a shared server.</span></div>}
        </div>
        <div className="queue-code-wrap">
          {qrDataUrl ? <img className="queue-code-image" src={qrDataUrl} alt="QR code for today’s patient check-in" /> : <div className="queue-code-placeholder"><QrCode size={54} /><span>{session ? 'Preparing QR code…' : 'QR code appears here'}</span></div>}
          {session && <span className="queue-code-caption">SCAN TO JOIN · {session.date}</span>}
        </div>
        <div id="print-daily-qr" className="print-daily-qr">
          <div className="print-clinic"><span className="print-logo"><Activity size={18} /></span><span><strong>northstar</strong><small>Northstar Clinic · Patient check-in</small></span></div>
          <div className="print-queue-date">{fullDate(session?.date ?? dateKey(new Date()))}</div>
          {qrDataUrl && <img src={qrDataUrl} alt="Patient check-in QR code" />}
          <h2>Scan to join today’s queue</h2>
          <p>Enter your name and phone number to receive your queue number.</p>
          <small>{checkInUrl}</small>
        </div>
      </section>

      <section className="queue-summary-column" aria-label="Queue summary">
        <div className="surface queue-summary-card"><span className="queue-summary-icon queue-summary-waiting"><Clock3 size={17} /></span><strong>{waiting.length}</strong><span>Waiting</span><small>Patients not yet called</small></div>
        <div className="surface queue-summary-card"><span className="queue-summary-icon queue-summary-called"><UserRound size={17} /></span><strong>{called ? 1 : 0}</strong><span>Being seen</span><small>Currently called to the doctor</small></div>
        <div className="surface queue-summary-card"><span className="queue-summary-icon queue-summary-complete"><Check size={17} /></span><strong>{completedCount}</strong><span>Completed tickets</span><small>Includes visits and ticket-only actions</small></div>
      </section>
    </div>

    <section className="surface queue-list-card">
      <div className="queue-list-heading"><div><div className="section-kicker">TODAY’S LINE</div><h2>Patient queue <span>{session?.entries.length ?? 0}</span></h2></div><div className="queue-list-actions">
        {session && <button className="button button-secondary" onClick={onToggleQueue}>{session.isOpen ? 'Pause check-in' : 'Reopen check-in'}</button>}
        <button className="button button-primary" onClick={callNext} disabled={!nextWaiting || Boolean(called)}><ArrowRight size={15} />Call next</button>
      </div></div>
      {session?.entries.length ? <div className="queue-table">
        <div className="queue-table-header"><span>NUMBER</span><span>PATIENT</span><span>JOINED</span><span>STATUS</span><span>ACTION</span></div>
        {session.entries.map((entry) => <div className="queue-table-row" key={entry.id}>
          <strong className="queue-number">{entry.number}</strong>
          <span className="queue-patient-cell"><strong>{entry.name}</strong><small>{entry.phone}</small></span>
          <span className="queue-joined-time">{new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(entry.joinedAt))}</span>
          <span className={`queue-entry-status queue-status-${entry.status}`}><i />{entry.stage === 'triage' ? 'Needs triage' : entry.stage === 'ready' ? 'Ready for doctor' : entry.stage === 'consulting' ? 'In consultation' : entry.stage === 'complete' ? 'Visit complete' : entry.status === 'waiting' ? 'Waiting' : entry.status === 'called' ? 'Called' : 'Ticket marked seen'}</span>
          <span className="queue-entry-action">{entry.stage === 'triage' ? <button onClick={() => onTriage(entry.id)}>Record triage</button> : entry.stage === 'ready' ? <button disabled={Boolean(consulting)} onClick={() => onConsult(entry.id)}>Start consultation</button> : entry.stage === 'consulting' ? <span>In consultation</span> : entry.stage === 'complete' && entry.patientId ? <button onClick={() => onOpenHistory(entry.patientId!)}>View history</button> : entry.status === 'called' ? <button onClick={() => onUpdateEntry(entry.id, 'completed')}>Mark ticket seen</button> : entry.status === 'waiting' ? <button disabled={Boolean(called)} onClick={() => onUpdateEntry(entry.id, 'called')}>Call ticket</button> : <CheckCircle2 size={17} aria-label="Ticket marked seen" />}</span>
        </div>)}
      </div> : <div className="queue-empty-state"><span><Users size={21} /></span><strong>No patients in line yet</strong><p>When a patient checks in with today’s QR, their number will appear here.</p>{session && <button className="text-button" onClick={onPreviewCheckIn}>Preview the patient check-in form <ArrowRight size={14} /></button>}</div>}
    </section>
  </div>
}

function StorageWarning() {
  return <p className="form-error" role="alert">Browser storage is unavailable. Changes may be lost when you reload.</p>
}

function QueueJoinPage({ token, session, storageFailed, onJoin, onBack }: {
  token: string
  session: QueueSession | null
  storageFailed: boolean
  onJoin: (token: string, details: { name: string; phone: string; birthDate: string; sex: string; allergyStatus: AllergyStatus; allergy: string }) => QueueEntry | null
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [sex, setSex] = useState('')
  const [allergyStatus, setAllergyStatus] = useState<AllergyStatus>('unknown')
  const [allergy, setAllergy] = useState('')
  const [receipt, setReceipt] = useState<QueueEntry | null>(null)
  const [error, setError] = useState('')
  const isValidSession = session?.token === token && session.date === dateKey(new Date())

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!isValidSession || !session?.isOpen) {
      setError('This clinic queue is no longer accepting check-ins.')
      return
    }
    if (!name.trim() || !phone.trim() || !/\d/.test(phone) || ageFromBirthDate(birthDate) === null || !sex || (allergyStatus === 'known' && !allergy.trim())) {
      setError('Enter your name, phone, valid date of birth, sex, and allergy details when known.')
      return
    }
    const joined = onJoin(token, { name, phone, birthDate, sex, allergyStatus, allergy })
    if (!joined) {
      setError('This clinic queue is no longer accepting check-ins.')
      return
    }
    setReceipt(joined)
    setError('')
  }

  return <main className="queue-checkin-shell">
    <header className="queue-checkin-brand"><span className="brand-mark"><Activity size={19} strokeWidth={2.5} /></span><span className="brand-copy"><strong>northstar</strong><small>CLINIC WORKSPACE</small></span></header>
    <section className="surface queue-checkin-card">
      <div className="queue-checkin-icon"><QrCode size={20} /></div>
      <div className="section-kicker">PATIENT SELF CHECK-IN</div>
      <h1>{receipt ? 'You’re in the queue' : 'Join today’s queue'}</h1>
      <p className="queue-checkin-intro">{fullDate(dateKey(new Date()))} · Same-browser demo preview</p>
      {storageFailed && <StorageWarning />}
      {receipt ? <div className="queue-ticket" role="status">
        <span>Your queue number</span><strong>{receipt.number}</strong><small>Please keep this screen open and listen for your number.</small>
        <div className="queue-ticket-person"><span>{receipt.name}</span><span>Checked in at {new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(receipt.joinedAt))}</span></div>
      </div> : !isValidSession ? <div className="queue-unavailable" role="alert">
        <span><Clock3 size={18} /></span><strong>This check-in link isn’t connected</strong><p>This demo stores queue entries in the browser that created the QR. Use the clinic’s preview on that browser; patient phones need a shared server to join the same queue.</p>
      </div> : !session?.isOpen ? <div className="queue-unavailable" role="status">
        <span><Clock3 size={18} /></span><strong>Check-in is paused</strong><p>The clinic has paused today’s queue. Please ask the receptionist for help.</p>
      </div> : <form className="queue-checkin-form" onSubmit={submit}>
        <p>This synthetic demo registration creates a patient chart and a queue ticket on this browser only.</p>
        <Field label="Full name" required><input autoComplete="name" maxLength={160} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your first and last name" /></Field>
        <Field label="Phone number" required><input autoComplete="tel" type="tel" maxLength={32} required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Your phone number" /></Field>
        <Field label="Date of birth" required><input type="date" required value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></Field>
        <Field label="Sex" required><select required value={sex} onChange={(event) => setSex(event.target.value)}><option value="">Select</option><option>Female</option><option>Male</option><option>Intersex</option><option>Prefer not to say</option></select></Field>
        <Field label="Allergy status" required><select value={allergyStatus} onChange={(event) => setAllergyStatus(event.target.value as AllergyStatus)}><option value="unknown">Not yet known</option><option value="none">No known allergies</option><option value="known">Known allergy</option></select></Field>
        {allergyStatus === 'known' && <Field label="Known allergies" required><input required value={allergy} onChange={(event) => setAllergy(event.target.value)} placeholder="Enter allergy details" /></Field>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="queue-checkin-note"><ShieldCheck size={15} /><span>The QR and registration preview work in this browser only. This is not a live phone-to-clinic check-in.</span></div>
        <button className="button button-primary" type="submit"><QrCode size={16} />Get my queue number</button>
      </form>}
      <button className="queue-back-link" onClick={onBack}><ArrowLeft size={14} />Back to clinic</button>
    </section>
    <p className="queue-checkin-footer">Northstar Clinic · Demo check-in</p>
  </main>
}

function TriageModal({ entry, patient, onClose, onSave }: { entry: QueueEntry; patient?: Patient; onClose: () => void; onSave: (triage: NonNullable<QueueEntry['triage']>) => void }) {
  const [triage, setTriage] = useState({ complaint: '', notes: '', bloodPressure: '', weight: '', temperature: '' })
  const [confirmed, setConfirmed] = useState(false)
  return <div className="modal-backdrop"><form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="triage-title" onSubmit={(event) => { event.preventDefault(); onSave(triage) }}>
    <div className="modal-header"><div><div className="section-kicker">QUEUE {entry.number} · ATTENDANT HANDOFF</div><h2 id="triage-title">Record triage</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <div className="linked-patient-banner"><strong>{patient?.name ?? entry.name}</strong><span>{patient?.patientNumber ?? 'Chart not linked'} · DOB {patient?.birthDate ?? 'not recorded'}</span><small>Allergies: {patient?.allergy ?? 'not recorded'}</small></div>
    <p className="modal-copy">Review both chart identifiers with the patient or representative. Queue number alone does not confirm identity.</p>
    <Field label="Chief complaint" required><input required value={triage.complaint} onChange={(event) => setTriage({ ...triage, complaint: event.target.value })} /></Field>
    <Field label="Initial notes"><textarea value={triage.notes} onChange={(event) => setTriage({ ...triage, notes: event.target.value })} /></Field>
    <div className="form-row"><Field label="Blood pressure"><input value={triage.bloodPressure} onChange={(event) => setTriage({ ...triage, bloodPressure: event.target.value })} placeholder="e.g. 120/80" /></Field><Field label="Weight (kg)"><input type="number" min="0" step="0.1" value={triage.weight} onChange={(event) => setTriage({ ...triage, weight: event.target.value })} /></Field><Field label="Temperature (°C)"><input type="number" min="25" max="45" step="0.1" value={triage.temperature} onChange={(event) => setTriage({ ...triage, temperature: event.target.value })} /></Field></div>
    <label className="role-confirm"><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this patient's chart and confirmed their identity.</label>
    <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Save triage & hand off</button></div>
  </form></div>
}

function ConsultationModal({ entry, patient, onClose, onComplete }: { entry: QueueEntry; patient?: Patient; onClose: () => void; onComplete: (values: { signs: string; symptoms: string; diagnosis: string; notes: string; medication: string; strength: string; instructions: string; duration: string }) => void }) {
  const [values, setValues] = useState({ signs: '', symptoms: '', diagnosis: '', notes: '', medication: '', strength: '', instructions: '', duration: '' })
  const [confirmed, setConfirmed] = useState(false)
  const update = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }))
  return <div className="modal-backdrop"><form className="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="consult-title" onSubmit={(event) => { event.preventDefault(); onComplete(values) }}>
    <div className="modal-header"><div><div className="section-kicker">QUEUE {entry.number} · DOCTOR</div><h2 id="consult-title">Complete visit</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <div className="linked-patient-banner"><strong>{patient?.name ?? entry.name}</strong><span>{patient?.patientNumber ?? 'Chart not linked'} · DOB {patient?.birthDate ?? 'not recorded'}</span><small>Allergies: {patient?.allergy ?? 'not recorded'}</small></div>
    {entry.triage && <div className="linked-triage"><strong>Attendant triage</strong><span>{entry.triage.complaint}</span><small>{entry.triage.notes} {entry.triage.bloodPressure && `· BP ${entry.triage.bloodPressure}`} {entry.triage.temperature && `· ${entry.triage.temperature}°C`} {entry.triage.weight && `· ${entry.triage.weight} kg`}</small></div>}
    <label className="role-confirm"><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirmed the patient identity and reviewed the allergy information.</label>
    <div className="form-row"><Field label="Symptoms"><textarea value={values.symptoms} onChange={(event) => update('symptoms', event.target.value)} /></Field><Field label="Signs"><textarea value={values.signs} onChange={(event) => update('signs', event.target.value)} /></Field></div>
    <Field label="Assessment / diagnosis" required><input required value={values.diagnosis} onChange={(event) => update('diagnosis', event.target.value)} /></Field>
    <Field label="Consultation notes" required><textarea required value={values.notes} onChange={(event) => update('notes', event.target.value)} /></Field>
    <details className="demo-prescription-fields"><summary>Add prescription to this encounter (optional draft)</summary><div className="form-row"><Field label="Medication"><input value={values.medication} onChange={(event) => update('medication', event.target.value)} /></Field><Field label="Strength"><input value={values.strength} onChange={(event) => update('strength', event.target.value)} /></Field></div><Field label="Directions"><textarea value={values.instructions} onChange={(event) => update('instructions', event.target.value)} /></Field><Field label="Duration"><input value={values.duration} onChange={(event) => update('duration', event.target.value)} /></Field><small>Saved as a demo draft linked to this encounter; not a finalized prescription.</small></details>
    <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Continue later</button><button className="button button-primary" type="submit"><Check size={16} />Save visit to patient history</button></div>
  </form></div>
}

function NavButton({ icon, label, active, onClick, badge }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void; badge?: string }) {
  return <button className={`nav-button ${active ? 'nav-active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{badge && <small>{badge}</small>}</button>
}

type MoreMenuItem = { label: string; icon: ReactNode; onSelect: () => void }

function MoreMenu({ label, items }: { label: string; items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function dismiss(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return <div className="more-menu" ref={menuRef}>
    <button type="button" className="icon-button subtle-icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><MoreHorizontal size={19} /></button>
    {open && <div className="more-menu-popover" role="menu">{items.map((item) => <button type="button" role="menuitem" key={item.label} onClick={() => { setOpen(false); item.onSelect() }}>{item.icon}<span>{item.label}</span></button>)}</div>}
  </div>
}

function NotificationMenu({ appointments, patients, onOpenPatient, onViewAppointments }: { appointments: Appointment[]; patients: Patient[]; onOpenPatient: (id: string) => void; onViewAppointments: () => void }) {
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const checkedIn = appointments.filter((appointment) => appointment.status === 'checked_in')
  const unreadCount = checkedIn.filter((appointment) => !readIds.includes(appointment.id)).length
  useEffect(() => {
    if (!open) return
    function dismiss(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return <div className="notification-wrap" ref={panelRef}>
    <button type="button" className="icon-button notification-button" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      if (!open) setReadIds((current) => [...new Set([...current, ...checkedIn.map((appointment) => appointment.id)])])
      setOpen((current) => !current)
    }}><Bell size={18} />{unreadCount > 0 && <i />}</button>
    {open && <div className="notifications-popover" role="dialog" aria-label="Clinic notifications"><div className="notifications-heading"><div><strong>Clinic updates</strong><small>{todayLabel()}</small></div><span>{checkedIn.length} checked in</span></div>{checkedIn.length ? <div className="notification-items">{checkedIn.map((appointment) => {
      const patient = patients.find((item) => item.id === appointment.patientId)
      return patient ? <button className="notification-item" key={appointment.id} onClick={() => { setOpen(false); onOpenPatient(patient.id) }}><span className="notification-item-icon"><UserRound size={15} /></span><span><strong>{patient.name} checked in</strong><small>{formatTime(appointment.time)} · {appointment.reason}</small></span><ChevronRight size={15} /></button> : null
    })}</div> : <div className="notification-empty"><span><CheckCircle2 size={18} /></span><strong>No new updates</strong><small>Patient check-ins will appear here.</small></div>}<button className="notifications-footer" onClick={() => { setOpen(false); onViewAppointments() }}>Open today’s schedule <ArrowRight size={14} /></button></div>}
  </div>
}

function Avatar({ patient, large = false }: { patient: Pick<Patient, 'initials'>; large?: boolean }) {
  return <span className={`avatar avatar-patient ${large ? 'avatar-large' : ''}`}>{patient.initials}</span>
}

function Dashboard({ patients, appointments, onOpenPatient, onNewPatient, onNewAppointment, onViewAppointments, onViewPatients }: {
  patients: Patient[]; appointments: Appointment[]; onOpenPatient: (id: string) => void; onNewPatient: () => void; onNewAppointment: () => void; onViewAppointments: () => void; onViewPatients: () => void
}) {
  const checkedIn = appointments.filter((appointment) => appointment.status === 'checked_in').length
  const todayCompleted = appointments.filter((appointment) => appointment.status === 'completed').length
  const recentPatients = [...patients].sort((a, b) => b.joined.localeCompare(a.joined)).slice(0, 3)
  return (
    <div className="page-wrap dashboard-page">
      <div className="welcome-row">
        <div><div className="eyebrow"><span className="eyebrow-dot" />{todayLabel()}</div><h1>Good morning, Maya <span className="wave">✳</span></h1><p>Here’s what’s happening at your clinic today.</p></div>
        <div className="welcome-actions"><button className="button button-secondary" onClick={onNewAppointment}><CalendarPlus size={16} />Schedule appointment</button><button className="button button-primary" onClick={onNewPatient}><UserRoundPlus size={16} />New walk-in</button></div>
      </div>

      <section className="stat-grid" aria-label="Clinic summary">
        <StatCard icon={<Users size={17} />} label="Demo patient charts" value={String(patients.length)} note="Synthetic browser data" tone="mint" />
        <StatCard icon={<CalendarDays size={17} />} label="Appointments today" value={String(appointments.length)} note={`${todayCompleted} appointments completed`} tone="blue" />
        <StatCard icon={<Clock3 size={17} />} label="Waiting now" value={String(checkedIn)} note={checkedIn ? `${checkedIn} patient${checkedIn === 1 ? '' : 's'} checked in` : 'No patients waiting'} tone="amber" />
        <StatCard icon={<FileText size={17} />} label="Visits in history" value={String(patients.reduce((count, patient) => count + patient.records.filter((record) => record.date === dateKey(new Date())).length, 0))} note="Saved demo encounter notes" tone="violet" />
      </section>

      <div className="dashboard-grid">
        <section className="surface agenda-card">
          <div className="section-heading"><div><div className="section-kicker">YOUR DAY</div><h2>Today’s schedule</h2></div><button className="text-button" onClick={onViewAppointments}>Full calendar <ArrowRight size={15} /></button></div>
          <div className="agenda-summary"><div className="agenda-count"><strong>{String(appointments.length).padStart(2, '0')}</strong><span>appointments</span></div><div className="agenda-progress"><div><span style={{ width: `${appointments.length ? Math.max(14, (todayCompleted / appointments.length) * 100) : 0}%` }} /></div><small>{todayCompleted} of {appointments.length} completed</small></div><div className="agenda-day"><CalendarDays size={16} /><span>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date())}</span></div></div>
          <div className="appointment-list">
            {appointments.length ? appointments.map((appointment) => {
              const patient = patients.find((item) => item.id === appointment.patientId)
              if (!patient) return null
              return <AppointmentRow key={appointment.id} appointment={appointment} patient={patient} onClick={() => onOpenPatient(patient.id)} />
            }) : <EmptyState icon={<CalendarDays size={21} />} title="Your schedule is clear" text="Add an appointment to start filling today’s calendar." action="Schedule appointment" onClick={onNewAppointment} />}
          </div>
          <button className="agenda-bottom-link" onClick={onViewAppointments}>View complete schedule <ArrowRight size={15} /></button>
        </section>

        <div className="dashboard-side">
          <section className="surface flow-card">
            <div className="section-heading compact-heading"><div><div className="section-kicker">AT A GLANCE</div><h2>Clinic flow</h2></div><MoreMenu label="More clinic flow options" items={[{ label: 'Open full calendar', icon: <CalendarDays size={15} />, onSelect: onViewAppointments }, { label: 'Book an appointment', icon: <CalendarPlus size={15} />, onSelect: onNewAppointment }]} /></div>
            <div className="flow-steps">
              <div className="flow-step"><span className="flow-step-icon flow-booked"><CalendarDays size={16} /></span><span className="flow-step-label"><strong>Booked</strong><small>Appointments confirmed</small></span><span className="flow-step-count">{appointments.length}</span></div>
              <div className="flow-connector" />
              <div className="flow-step"><span className="flow-step-icon flow-arrived"><UserRound size={16} /></span><span className="flow-step-label"><strong>Checked in</strong><small>Patient arrived</small></span><span className="flow-step-count">{checkedIn}</span></div>
              <div className="flow-connector" />
              <div className="flow-step"><span className="flow-step-icon flow-complete"><Check size={16} /></span><span className="flow-step-label"><strong>Appointments completed</strong><small>Appointment status</small></span><span className="flow-step-count">{todayCompleted}</span></div>
            </div>
            <div className="flow-footnote"><span className="live-indicator" />Demo clinic overview <span>Saved locally</span></div>
          </section>

          <section className="quick-card">
            <div className="quick-card-orb orb-one" /><div className="quick-card-orb orb-two" />
            <div className="quick-card-content"><span className="quick-eyebrow"><Sparkle />QUICK ACTION</span><h3>Someone new at the door?</h3><p>Register a walk-in and open their chart in one step.</p><button onClick={onNewPatient}>Start registration <ArrowRight size={15} /></button></div>
            <div className="quick-illustration"><div className="illustration-circle"><UserRoundPlus size={25} /></div><span /><i /></div>
          </section>

          <section className="surface recent-card">
            <div className="section-heading compact-heading"><div><div className="section-kicker">PATIENTS</div><h2>Recently added</h2></div><button className="icon-button subtle-icon" aria-label="Open patient directory" onClick={onViewPatients}><ArrowUpRight size={17} /></button></div>
            {recentPatients.map((patient) => <button className="recent-patient" key={patient.id} onClick={() => onOpenPatient(patient.id)}><Avatar patient={patient} /><span><strong>{patient.name}</strong><small>{patient.patientNumber}</small></span><ChevronRight size={15} /></button>)}
            {recentPatients.length === 0 && <button className="recent-empty" onClick={onNewPatient}>No patients yet — register a walk-in <ArrowRight size={13} /></button>}
          </section>
        </div>
      </div>
    </div>
  )
}

function Sparkle() {
  return <span className="sparkle-mark">✦</span>
}

function StatCard({ icon, label, value, note, tone, trend }: { icon: ReactNode; label: string; value: string; note: string; tone: string; trend?: string }) {
  return <div className="surface stat-card"><div className="stat-top"><span className={`stat-icon stat-${tone}`}>{icon}</span>{trend && <span className="stat-trend"><ArrowUpRight size={13} />{trend}</span>}</div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div></div>
}

function AppointmentRow({ appointment, patient, onClick }: { appointment: Appointment; patient: Patient; onClick: () => void }) {
  return <button className="appointment-row" onClick={onClick}><span className="appointment-time"><strong>{formatTime(appointment.time)}</strong><i /></span><Avatar patient={patient} /><span className="appointment-info"><strong>{patient.name}</strong><small>{appointment.reason}</small></span><StatusBadge status={appointment.status} /><ChevronRight size={16} className="row-chevron" /></button>
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function StatusBadge({ status }: { status: Appointment['status'] }) {
  const labels: Record<Appointment['status'], string> = { scheduled: 'Scheduled', confirmed: 'Confirmed', checked_in: 'Checked in', completed: 'Completed', cancelled: 'Cancelled' }
  return <span className={`status-badge status-${status}`}>{status === 'checked_in' && <i />}{labels[status]}</span>
}

function EmptyState({ icon, title, text, action, onClick }: { icon: ReactNode; title: string; text: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{text}</p><button className="text-button" onClick={onClick}>{action}<ArrowRight size={14} /></button></div>
}

function PatientsPage({ patients, onOpenPatient, onNewPatient }: { patients: Patient[]; onOpenPatient: (id: string) => void; onNewPatient: () => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'recent'>('all')
  const [allergyFilter, setAllergyFilter] = useState<'all' | 'known' | 'none' | 'unrecorded'>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(0)
  const filterControlRef = useRef<HTMLDivElement>(null)
  const pageSize = 4
  useEffect(() => {
    if (!filtersOpen) return
    function dismiss(event: MouseEvent) {
      if (!filterControlRef.current?.contains(event.target as Node)) setFiltersOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [filtersOpen])
  const filteredPatients = patients.filter((patient) => {
    const matchesQuery = `${patient.name} ${patient.patientNumber} ${patient.phone} ${patient.email}`.toLowerCase().includes(query.trim().toLowerCase())
    const matchesAllergy = allergyFilter === 'all'
      || allergyFilter === 'known' && patient.allergyStatus === 'known'
      || allergyFilter === 'none' && patient.allergyStatus === 'none'
      || allergyFilter === 'unrecorded' && patient.allergyStatus === 'unknown'
    return matchesQuery && matchesAllergy
  })
  const orderedPatients = filter === 'recent'
    ? [...filteredPatients].sort((a, b) => b.joined.localeCompare(a.joined))
    : [...filteredPatients].sort((a, b) => a.name.localeCompare(b.name))
  const pageCount = Math.max(1, Math.ceil(orderedPatients.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pagePatients = orderedPatients.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const firstShown = orderedPatients.length ? currentPage * pageSize + 1 : 0
  const lastShown = Math.min((currentPage + 1) * pageSize, orderedPatients.length)
  function resetFilters() {
    setQuery('')
    setFilter('all')
    setAllergyFilter('all')
    setPage(0)
    setFiltersOpen(false)
  }
  return <div className="page-wrap directory-page">
    <div className="page-heading-row"><div><div className="eyebrow">CARE DIRECTORY</div><h1>Patients</h1><p>Find a patient, review their chart, or register someone new.</p></div><button className="button button-primary" onClick={onNewPatient}><UserRoundPlus size={16} />Register patient</button></div>
    <div className="directory-toolbar surface"><div className="directory-search"><Search size={17} /><input placeholder="Search by name, patient ID, or phone" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></div><div className="segmented-control"><button className={filter === 'all' ? 'segment-active' : ''} onClick={() => { setFilter('all'); setPage(0) }}>All patients <span>{filteredPatients.length}</span></button><button className={filter === 'recent' ? 'segment-active' : ''} onClick={() => { setFilter('recent'); setPage(0) }}>Recently added</button></div><div className="filter-control" ref={filterControlRef}><button className={`filter-button ${allergyFilter !== 'all' ? 'filter-active' : ''}`} aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen((current) => !current)}><Settings2 size={16} />Filters{allergyFilter !== 'all' && <span className="filter-count">1</span>}</button>{filtersOpen && <div className="filter-popover" role="dialog" aria-label="Patient filters"><div className="filter-popover-title"><strong>Filter patients</strong><button type="button" onClick={() => { setAllergyFilter('all'); setPage(0) }}>Clear</button></div><label><span>Allergy status</span><select value={allergyFilter} onChange={(event) => { setAllergyFilter(event.target.value as typeof allergyFilter); setPage(0) }}><option value="all">Any status</option><option value="known">Has known allergies</option><option value="none">No known allergies</option><option value="unrecorded">Not recorded</option></select></label><small>{filteredPatients.length} matching patients</small></div>}</div></div>
    <section className="surface patient-table-card"><div className="table-heading"><div><h2>Patient directory</h2><span>{orderedPatients.length} records</span></div><MoreMenu label="More patient list options" items={[{ label: 'Reset search and filters', icon: <Settings2 size={15} />, onSelect: resetFilters }, { label: 'Register a patient', icon: <UserRoundPlus size={15} />, onSelect: onNewPatient }]} /></div>
      <div className="patient-table-scroll"><table className="patient-table"><thead><tr><th>Patient</th><th>Patient ID</th><th>Age · Sex</th><th>Last visit</th><th>Allergies</th><th /></tr></thead><tbody>{pagePatients.map((patient) => <tr key={patient.id} tabIndex={0} onClick={() => onOpenPatient(patient.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenPatient(patient.id) } }}><td><div className="patient-cell"><Avatar patient={patient} /><span><strong>{patient.name}</strong><small>{patient.email || patient.phone}</small></span></div></td><td><span className="patient-id">{patient.patientNumber}</span></td><td>{ageFromBirthDate(patient.birthDate) ?? '—'} yrs <span className="muted-dot">·</span> {patient.sex || '—'}</td><td>{patient.lastVisit === 'New patient' ? <span className="muted-copy">New patient</span> : shortDate(patient.lastVisit)}</td><td><span className={`allergy-pill ${patient.allergyStatus === 'none' ? 'allergy-none' : ''}`}>{patient.allergy}</span></td><td><ChevronRight size={16} className="row-chevron" /></td></tr>)}</tbody></table></div>
      {orderedPatients.length === 0 && <div className="table-empty">No patients match your search and filters.</div>}
      <div className="table-footer"><span>Showing <strong>{firstShown}–{lastShown}</strong> of <strong>{orderedPatients.length}</strong> patients</span><div><button className="pagination-button" aria-label="Previous patient page" disabled={currentPage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={16} /></button><button className="pagination-button" aria-label="Next patient page" disabled={currentPage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}><ChevronRight size={16} /></button></div></div>
    </section>
  </div>
}

function PatientChart({ patient, tab, onTabChange, onBack, onUpdate, onAddRecord, onAddPrescription, onSchedule, onToast }: {
  patient: Patient; tab: ChartTab; onTabChange: (tab: ChartTab) => void; onBack: () => void; onUpdate: (update: Partial<Patient>) => void;
  onAddRecord: (record: Omit<MedicalRecord, 'id' | 'date'>) => void; onAddPrescription: (prescription: Omit<Prescription, 'id' | 'date'>) => void; onSchedule: () => void; onToast: (message: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [signs, setSigns] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [rxForm, setRxForm] = useState({ medication: '', strength: '', instructions: '', duration: '', notes: '' })
  const [savedRx, setSavedRx] = useState<Prescription | null>(null)
  useEffect(() => {
    setSaving(true)
    const timer = window.setTimeout(() => setSaving(false), 550)
    return () => window.clearTimeout(timer)
  }, [patient.notes])

  function saveRecord(event: FormEvent) {
    event.preventDefault()
    if (!signs.trim() && !symptoms.trim() && !diagnosis.trim() && !patient.notes.trim()) {
      onToast('Add a note, signs, symptoms, or diagnosis before saving.')
      return
    }
    onAddRecord({ signs: signs.trim(), symptoms: symptoms.trim(), diagnosis: diagnosis.trim(), notes: patient.notes.trim() })
    setSigns(''); setSymptoms(''); setDiagnosis('')
    onTabChange('history')
  }

  function savePrescription(event: FormEvent) {
    event.preventDefault()
    if (!rxForm.medication.trim()) return
    const prescription = { ...rxForm, medication: rxForm.medication.trim() }
    onAddPrescription(prescription)
    setSavedRx({ ...prescription, id: `preview-${createRandomToken()}`, date: dateKey(new Date()) })
    setRxForm({ medication: '', strength: '', instructions: '', duration: '', notes: '' })
  }

  async function copyPatientId() {
    try {
      await navigator.clipboard.writeText(patient.patientNumber)
      onToast(`Copied ${patient.patientNumber}.`)
    } catch {
      onToast('Clipboard access is unavailable in this browser.')
    }
  }

  const tabs: { id: ChartTab; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity size={15} /> },
    { id: 'visit', label: 'Visit notes', icon: <MessageSquareText size={15} /> },
    { id: 'history', label: 'Medical history', icon: <FileText size={15} /> },
    { id: 'prescriptions', label: 'Prescriptions', icon: <Pill size={15} /> },
  ]
  return <div className="page-wrap chart-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} />Back to patients</button>
    <section className="surface profile-hero">
      <div className="profile-main"><Avatar patient={patient} large /><div className="profile-identity"><div className="profile-name-line"><h1>{patient.name}</h1><span className="profile-active"><i />Active patient</span></div><div className="profile-meta"><span>{patient.patientNumber}</span><i />{ageFromBirthDate(patient.birthDate) ?? 'Age not recorded'}{ageFromBirthDate(patient.birthDate) === null ? '' : ' years old'}<i />{patient.sex || 'Sex not recorded'}<i />Patient since {shortDate(patient.joined)}</div><div className="profile-contact"><span><span className="contact-symbol">⌕</span>{patient.phone || 'No phone on file'}</span><span><span className="contact-symbol">✉</span>{patient.email || 'No email on file'}</span></div></div></div>
      <div className="profile-actions"><button className="button button-secondary" onClick={onSchedule}><CalendarPlus size={15} />Schedule</button><button className="button button-primary" onClick={() => onTabChange('visit')}><Plus size={16} />Start visit</button><MoreMenu label="More patient actions" items={[{ label: 'Copy patient ID', icon: <Copy size={15} />, onSelect: () => { void copyPatientId() } }, { label: 'Schedule appointment', icon: <CalendarPlus size={15} />, onSelect: onSchedule }]} /></div>
    </section>
    <div className="chart-alert"><span className="alert-icon"><HeartPulse size={15} /></span><span><strong>Allergies:</strong> {patient.allergy}</span><span className="alert-divider" /><span><strong>Last visit:</strong> {patient.lastVisit === 'New patient' ? 'No visits yet' : shortDate(patient.lastVisit)}</span><button onClick={() => onTabChange('history')}>View history <ArrowRight size={13} /></button></div>
    <div className="chart-tabs">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'chart-tab chart-tab-active' : 'chart-tab'} onClick={() => onTabChange(item.id)}>{item.icon}{item.label}{item.id === 'history' && <span>{patient.records.length}</span>}{item.id === 'prescriptions' && <span>{patient.prescriptions.length}</span>}</button>)}</div>

    {tab === 'overview' && <div className="chart-content chart-overview-grid">
      <div className="chart-main-column"><section className="surface detail-card"><div className="section-heading"><div><div className="section-kicker">PATIENT SNAPSHOT</div><h2>Overview</h2></div><span className="updated-chip"><Check size={13} />Chart up to date</span></div><div className="snapshot-grid"><InfoBlock label="Date of birth" value={patient.birthDate ? `${shortDate(patient.birthDate)}, ${new Date(`${patient.birthDate}T12:00:00`).getFullYear()}` : 'Not provided'} /><InfoBlock label="Sex" value={patient.sex || 'Not provided'} /><InfoBlock label="Phone number" value={patient.phone || 'Not provided'} /><InfoBlock label="Email address" value={patient.email || 'Not provided'} /><InfoBlock label="Patient ID" value={patient.patientNumber} /><InfoBlock label="Known allergies" value={patient.allergy} alert={patient.allergyStatus !== 'none'} /></div></section>
        <section className="surface detail-card recent-note-card"><div className="section-heading"><div><div className="section-kicker">LATEST DOCUMENTATION</div><h2>Recent clinical note</h2></div><button className="text-button" onClick={() => onTabChange('history')}>Full history <ArrowRight size={14} /></button></div>{patient.records[0] ? <RecordSummary record={patient.records[0]} /> : <div className="empty-inline"><span><FileText size={19} /></span><div><strong>No visit notes yet</strong><p>Start a visit to add the first note to this chart.</p></div><button className="button button-soft" onClick={() => onTabChange('visit')}>Start visit</button></div>}</section>
      </div>
      <aside className="chart-side-column"><section className="surface side-detail-card"><div className="section-heading compact-heading"><div><div className="section-kicker">QUICK ACTIONS</div><h2>Patient care</h2></div></div><button className="care-action" onClick={() => onTabChange('visit')}><span className="care-icon care-note"><MessageSquareText size={17} /></span><span><strong>Write a visit note</strong><small>Document today’s encounter</small></span><ChevronRight size={16} /></button><button className="care-action" onClick={() => onTabChange('prescriptions')}><span className="care-icon care-rx"><Pill size={17} /></span><span><strong>Create prescription</strong><small>Add medication instructions</small></span><ChevronRight size={16} /></button><button className="care-action" onClick={onSchedule}><span className="care-icon care-appt"><CalendarPlus size={17} /></span><span><strong>Book appointment</strong><small>Choose a date and time</small></span><ChevronRight size={16} /></button></section>
        <section className="surface side-detail-card allergies-card"><div className="allergy-heading"><span><HeartPulse size={16} /></span><div><strong>Allergy information</strong><small>Review before prescribing</small></div></div><div className={patient.allergy === 'No known allergies' ? 'allergy-state allergy-state-clear' : 'allergy-state'}>{patient.allergy}</div><p>Confirm allergy status with the patient during each visit.</p></section>
      </aside>
    </div>}

    {tab === 'visit' && <div className="chart-content visit-grid">
      <section className="surface note-workspace"><div className="note-toolbar"><div><div className="section-kicker">CURRENT ENCOUNTER</div><h2>Visit documentation</h2></div><span className="autosave-state"><span className={saving ? 'save-dot saving-dot' : 'save-dot'} />{saving ? 'Saving note…' : 'Saved just now'}</span></div>
        <div className="encounter-banner"><span className="encounter-icon"><Stethoscope size={18} /></span><div><strong>Office visit</strong><small>{fullDate(dateKey(new Date()))} · {clinicianName}</small></div><span className="encounter-status">In progress</span></div>
        <label className="field-label" htmlFor="live-note">Interview notes <span className="field-hint">Live-saved</span></label><textarea id="live-note" className="note-textarea" placeholder="Document the conversation as you go. Notes save automatically while you type…" value={patient.notes} onChange={(event) => onUpdate({ notes: event.target.value })} />
        <div className="note-fields"><Field label="Signs" hint="Observed findings"><textarea value={signs} onChange={(event) => setSigns(event.target.value)} placeholder="e.g. Blood pressure, temperature, exam findings" /></Field><Field label="Symptoms" hint="Patient reported"><textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} placeholder="e.g. Onset, duration, and associated symptoms" /></Field><Field label="Assessment / diagnosis"><input value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder="Add a working diagnosis" /></Field></div>
        <div className="note-footer"><span><ShieldCheck size={14} />This note is stored in this browser demo.</span><button className="button button-primary" onClick={saveRecord}><Check size={16} />Save visit to chart</button></div>
      </section>
      <aside className="surface visit-context"><div className="section-kicker">CHART CONTEXT</div><h3>At a glance</h3><div className="context-patient"><Avatar patient={patient} /><span><strong>{patient.name}</strong><small>{ageFromBirthDate(patient.birthDate) ?? '—'} yrs · {patient.sex || '—'}</small></span></div><div className="context-divider" /><div className="context-row"><span>Allergies</span><strong className={patient.allergyStatus === 'none' ? 'context-good' : 'context-alert'}>{patient.allergy}</strong></div><div className="context-row"><span>Previous visits</span><strong>{patient.records.length}</strong></div><div className="context-row"><span>Active prescriptions</span><strong>{patient.prescriptions.length}</strong></div><button className="context-history-link" onClick={() => onTabChange('history')}>Review medical history <ArrowRight size={14} /></button><div className="context-tip"><span><ShieldCheck size={15} /></span><p>Keep notes clear and factual. Review the chart before saving the encounter.</p></div></aside>
    </div>}

    {tab === 'history' && <div className="chart-content"><section className="surface history-card"><div className="section-heading"><div><div className="section-kicker">LONGITUDINAL RECORD</div><h2>Medical history</h2></div><button className="button button-soft" onClick={() => onTabChange('visit')}><Plus size={15} />Add visit note</button></div>{patient.records.length ? <div className="timeline">{patient.records.map((record) => <div className="timeline-item" key={record.id}><div className="timeline-marker"><span /></div><div className="timeline-date">{fullDate(record.date)}</div><RecordSummary record={record} /></div>)}</div> : <EmptyState icon={<FileText size={21} />} title="No medical history yet" text="A saved visit summary will appear here." action="Start a visit" onClick={() => onTabChange('visit')} />}</section></div>}

    {tab === 'prescriptions' && <div className="chart-content rx-grid">
      <section className="surface rx-form-card"><div className="section-heading"><div><div className="section-kicker">MEDICATION ORDER</div><h2>New prescription</h2></div><span className="rx-draft-pill">Draft</span></div><form onSubmit={savePrescription} className="rx-form"><Field label="Medication name" required><input id="rx-medication" required value={rxForm.medication} onChange={(event) => setRxForm({ ...rxForm, medication: event.target.value })} placeholder="Search or enter medication" /></Field><div className="form-row"><Field label="Strength"><input value={rxForm.strength} onChange={(event) => setRxForm({ ...rxForm, strength: event.target.value })} placeholder="e.g. 10 mg" /></Field><Field label="Duration"><input value={rxForm.duration} onChange={(event) => setRxForm({ ...rxForm, duration: event.target.value })} placeholder="e.g. 7 days" /></Field></div><Field label="Directions for use"><textarea value={rxForm.instructions} onChange={(event) => setRxForm({ ...rxForm, instructions: event.target.value })} placeholder="Dose, route, and frequency" /></Field><Field label="Additional notes"><textarea value={rxForm.notes} onChange={(event) => setRxForm({ ...rxForm, notes: event.target.value })} placeholder="Optional patient instructions" /></Field><div className="rx-form-footer"><span><ShieldCheck size={14} />Review before printing</span><button className="button button-primary" type="submit"><Plus size={15} />Add to chart</button></div></form></section>
      <section className="surface rx-list-card"><div className="section-heading"><div><div className="section-kicker">PATIENT MEDICATIONS</div><h2>Prescription history</h2></div><span className="record-count">{patient.prescriptions.length}</span></div>{savedRx && <PrescriptionPrint prescription={savedRx} patient={patient} />}{patient.prescriptions.length ? <div className="prescription-list">{patient.prescriptions.map((prescription) => <div className="prescription-item" key={prescription.id}><div className="prescription-symbol"><Pill size={17} /></div><div className="prescription-info"><strong>{prescription.medication}{prescription.strength ? ` · ${prescription.strength}` : ''}</strong><span>{prescription.instructions || 'Directions not entered'}</span><small>Added {shortDate(prescription.date)}{prescription.duration ? ` · ${prescription.duration}` : ''}</small></div><button className="icon-button subtle-icon print-action" aria-label={`Print ${prescription.medication}`} onClick={() => { setSavedRx(prescription); window.setTimeout(() => window.print(), 0) }}><Printer size={16} /></button></div>)}</div> : <EmptyState icon={<Pill size={21} />} title="No prescriptions yet" text="Prescriptions created for this patient will appear here." action="Create prescription" onClick={() => document.getElementById('rx-medication')?.focus()} />}</section>
    </div>}
  </div>
}

function InfoBlock({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return <div className="info-block"><span>{label}</span><strong className={alert ? 'info-alert' : ''}>{value}</strong></div>
}

function RecordSummary({ record }: { record: MedicalRecord }) {
  return <div className="record-summary"><div className="record-summary-title"><span className="record-icon"><Stethoscope size={16} /></span><strong>{record.diagnosis || 'Visit note'}</strong><span className="record-visit-label">Visit</span></div><div className="record-details">{record.triage && <div><span>Attendant triage · Chief complaint</span><p>{record.triage.complaint}{record.triage.notes ? ` · ${record.triage.notes}` : ''}</p></div>}{record.signs && <div><span>Signs</span><p>{record.signs}</p></div>}{record.symptoms && <div><span>Symptoms</span><p>{record.symptoms}</p></div>}{record.notes && <div><span>Interview notes</span><p>{record.notes}</p></div>}{!record.triage && !record.signs && !record.symptoms && !record.notes && <p className="muted-copy">No signs or symptoms recorded.</p>}</div></div>
}

function PrescriptionPrint({ prescription, patient }: { prescription: Prescription; patient: Patient }) {
  return <div className="prescription-print" id="print-prescription"><div className="print-clinic"><span className="print-logo"><Activity size={17} /></span><span><strong>Northstar Clinic</strong><small>Care with clarity · DEMO</small></span><div><strong>Rx · DRAFT</strong><small>{shortDate(prescription.date)}</small></div></div><div className="print-rule" /><p className="draft-print-notice">DEMO DRAFT — not a finalized prescription</p><div className="print-patient"><strong>Patient</strong><span>{patient.name} · {ageFromBirthDate(patient.birthDate)} years · {patient.patientNumber}</span></div><div className="print-medication"><span className="rx-symbol">℞</span><div><strong>{prescription.medication} {prescription.strength}</strong><p>{prescription.instructions}</p>{prescription.duration && <small>Duration: {prescription.duration}</small>}{prescription.notes && <small>Note: {prescription.notes}</small>}</div></div><div className="print-signature"><span>{clinicianName}</span><small>Sample identity · not authenticated</small></div></div>
}

function AppointmentsPage({ appointments, patients, onOpenPatient, onNewAppointment }: { appointments: Appointment[]; patients: Patient[]; onOpenPatient: (id: string) => void; onNewAppointment: () => void }) {
  const [anchorDate, setAnchorDate] = useState(dateKey(new Date()))
  const [view, setView] = useState<'week' | 'day'>('week')
  const days = useMemo(() => {
    const anchor = new Date(`${anchorDate}T12:00:00`)
    if (view === 'day') return [anchor]
    const monday = new Date(anchor)
    const weekday = (anchor.getDay() + 6) % 7
    monday.setDate(anchor.getDate() - weekday)
    return Array.from({ length: 5 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date })
  }, [anchorDate, view])
  const rangeLabel = view === 'day'
    ? fullDate(dateKey(days[0]))
    : `${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(days[0])} – ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(days[4])}`
  const timeRows = Array.from({ length: 10 }, (_, index) => 8 + index)
  const visibleAppointments = appointments.filter((appointment) => days.some((date) => dateKey(date) === appointment.date) && appointment.status !== 'cancelled')
  function moveCalendar(direction: number) {
    const next = new Date(`${anchorDate}T12:00:00`)
    next.setDate(next.getDate() + direction * (view === 'day' ? 1 : 7))
    setAnchorDate(dateKey(next))
  }
  return <div className="page-wrap calendar-page">
    <div className="page-heading-row"><div><div className="eyebrow">SCHEDULING</div><h1>Appointments</h1><p>Coordinate the clinic day and keep every visit on track.</p></div><button className="button button-primary" onClick={onNewAppointment}><CalendarPlus size={16} />Book appointment</button></div>
    <section className="surface calendar-surface"><div className="calendar-toolbar"><div className="calendar-title"><h2>{view === 'week' ? 'Work week' : 'Day schedule'}</h2><span>{rangeLabel}</span></div><div className="calendar-actions"><button className="button button-soft today-button" onClick={() => setAnchorDate(dateKey(new Date()))}>Today</button><div className="calendar-arrows"><button className="icon-button" aria-label={view === 'week' ? 'Previous week' : 'Previous day'} onClick={() => moveCalendar(-1)}><ChevronLeft size={17} /></button><button className="icon-button" aria-label={view === 'week' ? 'Next week' : 'Next day'} onClick={() => moveCalendar(1)}><ChevronRight size={17} /></button></div><select className="view-select" aria-label="Calendar view" value={view} onChange={(event) => setView(event.target.value as typeof view)}><option value="week">Work week</option><option value="day">Day</option></select></div></div>
      <div className="calendar-legend"><span><i className="legend-confirmed" />Confirmed</span><span><i className="legend-arrived" />Checked in</span><span><i className="legend-scheduled" />Scheduled</span></div>
      <div className="calendar-grid" style={{ '--day-count': days.length } as CSSProperties}>
        <div className="calendar-time-head" />{days.map((day) => <div className={`calendar-day-head ${dateKey(day) === dateKey(new Date()) ? 'calendar-today' : ''}`} key={dateKey(day)}><span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(day)}</span><strong>{day.getDate()}</strong></div>)}
        <div className="calendar-times">{timeRows.map((hour) => <div className="calendar-time" key={hour}>{formatTime(`${String(hour).padStart(2, '0')}:00`)}</div>)}</div>
        {days.map((day) => {
          const key = dateKey(day)
          const dayAppointments = visibleAppointments.filter((appointment) => appointment.date === key)
          return <div className={`calendar-day-column ${key === dateKey(new Date()) ? 'calendar-column-today' : ''}`} key={key}>
            {timeRows.map((hour) => <div className="calendar-slot" key={hour} />)}
            {dayAppointments.map((appointment) => {
              const patient = patients.find((item) => item.id === appointment.patientId)
              if (!patient) return null
              const top = ((toMinutes(appointment.time) - 8 * 60) / 60) * 58
              const height = Math.max(46, appointment.duration / 60 * 58 - 4)
              return <button key={appointment.id} className={`calendar-event event-${appointment.status}`} style={{ top: `${top}px`, height: `${height}px` }} onClick={() => onOpenPatient(patient.id)} title={`${formatTime(appointment.time)} · ${patient.name}`}><strong>{formatTime(appointment.time)} · {patient.name}</strong><span>{appointment.reason}</span></button>
            })}
          </div>
        })}
      </div>
      <div className="calendar-bottom"><span><span className="online-dot" />{visibleAppointments.length} appointment{visibleAppointments.length === 1 ? '' : 's'} {view === 'week' ? 'this work week' : 'on this day'}</span><span>Times shown in clinic local time</span></div>
    </section>
    <section className="surface calendar-list-card"><div className="section-heading"><div><div className="section-kicker">UP NEXT</div><h2>{view === 'week' ? 'Upcoming visits this week' : 'Visits this day'}</h2></div><span className="record-count">{visibleAppointments.length}</span></div>{visibleAppointments.length ? <div className="upcoming-list">{[...visibleAppointments].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((appointment) => { const patient = patients.find((item) => item.id === appointment.patientId); return patient ? <button className="upcoming-row" key={appointment.id} onClick={() => onOpenPatient(patient.id)}><div className="upcoming-date"><strong>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${appointment.date}T12:00:00`))}</strong><span>{shortDate(appointment.date)}</span></div><span className="upcoming-time">{formatTime(appointment.time)}</span><Avatar patient={patient} /><span className="upcoming-name"><strong>{patient.name}</strong><small>{appointment.reason}</small></span><StatusBadge status={appointment.status} /><ChevronRight size={15} /></button> : null })}</div> : <div className="calendar-empty"><CalendarDays size={19} />No appointments {view === 'week' ? 'in this work week.' : 'on this day.'}</div>}</section>
  </div>
}

function WalkInModal({ onClose, onCreate, submitLabel = 'Register & open chart' }: { onClose: () => void; onCreate: (values: { name: string; birthDate: string; sex: string; phone: string; email: string; allergy: string; allergyStatus: AllergyStatus }) => void; submitLabel?: string }) {
  const [form, setForm] = useState({ name: '', birthDate: '', sex: '', phone: '', email: '', allergyStatus: '' as '' | AllergyStatus, allergyDetails: '' })
  const [error, setError] = useState('')
  function updateForm(update: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...update }))
    if (error) setError('')
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Enter the patient’s name to continue.'); return }
    if (!form.birthDate) { setError('Enter the patient’s date of birth.'); return }
    if (form.birthDate > dateKey(new Date())) { setError('Date of birth cannot be in the future.'); return }
    if (!form.sex) { setError('Select the patient’s sex or choose not to disclose.'); return }
    if (!form.allergyStatus) { setError('Record an allergy status before continuing.'); return }
    if (form.allergyStatus === 'known' && !form.allergyDetails.trim()) { setError('Enter the known allergy or select another allergy status.'); return }
    const allergy = form.allergyStatus === 'none'
      ? 'No known allergies'
      : form.allergyStatus === 'unknown'
        ? 'Not recorded'
        : form.allergyDetails.trim()
    onCreate({
      name: form.name.trim(),
      birthDate: form.birthDate,
      sex: form.sex,
      phone: form.phone.trim(),
      email: form.email.trim(),
      allergy,
      allergyStatus: form.allergyStatus,
    })
  }
  return <Modal onClose={onClose} eyebrow="PATIENT REGISTRATION" title="New walk-in patient" subtitle="Capture the essentials, then continue straight to their chart." icon={<UserRoundPlus size={18} />}>
    <form onSubmit={submit} className="modal-form">
      <Field label="Patient name" required><input autoFocus required maxLength={160} value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="First and last name" /></Field>
      <div className="form-row">
        <Field label="Date of birth" required hint={form.birthDate ? `${ageFromBirthDate(form.birthDate)} years old today` : 'Age is calculated from DOB'}>
          <input aria-label="Date of birth" type="date" required max={dateKey(new Date())} value={form.birthDate} onChange={(event) => updateForm({ birthDate: event.target.value })} />
        </Field>
        <Field label="Sex" required>
          <select required value={form.sex} onChange={(event) => updateForm({ sex: event.target.value })}>
            <option value="">Select...</option><option>Female</option><option>Male</option><option>Intersex</option><option>Other</option><option>Unknown</option><option>Prefer not to say</option>
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Contact number"><input type="tel" maxLength={32} value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} placeholder="(713) 555-0123" /></Field>
        <Field label="Email address"><input type="email" maxLength={254} value={form.email} onChange={(event) => updateForm({ email: event.target.value })} placeholder="name@example.com" /></Field>
      </div>
      <Field label="Allergy status" required>
        <select required value={form.allergyStatus} onChange={(event) => updateForm({ allergyStatus: event.target.value as '' | AllergyStatus, allergyDetails: event.target.value === 'known' ? form.allergyDetails : '' })}>
          <option value="">Select a status...</option><option value="none">No known allergies</option><option value="known">Known allergies</option><option value="unknown">Unknown / not confirmed</option>
        </select>
      </Field>
      {form.allergyStatus === 'known' && <Field label="Known allergies" required hint="Separate multiple allergies with commas"><input required maxLength={500} value={form.allergyDetails} onChange={(event) => updateForm({ allergyDetails: event.target.value })} placeholder="e.g. Penicillin, latex" /></Field>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-note"><ShieldCheck size={15} /><span>Confirm allergy status with the patient. This demo stores information in this browser only.</span></div>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><UserRoundPlus size={15} />{submitLabel}</button></div>
    </form>
  </Modal>
}

function AppointmentModal({ patients, initialPatientId, onClose, onCreate }: { patients: Patient[]; initialPatientId?: string; onClose: () => void; onCreate: (values: Omit<Appointment, 'id' | 'clinician'>) => string }) {
  const [form, setForm] = useState({ patientId: initialPatientId ?? patients[0]?.id ?? '', date: dateKey(new Date()), time: '11:00', duration: 30, reason: '' })
  const [error, setError] = useState('')
  function updateForm(update: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...update }))
    if (error) setError('')
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.patientId) { setError('Select a patient before booking.'); return }
    const message = onCreate({ ...form, reason: form.reason.trim() || 'Office visit', status: 'scheduled' })
    if (message) setError(message)
  }
  return <Modal onClose={onClose} eyebrow="SCHEDULING" title="Book an appointment" subtitle="Choose a patient and a time that works for the clinic." icon={<CalendarPlus size={18} />}>
    <form onSubmit={submit} className="modal-form"><Field label="Patient" required><select id="appointment-patient" required value={form.patientId} onChange={(event) => updateForm({ patientId: event.target.value })}><option value="" disabled>Select a patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.patientNumber}</option>)}</select></Field><div className="form-row"><Field label="Date" required><input id="appointment-date" type="date" required min={dateKey(new Date())} value={form.date} onChange={(event) => updateForm({ date: event.target.value })} /></Field><Field label="Start time" required><select id="appointment-time" value={form.time} onChange={(event) => updateForm({ time: event.target.value })}>{Array.from({ length: 20 }, (_, index) => { const mins = 8 * 60 + index * 30; const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; return <option key={time} value={time}>{formatTime(time)}</option> })}</select></Field></div><div className="form-row"><Field label="Visit length"><select id="appointment-duration" value={form.duration} onChange={(event) => updateForm({ duration: Number(event.target.value) })}><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option></select></Field><Field label="Visit type"><input value={form.reason} onChange={(event) => updateForm({ reason: event.target.value })} placeholder="e.g. Follow-up" /></Field></div><div className="modal-clinician"><span className="avatar avatar-teal avatar-small">MR</span><span><small>Assigned clinician</small><strong>{clinicianName}</strong></span><CheckCircle2 size={16} /></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><CalendarPlus size={15} />Confirm appointment</button></div></form>
  </Modal>
}

function Modal({ children, onClose, eyebrow, title, subtitle, icon }: { children: ReactNode; onClose: () => void; eyebrow: string; title: string; subtitle: string; icon: ReactNode }) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.documentElement.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.documentElement.style.overflow = '' }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><span className="modal-heading-icon">{icon}</span><button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><X size={18} /></button><div className="section-kicker">{eyebrow}</div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div>{children}</section></div>
}

function Field({ label, children, required, hint }: { label: string; children: ReactNode; required?: boolean; hint?: string }) {
  return <label className="form-field"><span className="field-label">{label}{required && <i> *</i>}{hint && <small>{hint}</small>}</span>{children}</label>
}

export default App
