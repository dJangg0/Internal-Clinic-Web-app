import { Activity, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Clock3, HeartHandshake, LogOut, Plus, QrCode, UserRound, UserRoundPlus, Users } from 'lucide-react'
import { dateKey, type Appointment, type Patient, type QueueSession } from './clinic'
import './demo-role-views.css'

function DemoHeader({ role, onSignOut }: { role: string; onSignOut: () => void }) {
  return <header className="role-demo-header">
    <div className="role-demo-brand"><span><Activity size={22} strokeWidth={1.8} /></span><div><strong>northstar</strong><small>CLINIC WORKSPACE</small></div></div>
    <div className="role-demo-header-actions"><span className="role-demo-role-badge">{role} · Demo</span><button type="button" className="role-demo-button role-demo-button-secondary" onClick={onSignOut}><LogOut size={16} />Log in as</button></div>
  </header>
}

function DemoFooter() {
  return <footer className="role-demo-footer"><span>Northstar Clinic · Synthetic demo data</span><span>Preview only · Data stays in this browser</span></footer>
}

export function PatientDemoPage({ onSignOut, onCheckIn, queueAvailable }: { onSignOut: () => void; onCheckIn: () => void; queueAvailable: boolean }) {
  return <div className="role-demo-shell">
    <DemoHeader role="Patient" onSignOut={onSignOut} />
    <main className="role-demo-content role-demo-patient-content">
      <section className="role-demo-patient-welcome">
        <div className="role-demo-kicker">YOUR NORTHSTAR VISIT</div>
        <div className="role-demo-welcome-icon"><HeartHandshake size={28} strokeWidth={1.5} /></div>
        <h1>Welcome, Sofia.</h1>
        <p>A little less waiting.<br />A little more peace of mind.</p>
        <div className="role-demo-patient-identity"><span>SR</span><div><strong>Sofia Reyes</strong><small>Sample patient account</small></div></div>
      </section>

      <section className="role-demo-checkin-card" aria-labelledby="patient-demo-checkin-heading">
        <div className="role-demo-card-icon"><QrCode size={24} strokeWidth={1.7} /></div>
        <div className="role-demo-kicker">BEFORE YOUR CONSULTATION</div>
        <h2 id="patient-demo-checkin-heading">Start with a warm welcome.</h2>
        <p>Complete today’s registration, then let reception know you have arrived. The clinic team will help you with the next step.</p>
        <div className={`role-demo-intake-status ${queueAvailable ? 'is-open' : ''}`}><span />{queueAvailable ? 'Today’s check-in is open' : 'Patient check-in is not open'}</div>
        {!queueAvailable && <p className="role-demo-checkin-guidance">The doctor opens each day’s intake. Please ask reception when check-in becomes available.</p>}
        <button type="button" className="role-demo-button role-demo-button-primary role-demo-checkin-button" disabled={!queueAvailable} onClick={onCheckIn}>Open patient check-in<ArrowRight size={17} /></button>
        <p className="role-demo-small-note">Use synthetic details in this demo. Check-in works in this browser only.</p>
      </section>

      <section className="role-demo-visit-guide" aria-labelledby="patient-demo-guide-heading">
        <h2 id="patient-demo-guide-heading">A simple path to your visit</h2>
        <ol><li><span>01</span><div><strong>Share your details</strong><p>Complete the registration form for today’s visit.</p></div></li><li><span>02</span><div><strong>Meet reception</strong><p>The clinic team confirms your details and arrival.</p></div></li><li><span>03</span><div><strong>Get ready for care</strong><p>The team will guide you through preparation and your consultation.</p></div></li></ol>
      </section>
    </main>
    <DemoFooter />
  </div>
}

const appointmentLabels: Record<Appointment['status'], string> = { scheduled: 'Scheduled', confirmed: 'Confirmed', checked_in: 'Checked in', completed: 'Completed', cancelled: 'Cancelled' }

export function ReceptionDemoPage({ patients, appointments, session, onSignOut, onRegister, onSchedule, onTriage, onToggleQueue }: {
  patients: Patient[]
  appointments: Appointment[]
  session: QueueSession | null
  onSignOut: () => void
  onRegister: () => void
  onSchedule: () => void
  onTriage: (entryId: string) => void
  onToggleQueue: () => void
}) {
  const today = dateKey(new Date())
  const currentSession = session?.date === today ? session : null
  const entries = currentSession?.entries ?? []
  const todayAppointments = appointments.filter((appointment) => appointment.date === today && appointment.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time))
  const todayPatientIds = new Set([...todayAppointments.map((appointment) => appointment.patientId), ...entries.map((entry) => entry.patientId)])
  const todayPatients = patients.filter((patient) => patient.joined === today || todayPatientIds.has(patient.id))
  const patientById = new Map(patients.map((patient) => [patient.id, patient]))
  const awaitingTriage = entries.filter((entry) => entry.stage === 'triage' && entry.status !== 'completed' && entry.patientId && patientById.has(entry.patientId))

  return <div className="role-demo-shell">
    <DemoHeader role="Attendant / Secretary" onSignOut={onSignOut} />
    <main className="role-demo-content">
      <div className="role-demo-reception-heading"><div><div className="role-demo-kicker">A THOUGHTFUL START TO EVERY VISIT</div><h1>Reception workspace</h1><p>Welcome patients, prepare their visit, and keep the clinic day moving.</p></div><div className="role-demo-heading-actions"><button type="button" className="role-demo-button role-demo-button-secondary" onClick={onSchedule}><CalendarDays size={17} />Book appointment</button><button type="button" className="role-demo-button role-demo-button-primary" onClick={onRegister}><UserRoundPlus size={17} />New walk-in</button></div></div>

      <p className="role-demo-preview-note"><CheckCircle2 size={16} />This is a role-specific demo with synthetic records. Account authentication and server permissions are not connected.</p>

      <div className="role-demo-stats"><div><span><CalendarDays size={20} /></span><div><strong>{todayAppointments.length}</strong><small>Bookings today</small></div></div><div><span><ClipboardList size={20} /></span><div><strong>{awaitingTriage.length}</strong><small>Awaiting triage</small></div></div><div><span><Users size={20} /></span><div><strong>{todayPatients.length}</strong><small>Patients on today’s list</small></div></div></div>

      <div className="role-demo-reception-grid">
        <section className="role-demo-surface role-demo-queue" aria-labelledby="reception-demo-queue-heading">
          <div className="role-demo-section-heading"><div><div className="role-demo-kicker">ARRIVAL & HANDOFF</div><h2 id="reception-demo-queue-heading">Today’s reception queue</h2></div>{currentSession && <span className={`role-demo-intake-status ${currentSession.isOpen ? 'is-open' : ''}`}><span />{currentSession.isOpen ? 'Check-in open' : 'Check-in paused'}</span>}</div>
          {currentSession && <div className="role-demo-queue-toolbar"><p>Confirm the patient’s identity before recording triage.</p><button type="button" className="role-demo-button role-demo-button-secondary" onClick={onToggleQueue}>{currentSession.isOpen ? 'Pause check-in' : 'Resume check-in'}</button></div>}
          {entries.length > 0 ? <ul className="role-demo-queue-list">{entries.map((entry) => {
            const patient = entry.patientId ? patientById.get(entry.patientId) : undefined
            const stageLabel = entry.stage === 'complete' ? 'Visit complete' : entry.stage === 'consulting' ? 'With doctor' : entry.stage === 'ready' ? 'Ready for doctor' : entry.stage === 'triage' ? 'Awaiting triage' : entry.status === 'completed' ? 'Ticket closed' : entry.status === 'called' ? 'Called' : 'Waiting at reception'
            const canTriage = Boolean(patient && entry.stage === 'triage' && entry.status !== 'completed')
            return <li key={entry.id}><span className="role-demo-queue-number">{entry.number}</span><div className="role-demo-queue-person"><strong>{entry.name}</strong><span>{patient?.patientNumber ?? 'Patient link not available'}{entry.phone ? ` · ${entry.phone}` : ''}</span><small>{stageLabel}</small></div>{canTriage ? <button type="button" className="role-demo-button role-demo-button-soft" onClick={() => onTriage(entry.id)}><ClipboardList size={15} />Record triage</button> : <span className="role-demo-queue-stage"><CheckCircle2 size={15} />{stageLabel}</span>}</li>
          })}</ul> : <div className="role-demo-empty"><QrCode size={29} strokeWidth={1.5} /><h3>{currentSession ? 'Ready for the first arrival' : 'Today’s intake has not opened'}</h3><p>{currentSession ? 'Patient check-ins will appear here for reception review and triage.' : 'The doctor opens intake and prepares today’s QR. You can still help patients register at reception.'}</p></div>}
        </section>

        <section className="role-demo-surface role-demo-appointments" aria-labelledby="reception-demo-appointments-heading">
          <div className="role-demo-section-heading"><div><div className="role-demo-kicker">THE CLINIC DAY</div><h2 id="reception-demo-appointments-heading">Today’s appointments</h2></div><Clock3 size={19} /></div>
          {todayAppointments.length > 0 ? <ul className="role-demo-appointment-list">{todayAppointments.map((appointment) => {
            const patient = patientById.get(appointment.patientId)
            return <li key={appointment.id}><time>{appointment.time}</time><div><strong>{patient?.name ?? 'Patient not available'}</strong><span>{appointment.reason || 'Clinic appointment'}</span><small>{appointmentLabels[appointment.status]}</small></div></li>
          })}</ul> : <div className="role-demo-empty"><CalendarDays size={27} strokeWidth={1.5} /><h3>No bookings today</h3><p>Book an appointment to help plan the clinic day.</p><button type="button" className="role-demo-inline-action" onClick={onSchedule}><Plus size={14} />Book an appointment</button></div>}
        </section>
      </div>

      <section className="role-demo-surface role-demo-demographics" aria-labelledby="reception-demo-patients-heading">
        <div className="role-demo-section-heading"><div><div className="role-demo-kicker">REGISTRATION DETAILS</div><h2 id="reception-demo-patients-heading">Today’s patient details</h2><p>Demographics for today’s appointments, arrivals, and new registrations.</p></div><UserRound size={20} /></div>
        {todayPatients.length > 0 ? <ul className="role-demo-demographic-list">{todayPatients.map((patient) => <li key={patient.id}><span className="role-demo-person-avatar">{patient.initials}</span><div><strong>{patient.name}</strong><span>{patient.patientNumber}</span></div><div><small>Date of birth</small><span>{patient.birthDate || 'Not recorded'}</span></div><div><small>Sex</small><span>{patient.sex || 'Not recorded'}</span></div><div><small>Contact number</small><span>{patient.phone || 'Not recorded'}</span></div></li>)}</ul> : <div className="role-demo-empty role-demo-empty-compact"><Users size={27} strokeWidth={1.5} /><h3>No patients on today’s list yet</h3><p>New registrations and linked arrivals will appear here.</p></div>}
      </section>
    </main>
    <DemoFooter />
  </div>
}
