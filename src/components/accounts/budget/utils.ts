export function amountColor(v: number) {
  return v < 0 ? 'text-destructive' : v > 0 ? 'text-emerald-600' : 'text-muted-foreground'
}
