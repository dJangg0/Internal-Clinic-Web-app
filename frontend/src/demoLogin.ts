export type DemoRole = 'Patient' | 'Attendant' | 'Doctor'

// These are public walkthrough accounts, not production authentication secrets.
export const DEMO_ACCOUNTS: Record<DemoRole, { email: string; password: string; name: string }> = {
  Doctor: { email: 'doctor@northstar.demo', password: 'DoctorDemo123!', name: 'Dr. Maya Reyes' },
  Attendant: { email: 'secretary@northstar.demo', password: 'StaffDemo123!', name: 'Ana Santos' },
  Patient: { email: 'patient@northstar.demo', password: 'PatientDemo123!', name: 'Sofia Reyes' },
}

export function matchDemoCredentials(role: DemoRole, email: string, password: string): boolean {
  const account = DEMO_ACCOUNTS[role]
  return email.trim().toLowerCase() === account.email && password === account.password
}

export function demoPath(role: DemoRole): string {
  return `/demo/${role.toLowerCase()}`
}
