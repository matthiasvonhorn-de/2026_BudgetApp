/**
 * Validate a regex pattern for safety before storing it.
 * Rejects patterns that are syntactically invalid or likely to cause
 * catastrophic backtracking (ReDoS).
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
  // Check syntax
  try {
    new RegExp(pattern, 'i')
  } catch {
    return { valid: false, error: 'Ungültiges Regex-Pattern' }
  }

  // Reject patterns with nested quantifiers (common ReDoS source)
  // e.g. (a+)+, (a*)*,  (a+)*,  (a{2,})+
  if (/(\([^)]*[+*][^)]*\))[+*{]/.test(pattern)) {
    return { valid: false, error: 'Verschachtelte Quantoren (z.B. (a+)+) sind nicht erlaubt' }
  }

  // Reject excessively long patterns
  if (pattern.length > 500) {
    return { valid: false, error: 'Regex-Pattern darf maximal 500 Zeichen lang sein' }
  }

  return { valid: true }
}
