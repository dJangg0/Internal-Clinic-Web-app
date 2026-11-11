import { describe, expect, it, vi } from 'vitest'
import {
  ageFromBirthDate, dateKey, hasAppointmentConflict, isQueueSession,
  isStoredAppointments, parseStoredPatients, readStored, saveStored,
} from './clinic'
import { appointment, patient, queue } from './test/fixtures'

describe('clinic dates', () => {
  it('uses the local calendar date with zero-padded month and day', () => {
    expect(dateKey(new Date(2026, 0, 2, 23, 45))).toBe('2026-01-02')
  })

  it.each([
    ['1990-05-10', new Date(2026, 4, 9), 35],
    ['1990-05-10', new Date(2026, 4, 10), 36],
    ['1990-05-10', new Date(2026, 4, 11), 36],
    ['2026-05-10', new Date(2026, 4, 10), 0],
    ['', new Date(2026, 4, 10), null],
    ['2027-05-10', new Date(2026, 4, 10), null],
    ['2026-02-30', new Date(2026, 4, 10), null],
    ['not-a-date', new Date(2026, 4, 10), null],
  ])('calculates age for DOB %s as of %s', (birthDate, now, expected) => {
    expect(ageFromBirthDate(birthDate, now)).toBe(expected)
  })
})

describe('appointment scheduling', () => {
  it.each(['scheduled', 'confirmed', 'checked_in'] as const)('blocks overlap with %s appointments', (status) => {
    expect(hasAppointmentConflict(appointment({ time: '09:00', duration: 60 }), [appointment({ time: '09:30', status })])).toBe(true)
  })

  it.each(['cancelled', 'completed'] as const)('allows reuse of a %s appointment slot', (status) => {
    expect(hasAppointmentConflict(appointment(), [appointment({ status })])).toBe(false)
  })

  it.each([
    ['08:30', 30, false], ['09:30', 30, false], ['09:00', 30, true],
    ['08:30', 45, true], ['09:15', 30, true], ['08:00', 120, true],
  ])('handles boundary/containment case %s for %s minutes', (time, duration, conflict) => {
    expect(hasAppointmentConflict(appointment({ time, duration }), [appointment()])).toBe(conflict)
  })

  it('allows the same time on another date', () => {
    expect(hasAppointmentConflict(appointment({ date: '2030-01-02' }), [appointment({ date: '2030-01-01' })])).toBe(false)
  })
})

describe('stored demo data validation', () => {
  it('preserves valid patients and empty directories', () => {
    expect(parseStoredPatients([patient()])).toEqual([patient()])
    expect(parseStoredPatients([])).toEqual([])
  })

  it.each([
    ['No known allergies', 'none'], ['Not recorded', 'unknown'], ['Latex', 'known'],
  ])('migrates the legacy gender and inferred allergy status for %s', (allergy, status) => {
    const legacy: Record<string, unknown> = { ...patient({ allergy }), gender: 'Female' }
    delete legacy.sex
    delete legacy.allergyStatus
    expect(parseStoredPatients([legacy])?.[0]).toMatchObject({ sex: 'Female', allergyStatus: status })
  })

  it('keeps legacy charts without sex or gender readable as unrecorded', () => {
    const legacy: Record<string, unknown> = { ...patient() }
    delete legacy.sex
    expect(parseStoredPatients([legacy])?.[0].sex).toBe('')
  })

  it.each([null, {}, [null], [{ ...patient(), records: null }], [{ ...patient(), joined: 'bad-date' }], [{ ...patient(), birthDate: '2026-02-30' }], [{ ...patient(), allergyStatus: 'invalid' }], [{ ...patient(), allergyStatus: ['known'] }]])('rejects malformed patient storage %#', (value) => {
    expect(parseStoredPatients(value)).toBeNull()
  })

  it('reads existing visit summaries without interview notes', () => {
    const oldRecord = { id: 'r-old', date: '2026-01-02', signs: '', symptoms: '', diagnosis: 'Review' }
    expect(parseStoredPatients([patient({ records: [oldRecord] })])?.[0].records).toEqual([oldRecord])
  })

  it.each([null, {}, [{ ...appointment(), time: '99:99' }], [{ ...appointment(), duration: 0 }], [{ ...appointment(), date: '2026-02-30' }], [{ ...appointment(), status: 'invalid' }], [{ ...appointment(), status: ['scheduled'] }]])('rejects malformed appointment storage %#', (value) => {
    expect(isStoredAppointments(value)).toBe(false)
  })

  it('accepts valid appointment storage', () => {
    expect(isStoredAppointments([appointment()])).toBe(true)
    expect(isStoredAppointments([])).toBe(true)
  })

  it.each([null, {}, { ...queue(), entries: null }, { ...queue(), isOpen: 'yes' }, { ...queue(), entries: [{ joinedAt: 'invalid' }] }, { ...queue(), entries: [{ id: 'q1', number: '001', name: 'Alice', phone: '123', joinedAt: '2026-01-01T10:00:00Z', status: ['waiting'] }] }])('rejects malformed queue storage %#', (value) => {
    expect(isQueueSession(value)).toBe(false)
  })

  it('accepts a complete queue session', () => {
    expect(isQueueSession(queue({ entries: [{ id: 'q1', number: '001', name: 'Alice', phone: '123', joinedAt: new Date().toISOString(), status: 'waiting' }] }))).toBe(true)
  })

  it('returns a fallback for missing, invalid JSON, or wrong-shaped storage', () => {
    const fallback = () => [appointment()]
    for (const raw of [null, '{', 'null', '{}']) {
      if (raw === null) localStorage.removeItem('appointments')
      else localStorage.setItem('appointments', raw)
      expect(readStored('appointments', fallback, isStoredAppointments)).toEqual(fallback())
    }
  })

  it('reads valid persisted data without calling the fallback', () => {
    const saved = [appointment()]
    localStorage.setItem('appointments', JSON.stringify(saved))
    const fallback = vi.fn(() => [])
    expect(readStored('appointments', fallback, isStoredAppointments)).toEqual(saved)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('handles denied browser storage access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    expect(readStored('appointments', () => [], isStoredAppointments)).toEqual([])
  })

  it('persists JSON and removes an expired queue key', () => {
    expect(saveStored('session', queue())).toBe(true)
    expect(JSON.parse(localStorage.getItem('session')!)).toEqual(queue())
    expect(saveStored('session', null)).toBe(true)
    expect(localStorage.getItem('session')).toBeNull()
  })

  it('reports quota failures without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(saveStored('session', queue())).toBe(false)
  })
})
