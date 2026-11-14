import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { dateKey, type Patient, type QueueSession } from './clinic'
import { appointment, patient, queue, storageKeys } from './test/fixtures'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,dGVzdA==') } }))

const secondPatient = () => patient({ id: 'patient-b', name: 'Bea Cruz', initials: 'BC', patientNumber: 'PT-10002', phone: '09179876543', email: 'bea@example.test' })

beforeEach(() => {
  localStorage.setItem(storageKeys.patients, JSON.stringify([patient(), secondPatient()]))
  localStorage.setItem(storageKeys.appointments, '[]')
})

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
    render(<App />)
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
    render(<App />)
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
    render(<App />)
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
    render(<App />)
    await openChart(user, 'Bea Cruz')
    await user.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByRole('combobox', { name: /^Patient/ })).toHaveValue('patient-b')
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }))
    expect(JSON.parse(localStorage.getItem(storageKeys.appointments)!)[0]).toMatchObject({ patientId: 'patient-b', reason: 'Office visit', status: 'scheduled' })
  })

  it('keeps a conflicting booking open and accepts an adjacent slot after correction', async () => {
    localStorage.setItem(storageKeys.appointments, JSON.stringify([appointment({ time: '11:00', duration: 45 })]))
    const user = userEvent.setup()
    render(<App />)
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
    const view = render(<App />)
    await openChart(user)
    await startVisit(user)
    await user.type(screen.getByLabelText(/Interview notes/), 'Patient reports symptoms since yesterday.')
    expect(savedPatients()[0].notes).toBe('Patient reports symptoms since yesterday.')
    await user.click(screen.getByRole('button', { name: 'Save visit to chart' }))
    expect(screen.getByText('Patient reports symptoms since yesterday.')).toBeInTheDocument()
    expect(savedPatients()[0]).toMatchObject({ notes: '', lastVisit: dateKey(new Date()), records: [{ notes: 'Patient reports symptoms since yesterday.', signs: '', symptoms: '', diagnosis: '' }] })
    view.unmount()
    render(<App />)
    await openChart(user)
    await user.click(screen.getByRole('button', { name: /^Medical history/ }))
    expect(screen.getByText('Patient reports symptoms since yesterday.')).toBeInTheDocument()
  })

  it('rejects a completely empty visit without adding a record', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openChart(user)
    await startVisit(user)
    await user.click(screen.getByRole('button', { name: 'Save visit to chart' }))
    expect(screen.getByText('Add a note, signs, symptoms, or diagnosis before saving.')).toBeInTheDocument()
    expect(savedPatients()[0].records).toHaveLength(0)
  })

  it('saves signs, symptoms, and diagnosis to the correct patient', async () => {
    const user = userEvent.setup()
    render(<App />)
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
    render(<App />)
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
    render(<App />)
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
    render(<App />)
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
    render(<App />)
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
    render(<App />)
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
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('This check-in link isn’t connected')
    expect(screen.queryByRole('button', { name: 'Get my queue number' })).not.toBeInTheDocument()
  })

  it('rejects a previously open check-in form when the local day has changed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-09T23:59:00'))
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue()))
    window.history.replaceState({}, '', '/?queue=test-daily-token')
    const user = userEvent.setup()
    render(<App />)
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
    render(<App />)
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
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /Good morning/ })).toBeInTheDocument()
    expect(savedPatients()).toHaveLength(5)
  })

  it('keeps the app usable and warns when browser storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /Good morning/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Browser storage is unavailable. Changes may be lost when you reload.')
  })

  it('shows storage failure on the patient ticket when a check-in cannot persist', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue()))
    window.history.replaceState({}, '', '/?queue=test-daily-token')
    const user = userEvent.setup()
    render(<App />)
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
    render(<App />)
    const searchField = screen.getByRole('textbox', { name: 'Search patients' })
    await user.type(searchField, '  Bea Cruz  ')
    expect(within(searchField.parentElement!).getByRole('button', { name: /Bea Cruz/ })).toBeInTheDocument()
  })
})

describe('demo reset', () => {
  it('resets changed clinic records and queue state to the repeatable synthetic scenario', async () => {
    localStorage.setItem(storageKeys.queue, JSON.stringify(queue({ entries: [{ id: 'q-old', number: '001', name: 'Test', phone: '0917', joinedAt: new Date().toISOString(), status: 'waiting' }] })))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(await screen.findByRole('heading', { name: /Good morning, Maya/ })).toBeInTheDocument()
    expect(screen.getByText('Paolo Mendoza')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(storageKeys.patients)!)).toHaveLength(5)
    expect(JSON.parse(localStorage.getItem(storageKeys.queue)!)).toBeNull()
  })
})
