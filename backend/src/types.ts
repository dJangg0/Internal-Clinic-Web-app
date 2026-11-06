export type UserRole = 'admin_doctor' | 'attendant_secretary'

export type SessionUser = {
  id: string
  username: string
  fullName: string
  role: UserRole
}
