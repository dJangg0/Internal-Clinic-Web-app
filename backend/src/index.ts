import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import connectCors from 'cors'
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import session from 'express-session'
import helmet from 'helmet'
import RedisStore from 'connect-redis'
import { Pool } from 'pg'
import { createClient } from 'redis'
import { Server as SocketServer } from 'socket.io'
import { z } from 'zod'
import type { SessionUser, UserRole } from './types.js'

const port = Number(process.env.PORT ?? 3000)
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.')
}

const pool = new Pool({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME ?? 'clinic',
  user: process.env.DATABASE_USER ?? 'clinic_app',
  password: process.env.DATABASE_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

const redisClient = createClient({
  url: `redis://:${encodeURIComponent(process.env.REDIS_PASSWORD ?? '')}@${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`,
})
redisClient.on('error', (error) => console.error('Redis client error:', error.message))

const sessionStore = new RedisStore({ client: redisClient, prefix: 'clinic:session:' })
const sessionMiddleware = session({
  name: 'clinic.sid',
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000,
  },
})

const app = express()
const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: { origin: frontendOrigin, credentials: true },
})

app.disable('x-powered-by')
app.use(helmet())
app.use(connectCors({ origin: frontendOrigin, credentials: true }))
app.use(express.json({ limit: '100kb' }))
app.use(sessionMiddleware)
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

const validRole = z.enum(['admin_doctor', 'attendant_secretary'])
const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
  role: validRole,
}).strict()
const createUserSchema = z.object({
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: z.string().trim().min(1).max(160),
  password: z.string().min(12).max(200),
  role: validRole,
}).strict()
const patientSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  dateOfBirth: z.string().date(),
  sex: z.enum(['Female', 'Male', 'Intersex', 'Other', 'Unknown', 'Prefer not to say']),
  contactNumber: z.string().trim().max(32).default(''),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]).default(''),
  allergyStatus: z.enum(['unknown', 'none', 'known']),
  allergies: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict().refine((patient) => {
  if (patient.allergyStatus === 'known') return patient.allergies.length > 0
  return patient.allergies.length === 0
}, { message: 'Known allergies need at least one allergy; other statuses cannot include allergy details.' })
const triageSchema = z.object({
  bloodPressure: z.string().trim().max(32).default(''),
  weightKg: z.number().positive().max(500).nullable().optional(),
  temperatureC: z.number().min(25).max(45).nullable().optional(),
  chiefComplaint: z.string().trim().max(2000).default(''),
  initialNotes: z.string().trim().max(10000).default(''),
}).strict()
const completeVisitSchema = z.object({
  diagnosis: z.string().trim().max(5000).default(''),
  medicalNotes: z.string().trim().max(20000).default(''),
  prescriptions: z.array(z.object({
    medication: z.string().trim().min(1).max(200),
    strength: z.string().trim().max(100).default(''),
    instructions: z.string().trim().max(2000).default(''),
    duration: z.string().trim().max(100).default(''),
    notes: z.string().trim().max(2000).default(''),
  }).strict()).max(30).default([]),
}).strict()

function authenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  next()
}

function allowRoles(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    const user = req.session.user
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' })
      return
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'You do not have access to this information.' })
      return
    }
    next()
  }
}

function invalidBody<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the entered information.', fields: parsed.error.flatten().fieldErrors })
    return null
  }
  return parsed.data
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve())
  })
}

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve())
  })
}

function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => error ? reject(error) : resolve())
  })
}

async function migrateLegacySchema() {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(20261105)')
    const legacy = await client.query<{ has_personal_details: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'personal_details'
      ) AS has_personal_details
    `)
    if (legacy.rows[0]?.has_personal_details) {
      await client.query('BEGIN')
      const indexes = [
        ['appointments_patient_start_idx', 'appointments_legacy_patient_start_idx'],
        ['appointments_clinician_start_idx', 'appointments_legacy_clinician_start_idx'],
        ['prescriptions_patient_date_idx', 'prescriptions_legacy_patient_date_idx'],
      ] as const
      for (const [oldName, archivedName] of indexes) {
        const found = await client.query('SELECT to_regclass($1) AS name', [`public.${oldName}`])
        if (found.rows[0]?.name) await client.query(`ALTER INDEX public."${oldName}" RENAME TO "${archivedName}"`)
      }
      const tables = [
        ['appointments', 'appointments_legacy'],
        ['prescriptions', 'prescriptions_legacy'],
        ['medical_records', 'medical_records_legacy'],
        ['live_notes', 'live_notes_legacy'],
        ['clinicians', 'clinicians_legacy'],
        ['patients', 'patients_legacy'],
      ] as const
      for (const [oldName, archivedName] of tables) {
        const found = await client.query('SELECT to_regclass($1) AS name, to_regclass($2) AS archived', [`public.${oldName}`, `public.${archivedName}`])
        if (found.rows[0]?.name && !found.rows[0]?.archived) {
          await client.query(`ALTER TABLE public."${oldName}" RENAME TO "${archivedName}"`)
        }
      }
      await client.query('COMMIT')
      console.warn('Archived the previous demo schema as *_legacy tables; no existing data was dropped.')
    }

    const schemaPath = path.resolve(process.cwd(), '../db/init.sql')
    const schema = await readFile(schemaPath, 'utf8')
    await client.query(schema)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.query('SELECT pg_advisory_unlock(20261105)').catch(() => undefined)
    client.release()
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
})

app.post('/api/auth/login', loginRateLimit, async (req, res, next) => {
  try {
    const credentials = invalidBody(loginSchema, req.body, res)
    if (!credentials) return
    const result = await pool.query<{
      id: string
      username: string
      full_name: string
      password_hash: string
      role: UserRole
      is_active: boolean
    }>(
      'SELECT id, username, full_name, password_hash, role, is_active FROM users WHERE lower(username) = lower($1)',
      [credentials.username],
    )
    const account = result.rows[0]
    const passwordMatches = account ? await bcrypt.compare(credentials.password, account.password_hash) : false
    if (!account || !account.is_active || !passwordMatches || account.role !== credentials.role) {
      res.status(401).json({ error: 'Username, password, or account type is incorrect.' })
      return
    }
    await regenerateSession(req)
    const user: SessionUser = {
      id: account.id,
      username: account.username,
      fullName: account.full_name,
      role: account.role,
    }
    req.session.user = user
    await saveSession(req)
    res.json({ user })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', authenticated, (req, res) => res.json({ user: req.session.user }))

app.post('/api/auth/logout', authenticated, async (req, res, next) => {
  try {
    await destroySession(req)
    res.clearCookie('clinic.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/users', authenticated, allowRoles('admin_doctor'), async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT id, username, full_name AS "fullName", role, is_active AS "isActive", created_at AS "createdAt" FROM users ORDER BY full_name')
    res.json({ users: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/users', authenticated, allowRoles('admin_doctor'), async (req, res, next) => {
  try {
    const values = invalidBody(createUserSchema, req.body, res)
    if (!values) return
    const passwordHash = await bcrypt.hash(values.password, 12)
    const result = await pool.query(
      'INSERT INTO users (username, full_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, full_name AS "fullName", role, is_active AS "isActive"',
      [values.username, values.fullName, passwordHash, values.role],
    )
    res.status(201).json({ user: result.rows[0] })
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      res.status(409).json({ error: 'That username is already in use.' })
      return
    }
    next(error)
  }
})

app.get('/api/patients', authenticated, async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, patient_number AS "patientNumber", full_name AS "name",
             date_of_birth::text AS "birthDate", sex, contact_number AS phone, email,
             allergy_status AS "allergyStatus", allergies,
             created_at::date::text AS joined
      FROM patients ORDER BY full_name
    `)
    res.json({ patients: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/patients', authenticated, async (req, res, next) => {
  try {
    const values = invalidBody(patientSchema, req.body, res)
    if (!values) return
    if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      res.status(400).json({ error: 'Date of birth cannot be in the future.' })
      return
    }
    const result = await pool.query(`
      INSERT INTO patients (full_name, date_of_birth, sex, contact_number, email, allergy_status, allergies)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, patient_number AS "patientNumber", full_name AS "name", date_of_birth::text AS "birthDate",
                sex, contact_number AS phone, email, allergy_status AS "allergyStatus", allergies, created_at::date::text AS joined
    `, [values.fullName, values.dateOfBirth, values.sex, values.contactNumber, values.email, values.allergyStatus, values.allergies])
    res.status(201).json({ patient: result.rows[0] })
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      res.status(409).json({ error: 'That patient number is already in use.' })
      return
    }
    next(error)
  }
})

app.patch('/api/patients/:patientId', authenticated, async (req, res, next) => {
  try {
    const values = invalidBody(patientSchema, req.body, res)
    if (!values) return
    if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      res.status(400).json({ error: 'Date of birth cannot be in the future.' })
      return
    }
    const result = await pool.query(`
      UPDATE patients SET full_name = $2, date_of_birth = $3, sex = $4, contact_number = $5,
             email = $6, allergy_status = $7, allergies = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, patient_number AS "patientNumber", full_name AS "name", date_of_birth::text AS "birthDate",
                sex, contact_number AS phone, email, allergy_status AS "allergyStatus", allergies, created_at::date::text AS joined
    `, [req.params.patientId, values.fullName, values.dateOfBirth, values.sex, values.contactNumber, values.email, values.allergyStatus, values.allergies])
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Patient not found.' })
      return
    }
    res.json({ patient: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/patients/:patientId', authenticated, allowRoles('admin_doctor'), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM patients WHERE id = $1 RETURNING id', [req.params.patientId])
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Patient not found.' })
      return
    }
    res.status(204).end()
  } catch (error) {
    if (isPgForeignKeyViolation(error)) {
      res.status(409).json({ error: 'Patients with appointments or visits cannot be deleted.' })
      return
    }
    next(error)
  }
})

const appointmentSchema = z.object({
  patientId: z.string().uuid(),
  date: z.string().date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(15).max(240),
  reason: z.string().trim().max(500).default('Office visit'),
}).strict()

app.get('/api/appointments', authenticated, async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.patient_id AS "patientId", a.start_time::date::text AS date,
             to_char(a.start_time, 'HH24:MI') AS time,
             (extract(epoch FROM (a.end_time - a.start_time)) / 60)::int AS duration,
             a.reason, a.status, u.full_name AS clinician
      FROM appointments AS a JOIN users AS u ON u.id = a.clinician_id
      ORDER BY a.start_time
    `)
    res.json({ appointments: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/appointments', authenticated, async (req, res, next) => {
  try {
    const values = invalidBody(appointmentSchema, req.body, res)
    if (!values) return
    const clinician = req.session.user!.role === 'admin_doctor'
      ? { rows: [{ id: req.session.user!.id }] }
      : await pool.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin_doctor' AND is_active ORDER BY created_at LIMIT 1")
    if (!clinician.rows[0]) {
      res.status(409).json({ error: 'Create an active doctor account before booking appointments.' })
      return
    }
    const start = new Date(`${values.date}T${values.time}:00`).toISOString()
    const end = new Date(new Date(start).getTime() + values.duration * 60_000).toISOString()
    const result = await pool.query(`
      INSERT INTO appointments (patient_id, clinician_id, start_time, end_time, reason, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, patient_id AS "patientId", start_time::date::text AS date,
                to_char(start_time, 'HH24:MI') AS time,
                (extract(epoch FROM (end_time - start_time)) / 60)::int AS duration,
                reason, status, (SELECT full_name FROM users WHERE id = $2) AS clinician
    `, [values.patientId, clinician.rows[0].id, start, end, values.reason || 'Office visit', req.session.user!.id])
    res.status(201).json({ appointment: result.rows[0] })
  } catch (error) {
    if (isPgExclusionViolation(error)) {
      res.status(409).json({ error: 'That time overlaps an existing appointment. Choose another slot.' })
      return
    }
    next(error)
  }
})

app.get('/api/patients/:patientId/history', authenticated, allowRoles('admin_doctor'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT visit_id AS id, visit_date::date::text AS date, blood_pressure, weight_kg, temperature_c,
             chief_complaint, initial_notes, diagnosis, medical_notes, prescriptions
      FROM completed_visit_history WHERE patient_id = $1 ORDER BY visit_date DESC NULLS LAST
    `, [req.params.patientId])
    res.json({ visits: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/visits', authenticated, async (req, res, next) => {
  try {
    const values = z.object({ patientId: z.string().uuid() }).strict().safeParse(req.body)
    if (!values.success) {
      res.status(400).json({ error: 'A valid patient is required.' })
      return
    }
    const result = await pool.query(`
      INSERT INTO visits (patient_id, attendant_id)
      VALUES ($1, $2)
      RETURNING id, patient_id AS "patientId", status, created_at AS "createdAt"
    `, [values.data.patientId, req.session.user!.id])
    res.status(201).json({ visit: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.get('/api/visits/:visitId/initial', authenticated, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, patient_id AS "patientId", status, blood_pressure AS "bloodPressure",
             weight_kg AS "weightKg", temperature_c AS "temperatureC", chief_complaint AS "chiefComplaint",
             initial_notes AS "initialNotes", queued_at AS "queuedAt"
      FROM visits WHERE id = $1 AND status IN ('in_triage', 'waiting', 'in_progress')
    `, [req.params.visitId])
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Active visit not found.' })
      return
    }
    res.json({ visit: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/visits/:visitId/triage', authenticated, allowRoles('admin_doctor', 'attendant_secretary'), async (req, res, next) => {
  try {
    const values = invalidBody(triageSchema, req.body, res)
    if (!values) return
    const result = await pool.query(`
      UPDATE visits SET blood_pressure = $2, weight_kg = $3, temperature_c = $4,
             chief_complaint = $5, initial_notes = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('in_triage', 'waiting')
      RETURNING id, patient_id AS "patientId", status
    `, [req.params.visitId, values.bloodPressure, values.weightKg ?? null, values.temperatureC ?? null, values.chiefComplaint, values.initialNotes])
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Editable triage visit not found.' })
      return
    }
    res.json({ visit: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/visits/:visitId/queue', authenticated, allowRoles('admin_doctor', 'attendant_secretary'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      UPDATE visits SET status = 'waiting', queued_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'in_triage'
      RETURNING id, patient_id AS "patientId", queued_at AS "queuedAt", chief_complaint AS "chiefComplaint"
    `, [req.params.visitId])
    const visit = result.rows[0]
    if (!visit) {
      res.status(409).json({ error: 'Only a visit in triage can be added to the queue.' })
      return
    }
    const patient = await pool.query<{ name: string; age: number }>(
      'SELECT full_name AS name, date_part(\'year\', age(current_date, date_of_birth))::int AS age FROM patients WHERE id = $1',
      [visit.patientId],
    )
    const queueItem = { visitId: visit.id, patientId: visit.patientId, patientName: patient.rows[0].name, age: patient.rows[0].age, chiefComplaint: visit.chiefComplaint, queuedAt: visit.queuedAt }
    io.to('role:admin_doctor').emit('queue:patient-added', queueItem)
    res.status(200).json({ visit: { ...visit, ...queueItem } })
  } catch (error) {
    next(error)
  }
})

app.get('/api/queue', authenticated, allowRoles('admin_doctor'), async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT v.id AS "visitId", p.id AS "patientId", p.full_name AS "patientName",
             date_part('year', age(current_date, p.date_of_birth))::int AS age,
             v.chief_complaint AS "chiefComplaint", v.queued_at AS "queuedAt"
      FROM visits AS v JOIN patients AS p ON p.id = v.patient_id
      WHERE v.status = 'waiting' ORDER BY v.queued_at ASC
    `)
    res.json({ queue: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/visits/:visitId/start', authenticated, allowRoles('admin_doctor'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      UPDATE visits SET status = 'in_progress', doctor_id = $2, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'waiting'
      RETURNING id, patient_id AS "patientId", status
    `, [req.params.visitId, req.session.user!.id])
    if (!result.rows[0]) {
      res.status(409).json({ error: 'This patient is no longer waiting in the queue.' })
      return
    }
    io.to('role:admin_doctor').emit('queue:patient-removed', { visitId: result.rows[0].id, reason: 'in_progress' })
    res.json({ visit: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/visits/:visitId/complete', authenticated, allowRoles('admin_doctor'), async (req, res, next) => {
  const values = invalidBody(completeVisitSchema, req.body, res)
  if (!values) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const visitResult = await client.query(`
      UPDATE visits SET diagnosis = $2, medical_notes = $3, status = 'completed',
             doctor_id = $4, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'in_progress'
      RETURNING id, patient_id AS "patientId", completed_at AS "completedAt"
    `, [req.params.visitId, values.diagnosis, values.medicalNotes, req.session.user!.id])
    const visit = visitResult.rows[0]
    if (!visit) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Start the visit before completing it.' })
      return
    }
    if ((values.prescriptions ?? []).length > 0) {
      await client.query(
        'INSERT INTO prescriptions (visit_id, doctor_id, medications) VALUES ($1, $2, $3::jsonb)',
        [req.params.visitId, req.session.user!.id, JSON.stringify(values.prescriptions ?? [])],
      )
    }
    await client.query('COMMIT')
    io.to('role:admin_doctor').emit('queue:patient-removed', { visitId: visit.id, reason: 'completed' })
    res.json({ visit })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    next(error)
  } finally {
    client.release()
  }
})

io.engine.use(sessionMiddleware)
io.use((socket, next) => {
  const user = (socket.request as Request).session?.user
  if (!user) {
    next(new Error('Authentication required.'))
    return
  }
  if (user.role !== 'admin_doctor') {
    next(new Error('Queue access is restricted to doctors.'))
    return
  }
  next()
})
io.on('connection', (socket) => {
  socket.join('role:admin_doctor')
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = isPgUniqueViolation(error) ? 409 : 500
  if (status === 500) console.error('Request failed:', error)
  res.status(status).json({ error: status === 409 ? 'A record with this identifier already exists.' : 'The request could not be completed.' })
})

function isPgUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === '23505'
}

function isPgForeignKeyViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === '23503'
}

function isPgExclusionViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === '23P01'
}

async function seedDevelopmentAccounts() {
  if (process.env.NODE_ENV !== 'development' || process.env.DEMO_LOGIN_ENABLED !== 'true') return

  const demoAccounts = [
    {
      username: 'clinic-admin',
      fullName: 'Demo Clinic Admin',
      password: 'ClinicAdmin!2026',
      role: 'admin_doctor' as const,
    },
    {
      username: 'clinic-attendant',
      fullName: 'Demo Clinic Attendant',
      password: 'ClinicAttendant!2026',
      role: 'attendant_secretary' as const,
    },
  ]

  for (const account of demoAccounts) {
    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [account.username])
    if (existing.rowCount) continue
    const passwordHash = await bcrypt.hash(account.password, 12)
    await pool.query(
      'INSERT INTO users (username, full_name, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING',
      [account.username, account.fullName, passwordHash, account.role],
    )
  }
}

async function start() {
  await redisClient.connect()
  await pool.query('SELECT 1')
  await migrateLegacySchema()
  await seedDevelopmentAccounts()
  httpServer.listen(port, '0.0.0.0', () => console.log(`Clinic API listening on ${port}`))
}

start().catch((error) => {
  console.error('Backend startup failed:', error)
  process.exit(1)
})
