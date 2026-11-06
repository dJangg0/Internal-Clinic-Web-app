import bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import type { UserRole } from './types.js'

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hiddenPassword(prompt: string) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Run this command with an interactive terminal: docker compose exec -it backend npm run user:create -- ...')
  }
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise<string>((resolve, reject) => {
    let password = ''
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          process.stdin.off('data', onData)
          process.stdin.setRawMode(false)
          process.stdout.write('\n')
          reject(new Error('Cancelled.'))
          return
        }
        if (character === '\r' || character === '\n') {
          process.stdin.off('data', onData)
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdout.write('\n')
          resolve(password)
          return
        }
        if (character === '\u007f' || character === '\b') password = password.slice(0, -1)
        else if (character >= ' ') password += character
      }
    }
    process.stdin.on('data', onData)
  })
}

async function main() {
  const username = argument('username')?.trim()
  const fullName = argument('full-name')?.trim()
  const role = argument('role') as UserRole | undefined
  if (!username || !/^[a-zA-Z0-9._-]{3,100}$/.test(username)) throw new Error('Provide --username with 3–100 letters, numbers, dots, underscores, or hyphens.')
  if (!fullName || fullName.length > 160) throw new Error('Provide --full-name (1–160 characters).')
  if (role !== 'admin_doctor' && role !== 'attendant_secretary') throw new Error('Provide --role admin_doctor or attendant_secretary.')
  const password = await hiddenPassword('New password (minimum 12 characters; input hidden): ')
  if (password.length < 12 || password.length > 200) throw new Error('Password must be between 12 and 200 characters.')
  const confirm = await hiddenPassword('Confirm password: ')
  if (password !== confirm) throw new Error('Passwords did not match.')

  const pool = new Pool({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME ?? 'clinic',
    user: process.env.DATABASE_USER ?? 'clinic_app',
    password: process.env.DATABASE_PASSWORD,
  })
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    await pool.query(
      'INSERT INTO users (username, full_name, password_hash, role) VALUES ($1, $2, $3, $4)',
      [username, fullName, passwordHash, role],
    )
    process.stdout.write(`Created ${role} account "${username}".\n`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'User creation failed.'}\n`)
  process.exitCode = 1
})
