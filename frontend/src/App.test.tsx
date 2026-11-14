import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { dateKey, type Patient, type QueueSession } from './clinic'
import { appointment, patient, queue, storageKeys } from './test/fixtures'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,dGVzdA==') } }))

const secondPatient = () => patient({ id: 'patient-b', name: 'Bea Cruz', initials: 'BC', patientNumber: 'PT-10002', phone: '09179876543', email: 'bea@example.test' })

beforeEach(() => {
  localStorage.setItem(storageKeys.patients, JSON.stringify([patient(), secondPatient()]))
  localStorage.setItem(storageKeys.appointments, '[]')
})

function renderDemo() {
  const view = render(<App />)
  if (!new URLSearchParams(window.location.search).get('queue')) {
    fireEvent.click(screen.getByRole('button', { name: 'Explore demo workspace' }))
  }
  return view
}

function savedPatients(): Patient[] {
  return JSON.parse(localStorage.getItem(storageKeys.patients)!)
}

function savedQueue(): QueueSession {
  return JSON.parse(localStorage.getItem(storageKeys.queue)!)
}

async function openChart(user: ReturnType<typeof userEvent.setup>, name = 'Alice Santos') {
  const searchField = screen.getByRole('textbox', { name: 'Search patients' })
  await user.type(searchField, name)
  await user.click(within(searchField.parentElement!).getByRole('button', { name: new RegExp(name) }))
  expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument()
}

async function startVisit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Start visit' })[0])
}

async function prescriptionTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Prescriptions\s*\d+/ }))
}

async function openQueue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Daily queue/ }))
}

async function joinPreview(user: ReturnType<typeof userEvent.setup>, name: string, phone: string) {
  await user.click(screen.getByRole('button', { name: 'Preview patient check-in' }))
  await user.type(screen.getByRole('textbox', { name: /Full name/ }), name)
  await user.type(screen.getByRole('textbox', { name: /Phone number/ }), phone)
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: '1990-05-10' } })
  await user.selectOptions(screen.getByRole('combobox', { name: /Sex/ }), 'Female')
  await user.selectOptions(screen.getByRole('combobox', { name: /Allergy status/ }), 'none')
  await user.click(screen.getByRole('button', { name: 'Get my queue number' }))
}

describe('patient registration', () => {
  it.each([
    ['unknown', 'Not recorded'], ['none', 'No known allergies'], ['known', 'Latex'],
  ])('registers a patient with explicit %s allergy status and persists their chart', async (status, allergy) => {
    const user = userEvent.setup()
    renderDemo()
    await user.click(screen.getByRole('button', { name: 'New walk-in' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New walk-in patient' }))
    await user.type(dialog.getByRole('textbox', { name: /Patient name/ }), '  Carla Diaz  ')
    fireEvent.change(dialog.getByLabelText('Date of birth'), { target: { value: '1995-04-03' } })
    await user.selectOptions(dialog.getByRole('combobox', { name: /Sex/ }), 'Female')
    await user.selectOptions(dialog.getByRole('combobox', { name: /Allergy status/ }), status)
    if (status === 'known') await user.type(dialog.getByRole('textbox', { name: /^Known allergies/ }), '  Latex  ')
    await user.click(dialog.getByRole('button', { name: 'Register & open chart' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Carla Diaz' })).toBeInTheDocument()
    expect(savedPatients()[0]).toMatchObject({ name: 'Carla Diaz', birthDate: '1995-04-03', sex: 'Female', allergyStatus: status, allergy })
    expect(savedPatients()[0].id).not.toBe('patient-a')
    expect(savedPatients()[0].records).toEqual([])
  })

  it('rejects whitespace-only known allergy details without registering', async () => {
    const user = userEvent.setup()
    renderDemo()
    await user.click(screen.getByRole('button', { name: 'New walk-in' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: /Patient name/ }), 'Carla Diaz')
    fireEvent.change(dialog.getByLabelText('Date of birth'), { target: { value: '1995-04-03' } })
    await user.selectOptions(dialog.getByRole('combobox', { name: /Sex/ }), 'Prefer not to say')
    await user.selectOptions(dialog.getByRole('combobox', { name: /Allergy status/ }), 'known')
    await user.type(dialog.getByRole('textbox', { name: /^Known allergies/ }), '   ')
    await user.click(dialog.getByRole('button', { name: 'Register & open chart' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the known allergy')
    expect(savedPatients()).toHaveLength(2)
  })

  it('rejects future dates of birth even if a form is submitted programmatically', async () => {
    const user = userEvent.setup()
    renderDemo()
    await user.click(screen.getByRole('button', { name: 'New walk-in' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: /Patient name/ }), 'Carla Diaz')
    fireEvent.change(dialog.getByLabelText('Date of birth'), { target: { value: '2999-01-01' } })
    fireEvent.submit(dialog.getByRole('button', { name: 'Register & open chart' }).closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent('Date of birth cannot be in the future')
    expect(savedPatients()).toHaveLength(2)
  })
})

describe('appointment booking', () => {
  it('defaults booking from a chart to that patient', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openChart(user, 'Bea Cruz')
    await user.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByRole('combobox', { name: /^Patient/ })).toHaveValue('patient-b')
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }))
    expect(JSON.parse(localStorage.getItem(storageKeys.appointments)!)[0]).toMatchObject({ patientId: 'patient-b', reason: 'Office visit', status: 'scheduled' })
  })

  it('keeps a conflicting booking open and accepts an adjacent slot after correction', async () => {
    localStorage.setItem(storageKeys.appointments, JSON.stringify([appointment({ time: '11:00', duration: 45 })]))
    const user = userEvent.setup()
    renderDemo()
    await user.click(screen.getByRole('button', { name: 'Schedule appointment' }))
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }))
    expect(screen.getByRole('alert')).toHaveTextContent('That time overlaps an existing appointment')
    expect(JSON.parse(localStorage.getItem(storageKeys.appointments)!)).toHaveLength(1)
    await user.selectOptions(screen.getByRole('combobox', { name: /Start time/ }), '12:00')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(storageKeys.appointments)!)).toHaveLength(2)
  })
})

describe('clinical documentation', () => {
  it('snapshots interview-only notes into visit history and preserves them after reload', async () => {
    const user = userEvent.setup()
    const view = renderDemo()
    await openChart(user)
    await startVisit(user)
    await user.type(screen.getByLabelText(/Interview notes/), 'Patient reports symptoms since yesterday.')
    expect(savedPatients()[0].notes).toBe('Patient reports symptoms since yesterday.')
    await user.click(screen.getByRole('button', { name: 'Save visit to chart' }))
    expect(screen.getByText('Patient reports symptoms since yesterday.')).toBeInTheDocument()
    expect(savedPatients()[0]).toMatchObject({ notes: '', lastVisit: dateKey(new Date()), records: [{ notes: 'Patient reports symptoms since yesterday.', signs: '', symptoms: '', diagnosis: '' }] })
    view.unmount()
    renderDemo()
    await openChart(user)
    await user.click(screen.getByRole('button', { name: /^Medical history/ }))
    expect(screen.getByText('Patient reports symptoms since yesterday.')).toBeInTheDocument()
  })

  it('rejects a completely empty visit without adding a record', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openChart(user)
    await startVisit(user)
    await user.click(screen.getByRole('button', { name: 'Save visit to chart' }))
    expect(screen.getByText('Add a note, signs, symptoms, or diagnosis before saving.')).toBeInTheDocument()
    expect(savedPatients()[0].records).toHaveLength(0)
  })

  it('saves signs, symptoms, and diagnosis to the correct patient', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openChart(user, 'Bea Cruz')
    await startVisit(user)
    await user.type(screen.getByPlaceholderText('e.g. Blood pressure, temperature, exam findings'), 'Temperature 37.0 C')
    await user.type(screen.getByPlaceholderText('e.g. Onset, duration, and associated symptoms'), 'Follow-up concern')
    await user.type(screen.getByPlaceholderText('Add a working diagnosis'), 'Follow-up assessment')
    await user.click(screen.getByRole('button', { name: 'Save visit to chart' }))
    expect(savedPatients()[1].records[0]).toMatchObject({ signs: 'Temperature 37.0 C', symptoms: 'Follow-up concern', diagnosis: 'Follow-up assessment' })
    expect(savedPatients()[0].records).toHaveLength(0)
    expect(screen.getByText('Follow-up assessment')).toBeInTheDocument()
  })

  it('assigns distinct record IDs when multiple records are saved in the same millisecond', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-09T10:00:00'))
    const user = userEvent.setup()
    renderDemo()
    await openChart(user)
    await startVisit(user)
    await user.type(screen.getByPlaceholderText('Add a working diagnosis'), 'First note')
    await user.click(screen.getByRole('button', { name: 'Save visit to chart' }))
    await user.click(screen.getByRole('button', { name: 'Add visit note' }))
    await user.type(screen.getByPlaceholderText('Add a working diagnosis'), 'Second note')
    await user.click(screen.getByRole('button', { name: 'Save visit to chart' }))
    const records = savedPatients()[0].records
    expect(records).toHaveLength(2)
    expect(new Set(records.map((record) => record.id)).size).toBe(2)
    expect(screen.getByText('First note')).toBeInTheDocument()
    expect(screen.getByText('Second note')).toBeInTheDocument()
  })

  it('resets unsaved structured visit fields when switching to another patient', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openChart(user)
    await startVisit(user)
    await user.type(screen.getByPlaceholderText('Add a working diagnosis'), 'Alice only')
    await user.type(screen.getByLabelText(/Interview notes/), 'Alice draft')
    await openChart(user, 'Bea Cruz')
    await startVisit(user)
    expect(screen.getByPlaceholderText('Add a working diagnosis')).toHaveValue('')
    expect(screen.getByLabelText(/Interview notes/)).toHaveValue('')
    expect(savedPatients()[0].notes).toBe('Alice draft')
  })

  it('saves a prescription to its patient and does not carry the preview into another chart', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openChart(user)
    await prescriptionTab(user)
    await user.type(screen.getByRole('textbox', { name: /Medication name/ }), '  Demo medication  ')
    await user.type(screen.getByRole('textbox', { name: 'Strength' }), '10 mg')
    await user.type(screen.getByRole('textbox', { name: 'Directions for use' }), 'Synthetic test directions')
    await user.click(screen.getByRole('button', { name: 'Add to chart' }))
    expect(savedPatients()[0].prescriptions[0]).toMatchObject({ medication: 'Demo medication', strength: '10 mg', instructions: 'Synthetic test directions' })
    expect(screen.getByRole('textbox', { name: /Medication name/ })).toHaveValue('')
    await user.type(screen.getByRole('textbox', { name: /Medication name/ }), 'Unsaved Alice draft')
    await openChart(user, 'Bea Cruz')
    await prescriptionTab(user)
    expect(screen.getByRole('textbox', { name: /Medication name/ })).toHaveValue('')
    expect(screen.queryByText('Demo medication')).not.toBeInTheDocument()
    expect(savedPatients()[1].prescriptions).toEqual([])
  })
})

describe('daily walk-in queue', () => {
  it('links check-in, triage, consultation, prescription, and history to one encounter', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openQueue(user)
    await user.click(screen.getByRole('button', { name: 'Generate today’s QR' }))
    await screen.findByAltText('QR code for today’s patient check-in')
    await joinPreview(user, 'Alice Santos', '0917-123-4567')
    expect(screen.getByRole('status')).toHaveTextContent('001')
    await user.click(screen.getByRole('button', { name: 'Back to clinic' }))
    await joinPreview(user, 'alice santos', '09171234567')
    expect(screen.getByRole('status')).toHaveTextContent('001')
    expect(savedQueue().entries).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Back to clinic' }))
    await joinPreview(user, 'Bea Cruz', '0917-987-6543')
    expect(screen.getByRole('status')).toHaveTextContent('002')
    await user.click(screen.getByRole('button', { name: 'Back to clinic' }))
    expect(screen.getByRole('button', { name: 'Call next' })).toBeDisabled()
    await user.click(screen.getAllByRole('button', { name: 'Record triage' })[0])
    await user.type(screen.getByRole('textbox', { name: /Chief complaint/ }), 'Headache since yesterday')
    await user.type(screen.getByRole('textbox', { name: /Initial notes/ }), 'No vision changes')
    await user.click(screen.getByRole('checkbox', { name: /confirmed their identity/ }))
    await user.click(screen.getByRole('button', { name: 'Save triage & hand off' }))
    expect(savedQueue().entries[0].stage).toBe('ready')
    await user.click(screen.getByRole('button', { name: 'Start consultation' }))
    await user.type(screen.getByRole('textbox', { name: /Assessment \/ diagnosis/ }), 'Tension headache')
    await user.type(screen.getByRole('textbox', { name: /Consultation notes/ }), 'Rest and hydration discussed')
    await user.click(screen.getByRole('checkbox', { name: /reviewed the allergy information/ }))
    await user.click(screen.getByText('Add prescription to this encounter (optional draft)'))
    await user.type(screen.getByRole('textbox', { name: 'Medication' }), 'Demo analgesic')
    await user.type(screen.getByRole('textbox', { name: 'Directions' }), 'Take as directed in this synthetic demo')
    await user.click(screen.getByRole('button', { name: 'Save visit to patient history' }))
    expect(savedQueue().entries.map((entry) => entry.stage)).toEqual(['complete', 'triage'])
    expect(savedPatients()).toHaveLength(2)
    const linkedPatient = savedPatients().find((item) => item.id === savedQueue().entries[0].patientId)!
    expect(linkedPatient.records[0]).toMatchObject({ diagnosis: 'Tension headache', symptoms: '', notes: 'Rest and hydration discussed', encounterId: savedQueue().entries[0].id, triage: { complaint: 'Headache since yesterday', notes: 'No vision changes' } })
    expect(linkedPatient.prescriptions[0]).toMatchObject({ medication: 'Demo analgesic', encounterId: savedQueue().entries[0].id })
    expect(linkedPatient.records[0].encounterId).toBe(linkedPatient.prescriptions[0].encounterId)
    await user.click(screen.getByRole('button', { name: 'View history' }))
    expect(screen.getByRole('heading', { level: 1, name: linkedPatient.name })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Medical history' })).toBeInTheDocument()
    expect(screen.getByText(/Headache since yesterday/)).toBeInTheDocument()
  })

  it('blocks paused queues and permits check-in again when reopened', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue()))
    const user = userEvent.setup()
    renderDemo()
    await openQueue(user)
    await user.click(screen.getByRole('button', { name: 'Pause check-in' }))
    await user.click(screen.getByRole('button', { name: 'Preview patient check-in' }))
    expect(screen.getByRole('status')).toHaveTextContent('Check-in is paused')
    expect(screen.queryByRole('button', { name: 'Get my queue number' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to clinic' }))
    await user.click(screen.getByRole('button', { name: 'Reopen check-in' }))
    await user.click(screen.getByRole('button', { name: 'Preview patient check-in' }))
    expect(screen.getByRole('button', { name: 'Get my queue number' })).toBeEnabled()
  })

  it.each(['expired', 'wrong-token'])('rejects an %s check-in link', (scenario) => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue(scenario === 'expired' ? { date: '2000-01-01' } : {})))
    window.history.replaceState({}, '', `/?queue=${scenario === 'expired' ? 'test-daily-token' : 'not-the-token'}`)
    renderDemo()
    expect(screen.getByRole('alert')).toHaveTextContent('This check-in link isn’t connected')
    expect(screen.queryByRole('button', { name: 'Get my queue number' })).not.toBeInTheDocument()
  })

  it('rejects a previously open check-in form when the local day has changed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-09T23:59:00'))
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue()))
    window.history.replaceState({}, '', '/?queue=test-daily-token')
    const user = userEvent.setup()
    renderDemo()
    await user.type(screen.getByRole('textbox', { name: /Full name/ }), 'Late arrival')
    await user.type(screen.getByRole('textbox', { name: /Phone number/ }), '09171234567')
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: '1990-05-10' } })
    await user.selectOptions(screen.getByRole('combobox', { name: /Sex/ }), 'Female')
    await user.selectOptions(screen.getByRole('combobox', { name: /Allergy status/ }), 'none')
    vi.setSystemTime(new Date('2026-11-10T00:01:00'))
    await user.click(screen.getByRole('button', { name: 'Get my queue number' }))
    expect(screen.getByRole('alert')).toHaveTextContent('This check-in link isn’t connected')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(savedQueue().entries).toHaveLength(0)
  })

  it('updates the clinic queue from a valid storage event and ignores malformed payloads safely', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openQueue(user)
    fireEvent(window, new StorageEvent('storage', { key: storageKeys.queue, newValue: JSON.stringify(queue({ entries: [{ id: 'entry-1', number: '001', name: 'Test arrival', phone: '1234', joinedAt: new Date().toISOString(), status: 'waiting' }] })) }))
    expect(screen.getByText('Test arrival')).toBeInTheDocument()
    fireEvent(window, new StorageEvent('storage', { key: storageKeys.queue, newValue: JSON.stringify({ date: dateKey(new Date()), entries: null }) }))
    expect(screen.getByText('No patients in line yet')).toBeInTheDocument()
  })
})

describe('browser storage resilience', () => {
  it.each(['{}', 'null', '{'])('recovers from invalid stored patient and appointment data %s', (raw) => {
    localStorage.setItem(storageKeys.patients, raw)
    localStorage.setItem(storageKeys.appointments, raw)
    localStorage.setItem(storageKeys.queue, raw)
    renderDemo()
    expect(screen.getByRole('heading', { level: 1, name: /Good morning/ })).toBeInTheDocument()
    expect(savedPatients()).toHaveLength(5)
  })

  it('keeps the app usable and warns when browser storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    renderDemo()
    expect(screen.getByRole('heading', { level: 1, name: /Good morning/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Browser storage is unavailable. Changes may be lost when you reload.')
  })

  it('shows storage failure on the patient ticket when a check-in cannot persist', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue()))
    window.history.replaceState({}, '', '/?queue=test-daily-token')
    const user = userEvent.setup()
    renderDemo()
    await user.type(screen.getByRole('textbox', { name: /Full name/ }), 'Test arrival')
    await user.type(screen.getByRole('textbox', { name: /Phone number/ }), '09171234567')
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: '1990-05-10' } })
    await user.selectOptions(screen.getByRole('combobox', { name: /Sex/ }), 'Female')
    await user.selectOptions(screen.getByRole('combobox', { name: /Allergy status/ }), 'none')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    await user.click(screen.getByRole('button', { name: 'Get my queue number' }))
    expect(screen.getByRole('status')).toHaveTextContent('001')
    expect(screen.getByRole('alert')).toHaveTextContent('Browser storage is unavailable')
    expect(savedQueue().entries).toHaveLength(0)
  })

  it('trims outer spaces in global patient searches', async () => {
    const user = userEvent.setup()
    renderDemo()
    const searchField = screen.getByRole('textbox', { name: 'Search patients' })
    await user.type(searchField, '  Bea Cruz  ')
    expect(within(searchField.parentElement!).getByRole('button', { name: /Bea Cruz/ })).toBeInTheDocument()
  })
})

describe('demo controls and role preview', () => {
  it('returns from the synthetic workspace to sign-in without granting a selected role access', async () => {
    const user = userEvent.setup()
    renderDemo()
    await user.click(screen.getByRole('button', { name: 'Log in as' }))
    expect(screen.getByRole('button', { name: 'Explore demo workspace' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Patient' }))
    expect(screen.getByRole('heading', { name: 'Your care starts here.' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Search patients' })).not.toBeInTheDocument()
    expect(savedPatients()).toHaveLength(2)
  })

  it('preserves an unsaved visit draft when viewing sign-in and returning to the demo', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openChart(user)
    await startVisit(user)
    await user.type(screen.getByPlaceholderText('e.g. Blood pressure, temperature, exam findings'), 'Synthetic observed signs')
    await user.type(screen.getByPlaceholderText('e.g. Onset, duration, and associated symptoms'), 'Synthetic symptoms draft')
    await user.type(screen.getByPlaceholderText('Add a working diagnosis'), 'Synthetic assessment draft')
    await user.click(screen.getByRole('button', { name: 'Log in as' }))
    expect(screen.queryByRole('textbox', { name: 'Search patients' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explore demo workspace' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Explore demo workspace' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Alice Santos' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Blood pressure, temperature, exam findings')).toHaveValue('Synthetic observed signs')
    expect(screen.getByPlaceholderText('e.g. Onset, duration, and associated symptoms')).toHaveValue('Synthetic symptoms draft')
    expect(screen.getByPlaceholderText('Add a working diagnosis')).toHaveValue('Synthetic assessment draft')
    expect(savedPatients()[0].records).toEqual([])
    expect(savedPatients()[1].records).toEqual([])
  })

  it('preserves an unsaved prescription draft when viewing sign-in and returning to the demo', async () => {
    const user = userEvent.setup()
    renderDemo()
    await openChart(user)
    await prescriptionTab(user)
    await user.type(screen.getByRole('textbox', { name: /Medication name/ }), 'Synthetic draft medication')
    await user.type(screen.getByRole('textbox', { name: /Strength/ }), 'Synthetic draft strength')
    await user.type(screen.getByRole('textbox', { name: 'Directions for use' }), 'Synthetic draft directions')
    await user.click(screen.getByRole('button', { name: 'Log in as' }))
    await user.click(screen.getByRole('button', { name: 'Explore demo workspace' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Alice Santos' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Medication name/ })).toHaveValue('Synthetic draft medication')
    expect(screen.getByRole('textbox', { name: /Strength/ })).toHaveValue('Synthetic draft strength')
    expect(screen.getByRole('textbox', { name: 'Directions for use' })).toHaveValue('Synthetic draft directions')
    expect(savedPatients()[0].prescriptions).toEqual([])
    expect(savedPatients()[1].prescriptions).toEqual([])
  })

  it('resets changed clinic records and queue state to the repeatable synthetic scenario', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue({ entries: [{ id: 'q-old', number: '001', name: 'Test', phone: '0917', joinedAt: new Date().toISOString(), status: 'waiting' }] })))
    const user = userEvent.setup()
    renderDemo()
    await user.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(await screen.findByRole('heading', { name: /Good morning, Maya/ })).toBeInTheDocument()
    expect(screen.getByText('Paolo Mendoza')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(storageKeys.patients)!)).toHaveLength(5)
    expect(JSON.parse(localStorage.getItem(storageKeys.queue)!)).toBeNull()
  })
})


describe('role-specific sign-in forms', () => {
  it('opens on doctor sign-in before exposing any staff workspace', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByRole('button', { name: 'Doctor' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Email address', { exact: true })).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Search patients' })).not.toBeInTheDocument()
  })

  it.each([
    ['Patient', 'Your care starts here.', 'Patient'],
    ['Attendant / Secretary', 'A smoother day starts here.', 'Attendant'],
    ['Doctor', 'Welcome back, doctor.', 'Doctor'],
  ])('rejects unknown credentials for the %s form without opening a demo session', async (role, heading, submitRole) => {
    const user = userEvent.setup()
    render(<App />)
    const records = localStorage.getItem(storageKeys.patients)
    await user.click(screen.getByRole('button', { name: role }))
    expect(screen.getByRole('button', { name: role })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email address', { exact: true }), 'synthetic@example.test')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Synthetic-only-password')
    await user.click(screen.getByRole('button', { name: `Sign in as ${submitRole}` }))
    expect(screen.getByRole('alert')).toHaveTextContent(/These demo credentials do not match the selected role/)
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Email address')).toHaveValue('synthetic@example.test')
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(localStorage.getItem(storageKeys.patients)).toBe(records)
    expect(Object.values(localStorage).join(' ')).not.toContain('Synthetic-only-password')
    expect(Object.values(localStorage).join(' ')).not.toContain('synthetic@example.test')
    expect(sessionStorage.length).toBe(0)
  })

  it('rejects missing email and password, malformed email, and a whitespace-only password', async () => {
    const user = userEvent.setup()
    render(<App />)
    const email = screen.getByLabelText('Email address', { exact: true })
    const password = screen.getByLabelText('Password', { exact: true })
    const submit = screen.getByRole('button', { name: 'Sign in as Doctor' })
    await user.click(submit)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    await user.type(email, 'invalid-address')
    await user.type(password, '   ')
    await user.click(submit)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/These demo credentials do not match the selected role/)).not.toBeInTheDocument()
    await user.clear(email)
    await user.type(email, '  synthetic@example.test  ')
    await user.clear(password)
    await user.type(password, 'Synthetic-only-password')
    await user.click(submit)
    expect(email).not.toHaveAttribute('aria-invalid', 'true')
    expect(password).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(/These demo credentials do not match the selected role/)
  })

  it('toggles password visibility and clears credentials, validation and help when switching roles', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('Email address', { exact: true }), 'synthetic@example.test')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Synthetic-only-password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('status')).toHaveTextContent(/not|unavailable|connect/i)
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    await user.click(screen.getByRole('button', { name: 'Patient' }))
    expect(screen.getByLabelText('Email address', { exact: true })).toHaveValue('')
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('')
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign in as Patient' }))
    expect(screen.getByLabelText('Email address', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('button', { name: 'Attendant / Secretary' }))
    expect(screen.getByLabelText('Email address', { exact: true })).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password', { exact: true })).not.toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('button', { name: 'Need access?' }))
    expect(screen.getByRole('status')).toHaveTextContent(/clinic|administrator/i)
  })

  it('requires explicit demo entry again after remount while retaining synthetic chart data', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore demo workspace' }))
    await openChart(user)
    await startVisit(user)
    await user.type(screen.getByLabelText(/Interview notes/), 'Synthetic note retained across sign-in.')
    view.unmount()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Explore demo workspace' }))
    await openChart(user)
    await startVisit(user)
    expect(screen.getByLabelText(/Interview notes/)).toHaveValue('Synthetic note retained across sign-in.')
  })

  it('keeps a direct patient check-in route public and returns to sign-in without exposing staff tools', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue()))
    window.history.replaceState({}, '', '/?queue=test-daily-token')
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Join today’s queue' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to clinic' }))
    expect(screen.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeInTheDocument()
    expect(window.location.search).toBe('')
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
  })
})


const demoAccounts = {
  Doctor: { email: 'doctor@northstar.demo', password: 'DoctorDemo123!', path: '/demo/doctor', heading: /Good morning, Maya/ },
  Attendant: { email: 'secretary@northstar.demo', password: 'StaffDemo123!', path: '/demo/attendant', heading: /^Reception workspace$/ },
  Patient: { email: 'patient@northstar.demo', password: 'PatientDemo123!', path: '/demo/patient', heading: /^Welcome, Sofia\.$/ },
} as const

type TestDemoRole = keyof typeof demoAccounts

async function signIntoDemo(user: ReturnType<typeof userEvent.setup>, role: TestDemoRole) {
  await user.click(screen.getByRole('button', { name: role === 'Attendant' ? 'Attendant / Secretary' : role }))
  await user.type(screen.getByLabelText('Email address'), demoAccounts[role].email)
  await user.type(screen.getByLabelText('Password'), demoAccounts[role].password)
  await user.click(screen.getByRole('button', { name: `Sign in as ${role}` }))
}

describe('explicit demo login routes and role sessions', () => {
  it.each(['/login', '/', '/demo/doctor', '/demo/attendant', '/demo/patient'])('normalizes fresh %s access to the login route without trusting its role', (path) => {
    window.history.replaceState({}, '', path)
    render(<App />)
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Reception workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome, Sofia.' })).not.toBeInTheDocument()
  })

  it.each(['Doctor', 'Attendant', 'Patient'] as const)('fills the visible %s demo credentials only on request and opens its distinct route after submission', async (role) => {
    const user = userEvent.setup()
    render(<App />)
    const records = localStorage.getItem(storageKeys.patients)
    await user.click(screen.getByRole('button', { name: role === 'Attendant' ? 'Attendant / Secretary' : role }))
    await user.click(screen.getByText('Demo credentials', { exact: true }))
    expect(screen.getByText(demoAccounts[role].email, { exact: true })).toBeVisible()
    expect(screen.getByText(demoAccounts[role].password, { exact: true })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Use demo credentials' }))
    expect(screen.getByLabelText('Email address')).toHaveValue(demoAccounts[role].email)
    expect(screen.getByLabelText('Password')).toHaveValue(demoAccounts[role].password)
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: demoAccounts[role].heading })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Sign in as ${role}` }))
    expect(window.location.pathname).toBe(demoAccounts[role].path)
    expect(screen.getByRole('heading', { name: demoAccounts[role].heading })).toBeInTheDocument()
    expect(localStorage.getItem(storageKeys.patients)).toBe(records)
    const persisted = Object.values(localStorage).join(' ')
    for (const account of Object.values(demoAccounts)) {
      expect(persisted).not.toContain(account.email)
      expect(persisted).not.toContain(account.password)
    }
    expect(sessionStorage.length).toBe(0)
  })

  it('rejects a valid doctor account selected under Patient without opening either workspace', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Patient' }))
    await user.type(screen.getByLabelText('Email address'), demoAccounts.Doctor.email)
    await user.type(screen.getByLabelText('Password'), demoAccounts.Doctor.password)
    await user.click(screen.getByRole('button', { name: 'Sign in as Patient' }))
    expect(screen.getByRole('alert')).toHaveTextContent('These demo credentials do not match the selected role.')
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Email address')).toHaveValue(demoAccounts.Doctor.email)
    expect(screen.queryByRole('heading', { name: /Good morning, Maya|Welcome, Sofia/ })).not.toBeInTheDocument()
  })

  it.each(['Doctor', 'Attendant', 'Patient'] as const)('clears the %s memory session when returning to login and cannot revive it from its old URL', async (role) => {
    const user = userEvent.setup()
    render(<App />)
    await signIntoDemo(user, role)
    expect(window.location.pathname).toBe(demoAccounts[role].path)
    await user.click(screen.getByRole('button', { name: 'Log in as' }))
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    window.history.pushState({}, '', demoAccounts[role].path)
    fireEvent.popState(window)
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: demoAccounts[role].heading })).not.toBeInTheDocument()
  })

  it('keeps a same-role history route but clears the session when history requests a different role', async () => {
    const user = userEvent.setup()
    render(<App />)
    await signIntoDemo(user, 'Patient')
    window.history.pushState({}, '', '/demo/patient')
    fireEvent.popState(window)
    expect(window.location.pathname).toBe('/demo/patient')
    expect(screen.getByRole('heading', { name: 'Welcome, Sofia.' })).toBeInTheDocument()
    window.history.pushState({}, '', '/demo/doctor')
    fireEvent.popState(window)
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    window.history.pushState({}, '', '/demo/patient')
    fireEvent.popState(window)
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: 'Welcome, Sofia.' })).not.toBeInTheDocument()
  })

  it.each(['Doctor', 'Attendant', 'Patient'] as const)('requires fresh credentials after remounting the %s route', async (role) => {
    const user = userEvent.setup()
    const view = render(<App />)
    await signIntoDemo(user, role)
    const records = localStorage.getItem(storageKeys.patients)
    view.unmount()
    render(<App />)
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Email address')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(localStorage.getItem(storageKeys.patients)).toBe(records)
  })

  it('limits the patient preview to its own synthetic care and returns public check-in to that role', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue()))
    const user = userEvent.setup()
    render(<App />)
    await signIntoDemo(user, 'Patient')
    expect(screen.getByRole('heading', { name: 'Welcome, Sofia.' })).toBeInTheDocument()
    expect(screen.queryByText('Alice Santos')).not.toBeInTheDocument()
    expect(screen.queryByText('Bea Cruz')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Search patients' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New walk-in|Book appointment|Record triage|Prescriptions|Clinical notes/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open patient check-in' }))
    expect(screen.getByRole('heading', { name: 'Join today’s queue' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to clinic' }))
    expect(window.location.pathname).toBe('/demo/patient')
    expect(screen.getByRole('heading', { name: 'Welcome, Sofia.' })).toBeInTheDocument()
  })

  it('registers a patient at reception without opening a doctor chart or changing existing histories', async () => {
    const originalPatients = [patient({
      notes: 'Original synthetic interview note',
      records: [{ id: 'old-visit', date: '2026-01-10', signs: 'Original signs', symptoms: 'Original symptoms', diagnosis: 'Original assessment' }],
      prescriptions: [{ id: 'old-rx', date: '2026-01-10', medication: 'Synthetic original medication', strength: 'Original strength', instructions: 'Original directions', duration: 'Original duration', notes: 'Original prescription note' }],
    }), secondPatient()]
    localStorage.setItem(storageKeys.patients, JSON.stringify(originalPatients))
    const user = userEvent.setup()
    render(<App />)
    await signIntoDemo(user, 'Attendant')
    await user.click(screen.getByRole('button', { name: 'New walk-in' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New walk-in patient' }))
    await user.type(dialog.getByRole('textbox', { name: /Patient name/ }), 'Carla Diaz')
    fireEvent.change(dialog.getByLabelText('Date of birth'), { target: { value: '1995-04-03' } })
    await user.selectOptions(dialog.getByRole('combobox', { name: /Sex/ }), 'Female')
    await user.type(dialog.getByRole('textbox', { name: /Contact number/ }), '09175550123')
    await user.selectOptions(dialog.getByRole('combobox', { name: /Allergy status/ }), 'known')
    await user.type(dialog.getByRole('textbox', { name: /^Known allergies/ }), 'Synthetic latex allergy')
    await user.click(dialog.getByRole('button', { name: /^Register/ }))
    expect(window.location.pathname).toBe('/demo/attendant')
    expect(screen.getByRole('heading', { name: 'Reception workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const demographics = within(screen.getByRole('region', { name: 'Today’s patient details' }))
    expect(demographics.getByText('Carla Diaz')).toBeVisible()
    expect(demographics.getByText('1995-04-03')).toBeVisible()
    expect(demographics.getByText('Female')).toBeVisible()
    expect(demographics.getByText('09175550123')).toBeVisible()
    expect(screen.queryByRole('heading', { level: 1, name: 'Carla Diaz' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Clinical notes|Prescriptions|View history/ })).not.toBeInTheDocument()
    const patients = savedPatients()
    expect(patients).toHaveLength(3)
    expect(patients[0]).toMatchObject({ name: 'Carla Diaz', birthDate: '1995-04-03', phone: '09175550123', allergyStatus: 'known', allergy: 'Synthetic latex allergy', records: [], prescriptions: [] })
    expect(patients.slice(1)).toEqual(originalPatients)
  })

  it('keeps a conflicting reception booking open and adds a corrected slot to today’s list without altering original data', async () => {
    const originalAppointments = [appointment({ id: 'original-booking', time: '11:00', duration: 30, reason: 'Original synthetic follow-up' })]
    localStorage.setItem(storageKeys.appointments, JSON.stringify(originalAppointments))
    const originalPatients = savedPatients()
    const user = userEvent.setup()
    render(<App />)
    await signIntoDemo(user, 'Attendant')
    await user.click(screen.getByRole('button', { name: 'Book appointment' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Book an appointment' }))
    await user.selectOptions(dialog.getByRole('combobox', { name: /^Patient/ }), 'patient-b')
    await user.type(dialog.getByRole('textbox', { name: 'Visit type' }), 'Synthetic reception booking')
    await user.click(dialog.getByRole('button', { name: 'Confirm appointment' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('That time overlaps an existing appointment')
    expect(screen.getByRole('dialog', { name: 'Book an appointment' })).toBeVisible()
    expect(JSON.parse(localStorage.getItem(storageKeys.appointments)!)).toEqual(originalAppointments)
    expect(savedPatients()).toEqual(originalPatients)
    await user.selectOptions(dialog.getByRole('combobox', { name: /^Start time/ }), '11:30')
    await user.click(dialog.getByRole('button', { name: 'Confirm appointment' }))
    expect(window.location.pathname).toBe('/demo/attendant')
    expect(screen.getByRole('heading', { name: 'Reception workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const todayList = within(screen.getByRole('region', { name: 'Today’s appointments' }))
    expect(todayList.getByText('Original synthetic follow-up')).toBeVisible()
    expect(todayList.getByText('Synthetic reception booking')).toBeVisible()
    expect(todayList.getByText('Bea Cruz')).toBeVisible()
    expect(todayList.getByText('11:30')).toBeVisible()
    const appointments = JSON.parse(localStorage.getItem(storageKeys.appointments)!) as ReturnType<typeof appointment>[]
    expect(appointments).toHaveLength(2)
    expect(appointments[0]).toEqual(originalAppointments[0])
    expect(appointments[1]).toMatchObject({ patientId: 'patient-b', date: dateKey(new Date()), time: '11:30', duration: 30, reason: 'Synthetic reception booking' })
    expect(savedPatients()).toEqual(originalPatients)
    expect(screen.queryByRole('button', { name: /Clinical notes|Prescriptions|View history/ })).not.toBeInTheDocument()
  })

  it('lets reception record triage while withholding doctor-only tools and preserving chart history', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue({ entries: [{
      id: 'q-reception', number: '001', name: 'Alice Santos', phone: '09171234567', joinedAt: new Date().toISOString(),
      status: 'waiting', patientId: 'patient-a', encounterId: 'encounter-reception', stage: 'triage',
    }] })))
    const user = userEvent.setup()
    render(<App />)
    await signIntoDemo(user, 'Attendant')
    expect(screen.getByRole('heading', { name: 'Reception workspace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New walk-in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book appointment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Clinical notes|Prescriptions|Start consultation|Generate today’s QR|View history/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Search patients' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record triage' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Record triage' }))
    await user.type(dialog.getByLabelText(/Chief complaint/), 'Synthetic reception complaint')
    await user.click(dialog.getByRole('checkbox', { name: /confirmed their identity/ }))
    await user.click(dialog.getByRole('button', { name: 'Save triage & hand off' }))
    expect(savedQueue().entries[0]).toMatchObject({ stage: 'ready', triage: { complaint: 'Synthetic reception complaint' } })
    expect(savedPatients()[0].records).toEqual([])
    expect(savedPatients()[0].prescriptions).toEqual([])
    expect(screen.queryByRole('button', { name: 'Start consultation' })).not.toBeInTheDocument()
  })
})


describe('sign-in cover preview', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function mockCoverImages() {
    const pending: HTMLImageElement[] = []
    const BrowserURL = globalThis.URL
    let number = 0
    class PreviewURL extends BrowserURL {
      static createObjectURL = vi.fn(() => `blob:synthetic-cover-${++number}`)
      static revokeObjectURL = vi.fn()
    }
    vi.stubGlobal('URL', PreviewURL)
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const image = document.createElement('img')
      pending.push(image)
      return image
    })
    return { pending, create: PreviewURL.createObjectURL, revoke: PreviewURL.revokeObjectURL }
  }

  function hero() {
    return document.querySelector<HTMLImageElement>('.login-hero-image')!
  }

  it('shows the bundled hero and exposes a labeled image chooser without changing patient records', () => {
    render(<App />)
    const records = savedPatients()
    expect(hero()).toHaveAttribute('src', '/images/clinic-hero.jpg')
    expect(hero()).toHaveAttribute('alt', '')
    expect(screen.getByRole('button', { name: 'Change cover' })).toBeInTheDocument()
    expect(screen.getByLabelText('Choose a cover image')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(screen.queryByRole('button', { name: 'Reset cover' })).not.toBeInTheDocument()
    expect(savedPatients()).toEqual(records)
  })

  it('accepts a decoded cover, retains it through role changes and demo navigation, and resets on remount', async () => {
    const { pending, revoke } = mockCoverImages()
    const user = userEvent.setup()
    const view = render(<App />)
    const storage = { ...localStorage }
    await user.upload(screen.getByLabelText('Choose a cover image'), new File(['synthetic photo'], 'clinic.jpg', { type: 'image/jpeg' }))
    expect(hero()).toHaveAttribute('src', '/images/clinic-hero.jpg')
    fireEvent.load(pending[0])
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-1')
    expect(screen.getByRole('status')).toHaveTextContent(/Cover updated/)
    await user.click(screen.getByRole('button', { name: 'Patient' }))
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-1')
    await user.click(screen.getByRole('button', { name: 'Explore demo workspace' }))
    expect(revoke).not.toHaveBeenCalledWith('blob:synthetic-cover-1')
    await user.click(screen.getByRole('button', { name: 'Log in as' }))
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-1')
    expect(screen.getByRole('button', { name: 'Reset cover' })).toBeInTheDocument()
    expect({ ...localStorage }).toEqual(storage)
    expect(sessionStorage.length).toBe(0)
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-cover-1')
    render(<App />)
    expect(hero()).toHaveAttribute('src', '/images/clinic-hero.jpg')
  })

  it.each([
    ['unsupported', new File(['synthetic text'], 'cover.txt', { type: 'text/plain' })],
    ['SVG', new File(['<svg />'], 'cover.svg', { type: 'image/svg+xml' })],
    ['oversized', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' })],
  ])('rejects an %s cover without allocating a preview or changing the current image', async (_case, file) => {
    const { create } = mockCoverImages()
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    const storage = { ...localStorage }
    await user.upload(screen.getByLabelText('Choose a cover image'), file)
    expect(screen.getByRole('alert')).toHaveTextContent(/image|PNG|JPG|JPEG|5 MB|5MB/i)
    expect(hero()).toHaveAttribute('src', '/images/clinic-hero.jpg')
    expect(create).not.toHaveBeenCalled()
    expect({ ...localStorage }).toEqual(storage)
  })

  it('accepts the size boundary, replaces and resets covers, and releases discarded image URLs', async () => {
    const { pending, revoke } = mockCoverImages()
    const user = userEvent.setup()
    render(<App />)
    const chooser = screen.getByLabelText('Choose a cover image')
    await user.type(screen.getByLabelText('Email address'), 'synthetic@example.test')
    await user.type(screen.getByLabelText('Password'), 'Synthetic-only-password')
    await user.upload(chooser, new File([new Uint8Array(5 * 1024 * 1024)], 'boundary.webp', { type: 'image/webp' }))
    fireEvent.load(pending[0])
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-1')
    await user.upload(chooser, new File(['replacement photo'], 'replacement.png', { type: 'image/png' }))
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-1')
    fireEvent.load(pending[1])
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-2')
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-cover-1')
    await user.click(screen.getByRole('button', { name: 'Reset cover' }))
    expect(hero()).toHaveAttribute('src', '/images/clinic-hero.jpg')
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-cover-2')
    expect(screen.queryByRole('button', { name: 'Reset cover' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveValue('synthetic@example.test')
    expect(screen.getByLabelText('Password')).toHaveValue('Synthetic-only-password')
  })

  it('rejects a corrupt image without replacing the accepted cover and ignores a cancelled selection', async () => {
    const { pending, create, revoke } = mockCoverImages()
    const user = userEvent.setup()
    render(<App />)
    const chooser = screen.getByLabelText('Choose a cover image')
    await user.upload(chooser, new File(['photo'], 'valid.jpg', { type: 'image/jpeg' }))
    fireEvent.load(pending[0])
    await user.upload(chooser, new File(['corrupt image'], 'corrupt.png', { type: 'image/png' }))
    fireEvent.error(pending[1])
    expect(screen.getByRole('alert')).toHaveTextContent(/image|read|load/i)
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-1')
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-cover-2')
    expect(revoke).not.toHaveBeenCalledWith('blob:synthetic-cover-1')
    fireEvent.change(chooser, { target: { files: [] } })
    expect(create).toHaveBeenCalledTimes(2)
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-1')
  })

  it('keeps the latest chosen cover when earlier image decoding finishes late', async () => {
    const { pending, revoke } = mockCoverImages()
    const user = userEvent.setup()
    render(<App />)
    const chooser = screen.getByLabelText('Choose a cover image')
    await user.upload(chooser, new File(['first photo'], 'first.jpg', { type: 'image/jpeg' }))
    await user.upload(chooser, new File(['second photo'], 'second.jpg', { type: 'image/jpeg' }))
    fireEvent.load(pending[1])
    fireEvent.load(pending[0])
    expect(hero()).toHaveAttribute('src', 'blob:synthetic-cover-2')
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-cover-1')
  })
})
