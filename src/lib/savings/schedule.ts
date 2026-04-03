export type SavingsFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
export type SavingsEntryType = 'CONTRIBUTION' | 'INTEREST'

export interface SavingsScheduleParams {
  savingsType: 'SPARPLAN' | 'FESTGELD'
  initialBalance: number
  contributionAmount: number
  contributionFrequency: SavingsFrequency | null
  interestRate: number          // p.a. als Dezimal
  interestFrequency: SavingsFrequency
  startDate: Date
  termMonths: number            // required – caller must compute the right value
}

export interface SavingsScheduleRow {
  entryType: SavingsEntryType
  periodNumber: number
  dueDate: Date
  scheduledAmount: number
  scheduledBalance: number
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function periodsPerYear(freq: SavingsFrequency): number {
  return freq === 'MONTHLY' ? 12 : freq === 'QUARTERLY' ? 4 : 1
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`
}

export function generateSavingsSchedule(params: SavingsScheduleParams): SavingsScheduleRow[] {
  const {
    savingsType,
    initialBalance,
    contributionAmount,
    contributionFrequency,
    interestRate,
    interestFrequency,
    startDate,
    termMonths,
  } = params

  const interestPeriodMonths = 12 / periodsPerYear(interestFrequency)
  const contribPeriodMonths = contributionFrequency
    ? 12 / periodsPerYear(contributionFrequency)
    : null

  type ScheduledEvent = { date: Date; type: SavingsEntryType }
  const events: ScheduledEvent[] = []

  for (let m = 0; m < termMonths; m += interestPeriodMonths) {
    events.push({ date: addMonths(startDate, m), type: 'INTEREST' })
  }

  if (savingsType === 'SPARPLAN' && contribPeriodMonths !== null) {
    for (let m = 0; m < termMonths; m += contribPeriodMonths) {
      events.push({ date: addMonths(startDate, m), type: 'CONTRIBUTION' })
    }
  }

  events.sort((a, b) => {
    const diff = a.date.getTime() - b.date.getTime()
    if (diff !== 0) return diff
    return a.type === 'INTEREST' ? -1 : 1
  })

  const rows: SavingsScheduleRow[] = []
  let balance = initialBalance
  const interestPeriodRate = interestRate / periodsPerYear(interestFrequency)
  const counters: Record<SavingsEntryType, number> = { INTEREST: 0, CONTRIBUTION: 0 }
  const seen = new Set<string>()

  for (const event of events) {
    const key = `${toMonthKey(event.date)}-${event.type}`
    if (seen.has(key)) continue
    seen.add(key)

    counters[event.type]++
    const amount = event.type === 'INTEREST'
      ? Math.round(balance * interestPeriodRate * 100) / 100
      : contributionAmount

    balance = Math.round((balance + amount) * 100) / 100

    rows.push({
      entryType: event.type,
      periodNumber: counters[event.type],
      dueDate: event.date,
      scheduledAmount: amount,
      scheduledBalance: balance,
    })
  }

  return rows
}
