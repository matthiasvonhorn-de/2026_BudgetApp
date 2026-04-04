# Savings Upfront Fee (Abschlussgebühr)

## Summary
Add an upfront fee field to savings plans (Sparplan/Festgeld). The fee is deducted from the starting balance, making it negative. Contributions offset the negative balance first. Interest is only calculated when balance > 0.

## Schema
- `SavingsConfig.upfrontFee Float @default(0)` — single upfront fee
- `SavingsEntryType.FEE` — new enum value for the fee row in the schedule

## Schedule Logic
1. Effective starting balance = `initialBalance - upfrontFee`
2. If `upfrontFee > 0`, emit a FEE entry as the first row (negative amount)
3. Interest is only calculated when `balance > 0` (skip zero-interest rows)
4. Contributions always accrue regardless of balance sign

## UI
- Create dialog: "Abschlussgebühr" input below Startkapital
- Edit page: editable, triggers schedule rebuild on change
- Detail page: FEE row in red, fee shown in header subtitle

## Constraints
- Single upfront fee only (no recurring fees)
- Fee change on edit rebuilds all unpaid entries
- FEE entry is auto-paid at creation time
