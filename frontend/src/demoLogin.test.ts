import { describe, expect, it } from 'vitest'
import { DEMO_ACCOUNTS, demoPath, matchDemoCredentials, type DemoRole } from './demoLogin'

const accounts = [
  ['Doctor', 'doctor@northstar.demo', 'DoctorDemo123!', '/demo/doctor'],
  ['Attendant', 'secretary@northstar.demo', 'StaffDemo123!', '/demo/attendant'],
  ['Patient', 'patient@northstar.demo', 'PatientDemo123!', '/demo/patient'],
] as const

describe('synthetic demo login accounts', () => {
  it.each(accounts)('accepts the published %s credentials with a normalized email', (role, email, password, path) => {
    expect(DEMO_ACCOUNTS[role]).toMatchObject({ email, password })
    expect(DEMO_ACCOUNTS[role].name.trim()).not.toBe('')
    expect(matchDemoCredentials(role, email, password)).toBe(true)
    expect(matchDemoCredentials(role, `  ${email.toUpperCase()}  `, password)).toBe(true)
    expect(demoPath(role)).toBe(path)
  })

  it.each(accounts)('requires an exact %s password and a matching account', (role, email, password) => {
    for (const invalid of ['', password.toLowerCase(), `${password} `, ` ${password}`, `${password}!`]) {
      expect(matchDemoCredentials(role, email, invalid)).toBe(false)
    }
    for (const invalid of ['', 'not-an-email', 'unknown@northstar.demo', `${email}.invalid`]) {
      expect(matchDemoCredentials(role, invalid, password)).toBe(false)
    }
  })

  it.each(accounts)('rejects the %s account when a different role is selected', (accountRole, email, password) => {
    for (const selectedRole of Object.keys(DEMO_ACCOUNTS) as DemoRole[]) {
      if (selectedRole !== accountRole) expect(matchDemoCredentials(selectedRole, email, password)).toBe(false)
    }
  })
})
