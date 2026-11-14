import { test as base, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const test = base.extend<{ runtimeErrors: void }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use()
    expect(errors, 'The browser should have no unhandled application errors').toEqual([])
  }, { auto: true }],
})

async function navigate(page: Page, name: RegExp) {
  const button = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name })
  const mobileMenu = page.getByRole('button', { name: 'Open navigation' })
  if (await mobileMenu.isVisible()) await mobileMenu.click()
  await button.click()
}

async function openChart(page: Page, name: string) {
  const globalSearch = page.getByRole('textbox', { name: 'Search patients', exact: true })
  if (await globalSearch.isVisible()) {
    await globalSearch.fill(name)
    await page.locator('.search-popover').getByRole('button', { name: new RegExp(name) }).click()
  } else {
    await navigate(page, /^Patients/)
    await page.getByPlaceholder('Search by name, patient ID, or phone').fill(name)
    await page.getByRole('row').filter({ hasText: name }).click()
  }
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // Keep seed appointments on a Monday and DOB/calendar assertions stable.
  await page.clock.setFixedTime(new Date('2026-11-09T01:00:00Z'))
  await page.goto('/')
})

test('walk-in registration, clinical history, prescription and appointment survive reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await page.getByRole('button', { name: 'New walk-in', exact: true }).click()
  const registration = page.getByRole('dialog', { name: 'New walk-in patient' })
  await registration.getByLabel(/^Patient name/).fill('Jamie Demo')
  await registration.getByLabel('Date of birth', { exact: true }).fill('1995-04-12')
  await registration.getByLabel(/^Sex/).selectOption('Other')
  await registration.getByLabel(/^Contact number/).fill('09171234567')
  await registration.getByLabel(/^Allergy status/).selectOption('known')
  await registration.getByLabel(/^Known allergies/).fill('Example allergy')
  await registration.getByLabel(/^Known allergies/).press('Enter')
  await expect(page.getByRole('heading', { name: 'Jamie Demo', exact: true })).toBeVisible()
  await expect(page.locator('.chart-alert')).toContainText('Example allergy')

  await page.getByRole('button', { name: 'Start visit', exact: true }).first().click()
  await page.getByLabel(/^Interview notes/).fill('Synthetic interview note for regression testing.')
  await page.getByLabel(/^Signs/).fill('Synthetic observed findings')
  await page.getByLabel(/^Symptoms/).fill('Synthetic reported concern')
  await page.getByLabel('Assessment / diagnosis').fill('Demo assessment')
  await page.getByRole('button', { name: 'Save visit to chart' }).click()
  await expect(page.getByRole('heading', { name: 'Medical history', exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic interview note for regression testing.', { exact: true })).toBeVisible()
  await expect(page.getByText('Demo assessment', { exact: true })).toBeVisible()

  await page.locator('.chart-tabs').getByRole('button', { name: /^Prescriptions/ }).click()
  await page.getByLabel(/^Medication name/).fill('Demo medication')
  await page.getByLabel(/^Strength/).fill('Demo strength')
  await page.getByLabel('Directions for use').fill('Synthetic directions for testing only')
  await page.getByRole('button', { name: 'Add to chart', exact: true }).click()
  await expect(page.locator('.prescription-list')).toContainText('Demo medication')

  await page.getByRole('button', { name: 'Schedule', exact: true }).click()
  const appointment = page.getByRole('dialog', { name: 'Book an appointment' })
  await expect(appointment.locator('#appointment-patient option:checked')).toContainText('Jamie Demo')
  await appointment.getByLabel(/^Start time/).selectOption('15:00')
  await appointment.getByLabel('Visit type').fill('Demo follow-up')
  await appointment.getByLabel('Visit type').press('Enter')
  await expect(page.locator('.upcoming-list')).toContainText('Demo follow-up')

  await page.reload()
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await openChart(page, 'Jamie Demo')
  await page.locator('.chart-tabs').getByRole('button', { name: /^Medical history/ }).click()
  await expect(page.getByText('Synthetic interview note for regression testing.', { exact: true })).toBeVisible()
  await page.locator('.chart-tabs').getByRole('button', { name: /^Prescriptions/ }).click()
  await expect(page.locator('.prescription-list')).toContainText('Demo medication')
  await navigate(page, /^Appointments$/)
  await expect(page.locator('.upcoming-list')).toContainText('Demo follow-up')
})

test('chart scheduling selects its patient and conflicting appointments cannot be saved', async ({ page }) => {
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await openChart(page, 'Mateo Cruz')
  await page.getByRole('button', { name: 'Schedule', exact: true }).click()
  const appointment = page.getByRole('dialog', { name: 'Book an appointment' })
  await expect(appointment.locator('#appointment-patient option:checked')).toContainText('Mateo Cruz')
  await appointment.getByLabel(/^Start time/).selectOption('09:00')
  await appointment.getByRole('button', { name: 'Confirm appointment' }).press('Enter')
  await expect(appointment).toContainText('That time overlaps an existing appointment')
  await expect(appointment).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(appointment).toBeHidden()
  await navigate(page, /^Appointments$/)
  await expect(page.locator('.upcoming-list .upcoming-row')).toHaveCount(5)
})

test('queue deduplicates check-ins, serves patients, persists and rejects unavailable links', async ({ page, browser }) => {
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await navigate(page, /^Daily queue/)
  await page.getByRole('button', { name: 'Generate today’s QR' }).click()
  await expect(page.getByRole('img', { name: 'QR code for today’s patient check-in', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Preview patient check-in', exact: true }).click()
  const checkInURL = page.url()
  await page.getByLabel(/^Full name/).fill('Alex Queue Demo')
  await page.getByLabel(/^Phone number/).fill('0917 123 4567')
  await page.getByLabel(/^Date of birth/).fill('1990-05-10')
  await page.getByLabel(/^Sex/).selectOption('Female')
  await page.getByLabel(/^Allergy status/).selectOption('none')
  await page.getByLabel(/^Allergy status/).blur()
  await page.getByRole('button', { name: 'Get my queue number' }).click()
  await expect(page.getByRole('status')).toContainText('001')
  await page.getByRole('button', { name: 'Back to clinic' }).click()
  await page.getByRole('button', { name: 'Preview patient check-in', exact: true }).click()
  await page.getByLabel(/^Full name/).fill('alex queue demo')
  await page.getByLabel(/^Phone number/).fill('09171234567')
  await page.getByLabel(/^Date of birth/).fill('1990-05-10')
  await page.getByLabel(/^Sex/).selectOption('Female')
  await page.getByLabel(/^Allergy status/).selectOption('none')
  await page.getByLabel(/^Allergy status/).blur()
  await page.getByRole('button', { name: 'Get my queue number' }).click()
  await expect(page.getByRole('status')).toContainText('001')
  await page.getByRole('button', { name: 'Back to clinic' }).click()
  await expect(page.locator('.queue-table-row')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Call next', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Record triage' }).click()
  await page.getByLabel(/^Chief complaint/).fill('Headache')
  await page.getByLabel(/^Initial notes/).fill('No warning symptoms reported')
  await page.getByRole('checkbox', { name: /confirmed their identity/ }).check()
  await page.getByRole('button', { name: 'Save triage & hand off' }).click()
  await expect(page.locator('.queue-table-row')).toContainText('Ready for doctor')
  await page.getByRole('button', { name: 'Start consultation' }).click()
  await page.getByRole('checkbox', { name: /reviewed the allergy information/ }).check()
  await page.getByLabel(/^Assessment \/ diagnosis/).fill('Tension headache')
  await page.getByLabel(/^Consultation notes/).fill('Synthetic demo consultation note')
  await page.getByRole('button', { name: 'Save visit to patient history' }).click()
  await expect(page.locator('.queue-table-row')).toContainText('Visit complete')
  await page.getByRole('button', { name: 'View history' }).click()
  await expect(page.getByRole('heading', { name: 'Medical history', exact: true })).toBeVisible()
  await expect(page.locator('.timeline')).toContainText('Headache')
  await navigate(page, /^Daily queue/)
  await page.getByRole('button', { name: 'Pause check-in' }).click()
  await page.getByRole('button', { name: 'Preview patient check-in', exact: true }).click()
  await expect(page.getByText('Check-in is paused', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Get my queue number' })).toBeHidden()
  await page.getByRole('button', { name: 'Back to clinic' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await navigate(page, /^Daily queue/)
  await expect(page.locator('.queue-table-row')).toContainText('Visit complete')
  await expect(page.getByRole('button', { name: 'Reopen check-in' })).toBeVisible()

  // A separate browser context has no shared localStorage: do not imply phone synchronization.
  const phone = await browser.newContext({ timezoneId: 'Asia/Manila' })
  try {
    const phonePage = await phone.newPage()
    await phonePage.clock.setFixedTime(new Date('2026-11-09T01:00:00Z'))
    await phonePage.goto(checkInURL)
    await expect(phonePage.getByRole('alert')).toContainText('This check-in link isn’t connected')
    await expect(phonePage.getByRole('button', { name: 'Get my queue number' })).toBeHidden()
  } finally {
    await phone.close()
  }
  await page.goto('/?queue=invalid-token')
  await expect(page.getByRole('alert')).toContainText('This check-in link isn’t connected')
})


test('role sign-in forms validate and reject unknown credentials on desktop and mobile without retaining credentials', async ({ page }) => {
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
  const originalPatients = await page.evaluate(() => localStorage.getItem('northstar-demo-patients-v1'))
  for (const [role, heading, submitRole] of [
    ['Patient', 'Your care starts here.', 'Patient'],
    ['Attendant / Secretary', 'A smoother day starts here.', 'Attendant'],
    ['Doctor', 'Welcome back, doctor.', 'Doctor'],
  ]) {
    const roleButton = page.getByRole('button', { name: role, exact: true })
    await roleButton.click()
    await expect(roleButton).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    const email = page.getByLabel('Email address', { exact: true })
    const password = page.getByLabel('Password', { exact: true })
    await expect(email).toHaveValue('')
    await expect(password).toHaveValue('')
    await page.getByRole('button', { name: `Sign in as ${submitRole}` }).click()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    await email.fill('not-an-email')
    await password.fill('   ')
    await password.press('Enter')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    await email.fill('synthetic@example.test')
    await password.fill('Synthetic-only-password')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(password).toHaveAttribute('type', 'password')
    await password.press('Enter')
    await expect(page.getByRole('alert')).toContainText('These demo credentials do not match the selected role')
    await expect(password).toHaveValue('')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
    expect(await page.evaluate(() => {
      const browserWindow = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number }
      return browserWindow.document.documentElement.scrollWidth <= browserWindow.innerWidth
    })).toBe(true)
  }
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('status')).toContainText(/not|unavailable|connect/i)
  await page.getByRole('button', { name: 'Need access?' }).click()
  await expect(page.getByRole('status')).toContainText(/clinic|administrator/i)
  const storage = await page.evaluate(() => ({
    patients: localStorage.getItem('northstar-demo-patients-v1'),
    all: JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  }))
  expect(storage.patients).toBe(originalPatients)
  expect(storage.all).not.toContain('synthetic@example.test')
  expect(storage.all).not.toContain('Synthetic-only-password')
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await expect(page.getByRole('heading', { name: /Good morning, Maya/ })).toBeVisible()
  await page.getByRole('button', { name: 'Log in as' }).click()
  await expect(page.getByRole('button', { name: 'Explore demo workspace' })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
})


test('wide desktop sign-in keeps the form offset over the loaded hero without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await expect(page.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change cover' })).toBeVisible()
  const heroImage = page.locator('.login-hero-image')
  await expect.poll(() => heroImage.evaluate((image) => {
    const photo = image as unknown as { complete: boolean; naturalWidth: number }
    return photo.complete && photo.naturalWidth > 0
  })).toBe(true)
  const form = await page.locator('.login-form').boundingBox()
  const panel = await page.locator('.login-main').boundingBox()
  const hero = await heroImage.boundingBox()
  expect(form?.width).toBeGreaterThanOrEqual(360)
  expect(panel).not.toBeNull()
  expect(hero).not.toBeNull()
  expect(panel!.x).toBeGreaterThan(hero!.x + hero!.width / 2)
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(hero!.x + hero!.width + 1)
  expect(panel!.y).toBeGreaterThanOrEqual(hero!.y)
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(hero!.y + hero!.height + 1)
  expect(await page.evaluate(() => {
    const browserWindow = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number }
    return browserWindow.document.documentElement.scrollWidth <= browserWindow.innerWidth
  })).toBe(true)
})


test('cover changes are local previews that survive role and demo navigation, reject corrupt images and reset', async ({ page }) => {
  const hero = page.locator('.login-hero-image')
  await expect(hero).toHaveAttribute('src', '/images/clinic-hero.jpg')
  const originalStorage = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Change cover' }).click()
  await (await chooser).setFiles({
    name: 'synthetic-clinic-cover.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../public/images/clinic-hero.jpg', import.meta.url)),
  })
  await expect(page.getByRole('status')).toContainText('Cover updated')
  await expect(hero).toHaveAttribute('src', /^blob:/)
  const uploadedSource = await hero.getAttribute('src')
  await expect(page.getByRole('button', { name: 'Reset cover' })).toBeVisible()
  await page.getByRole('button', { name: 'Patient', exact: true }).click()
  await expect(hero).toHaveAttribute('src', uploadedSource!)
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await page.getByRole('button', { name: 'Log in as' }).click()
  await expect(hero).toHaveAttribute('src', uploadedSource!)
  await expect.poll(() => hero.evaluate((image) => {
    const photo = image as unknown as { complete: boolean; naturalWidth: number }
    return photo.complete && photo.naturalWidth > 0
  })).toBe(true)
  await page.getByLabel('Choose a cover image').setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('synthetic invalid image') })
  await expect(page.getByRole('alert')).toContainText(/image|read|load/i)
  await expect(hero).toHaveAttribute('src', uploadedSource!)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(originalStorage)
  await page.getByRole('button', { name: 'Reset cover' }).click()
  await expect(hero).toHaveAttribute('src', '/images/clinic-hero.jpg')
  await expect(page.getByRole('button', { name: 'Reset cover' })).toBeHidden()
  await page.getByLabel('Choose a cover image').setInputFiles('public/images/clinic-hero.jpg')
  await expect(hero).toHaveAttribute('src', /^blob:/)
  await page.reload()
  await expect(hero).toHaveAttribute('src', '/images/clinic-hero.jpg')
  await expect(page.getByRole('button', { name: 'Reset cover' })).toBeHidden()
})


test('all three published demo accounts open distinct role routes and login clears the session', async ({ page }) => {
  const accounts = [
    { role: 'Patient', label: 'Patient', email: 'patient@northstar.demo', password: 'PatientDemo123!', path: '/demo/patient', heading: 'Welcome, Sofia.' },
    { role: 'Attendant', label: 'Attendant / Secretary', email: 'secretary@northstar.demo', password: 'StaffDemo123!', path: '/demo/attendant', heading: 'Reception workspace' },
    { role: 'Doctor', label: 'Doctor', email: 'doctor@northstar.demo', password: 'DoctorDemo123!', path: '/demo/doctor', heading: /Good morning, Maya/ },
  ]
  await expect(page).toHaveURL(/\/login$/)
  const originalPatients = await page.evaluate(() => localStorage.getItem('northstar-demo-patients-v1'))
  for (const account of accounts) {
    await page.getByRole('button', { name: account.label, exact: true }).click()
    await page.getByText('Demo credentials', { exact: true }).click()
    await expect(page.getByText(account.email, { exact: true })).toBeVisible()
    await expect(page.getByText(account.password, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Use demo credentials' }).click()
    await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(account.email)
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue(account.password)
    await expect(page).toHaveURL(/\/login$/)
    await page.getByRole('button', { name: `Sign in as ${account.role}` }).click()
    await expect(page).toHaveURL(new RegExp(`${account.path}$`))
    await expect(page.getByRole('heading', { name: account.heading })).toBeVisible()
    if (account.role === 'Patient') {
      await expect(page.getByRole('button', { name: 'Open patient check-in' })).toBeDisabled()
      await expect(page.getByRole('button', { name: /New walk-in|Book appointment|Record triage|Clinical notes|Prescriptions/ })).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: 'Search patients' })).toHaveCount(0)
    }
    if (account.role === 'Attendant') {
      await expect(page.getByRole('button', { name: 'New walk-in', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Book appointment', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: /Clinical notes|Prescriptions|Start consultation|Generate today’s QR|View history/ })).toHaveCount(0)
    }
    const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
    expect(persisted).not.toContain(account.email)
    expect(persisted).not.toContain(account.password)
    expect(await page.evaluate(() => localStorage.getItem('northstar-demo-patients-v1'))).toBe(originalPatients)
    await page.getByRole('button', { name: 'Log in as' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeVisible()
  }
})


test('direct role URLs and reloads require fresh demo login and a role URL cannot impersonate another actor', async ({ page }) => {
  for (const route of ['/demo/patient', '/demo/attendant', '/demo/doctor']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Welcome back, doctor.' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
  }
  await page.getByRole('button', { name: 'Patient', exact: true }).click()
  await page.getByLabel('Email address', { exact: true }).fill('doctor@northstar.demo')
  await page.getByLabel('Password', { exact: true }).fill('DoctorDemo123!')
  await page.getByRole('button', { name: 'Sign in as Patient' }).click()
  await expect(page.getByRole('alert')).toContainText('These demo credentials do not match the selected role.')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email address', { exact: true }).fill('patient@northstar.demo')
  await page.getByLabel('Password', { exact: true }).fill('PatientDemo123!')
  await page.getByRole('button', { name: 'Sign in as Patient' }).click()
  await expect(page).toHaveURL(/\/demo\/patient$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Sofia.' })).toBeVisible()
  await page.evaluate(() => {
    const browser = globalThis as unknown as {
      history: { pushState: (data: unknown, unused: string, url: string) => void }
      dispatchEvent: (event: unknown) => boolean
      PopStateEvent: new (type: string) => unknown
    }
    browser.history.pushState({}, '', '/demo/doctor')
    browser.dispatchEvent(new browser.PopStateEvent('popstate'))
  })
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await expect(page).toHaveURL(/\/demo\/doctor$/)
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
})
