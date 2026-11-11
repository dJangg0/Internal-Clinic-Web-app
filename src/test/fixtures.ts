import { dateKey, type Appointment, type Patient, type QueueSession } from '../clinic'

export function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'patient-a', name: 'Alice Santos', initials: 'AS', birthDate: '1990-05-10',
    sex: 'Female', phone: '09171234567', email: 'alice@example.test', patientNumber: 'PT-10001',
    joined: '2026-01-01', allergy: 'Not recorded', allergyStatus: 'unknown', lastVisit: 'New patient',
    notes: '', records: [], prescriptions: [], ...overrides,
  }
}

export function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appointment-a', patientId: 'patient-a', date: dateKey(new Date()), time: '09:00',
    duration: 30, reason: 'Follow-up', status: 'scheduled', clinician: 'Dr. Maya Reyes', ...overrides,
  }
}

export function queue(overrides: Partial<QueueSession> = {}): QueueSession {
  return { date: dateKey(new Date()), token: 'test-daily-token', isOpen: true, entries: [], ...overrides }
}

export const storageKeys = {
  patients: 'northstar-demo-patients-v1',
  appointments: 'northstar-demo-appointments-v1',
  queue: 'northstar-demo-daily-queue-v1',
}
