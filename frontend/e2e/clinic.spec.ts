import { test as base, expect, type Page } from '@playwright/test'

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
  await openChart(page, 'Jamie Demo')
  await page.locator('.chart-tabs').getByRole('button', { name: /^Medical history/ }).click()
  await expect(page.getByText('Synthetic interview note for regression testing.', { exact: true })).toBeVisible()
  await page.locator('.chart-tabs').getByRole('button', { name: /^Prescriptions/ }).click()
  await expect(page.locator('.prescription-list')).toContainText('Demo medication')
  await navigate(page, /^Appointments$/)
  await expect(page.locator('.upcoming-list')).toContainText('Demo follow-up')
})

test('chart scheduling selects its patient and conflicting appointments cannot be saved', async ({ page }) => {
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
