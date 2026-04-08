import { roundCents } from '@/lib/money'

/** Threshold below which a loan balance is considered fully repaid (handles floating-point rounding) */
const BALANCE_EPSILON = 0.005

export interface LoanParams {
  loanType: 'ANNUITAETENDARLEHEN' | 'RATENKREDIT'
  principal: number
  interestRate: number          // p.a. als Dezimal, z.B. 0.035
  initialRepaymentRate: number  // p.a. als Dezimal (Anfangstilgungssatz, nur Annuitätendarlehen)
  termMonths: number
  startDate: Date
  monthlyPayment: number        // gespeicherte Monatsrate (Fallback)
}

export interface AmortizationRow {
  periodNumber: number
  dueDate: Date
  scheduledPrincipal: number
  scheduledInterest: number
  scheduledBalance: number   // Saldo NACH dieser Zahlung
}

/** Berechnet die monatliche Rate eines Annuitätendarlehens aus Zins + Tilgungssatz */
export function calcAnnuityFromRates(principal: number, interestRate: number, repaymentRate: number): number {
  return principal * (interestRate + repaymentRate) / 12
}

/** Berechnet den Tilgungsplan ab einem bestimmten Restschuld-Stand.
 *  Annuitätendarlehen: läuft genau termMonths Perioden, Restschuld am Ende möglich.
 *  Ratenkredit: feste Tilgung, endet wenn Saldo = 0. */
export function generateSchedule(
  params: LoanParams,
  fromBalance: number,
  fromPeriod: number,
  maxPeriods?: number,
): AmortizationRow[] {
  const r = params.interestRate / 12
  const fixedPrincipal = params.principal / params.termMonths  // nur für Ratenkredit

  // Monatliche Rate ermitteln
  let annuity: number
  if (params.loanType === 'ANNUITAETENDARLEHEN') {
    annuity = params.initialRepaymentRate > 0
      ? calcAnnuityFromRates(params.principal, params.interestRate, params.initialRepaymentRate)
      : params.monthlyPayment
  } else {
    annuity = 0  // wird bei Ratenkredit nicht genutzt
  }

  const limit = maxPeriods ?? params.termMonths
  const rows: AmortizationRow[] = []
  let balance = fromBalance

  for (let i = 0; i < limit; i++) {
    if (params.loanType === 'RATENKREDIT' && balance <= BALANCE_EPSILON) break

    const period = fromPeriod + i
    const interest = balance * r
    let principal: number

    if (params.loanType === 'ANNUITAETENDARLEHEN') {
      // Letzter Monat oder frühere Vollrückzahlung durch Sondertilgung
      if (balance <= BALANCE_EPSILON) break
      principal = Math.min(annuity - interest, balance)
    } else {
      principal = Math.min(fixedPrincipal, balance)
    }

    const newBalance = Math.max(0, balance - principal)
    const dueDate = new Date(params.startDate)
    dueDate.setMonth(dueDate.getMonth() + period - 1)

    rows.push({
      periodNumber: period,
      dueDate,
      scheduledPrincipal: round2(principal),
      scheduledInterest: round2(interest),
      scheduledBalance: round2(newBalance),
    })

    balance = newBalance
  }

  return rows
}

const round2 = roundCents
