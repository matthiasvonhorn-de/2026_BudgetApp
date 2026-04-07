/**
 * Generates the BudgetApp icon as a 1024x1024 PNG from an inline SVG.
 * Run once: node scripts/generate-icon.js
 * Requires: sharp (npm install -D sharp)
 */

const sharp = require('sharp')
const path = require('path')

const SIZE = 1024

// Simple budget/wallet icon: rounded purple square with a white Euro coin
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${SIZE}" height="${SIZE}" rx="220" fill="url(#bg)"/>
  <!-- Wallet body -->
  <rect x="160" y="320" width="704" height="404" rx="48" fill="white" fill-opacity="0.95"/>
  <!-- Wallet flap -->
  <path d="M160 420 Q160 320 260 320 H804 Q864 320 864 380 V420 H160Z" fill="white"/>
  <!-- Clasp area -->
  <rect x="580" y="450" width="200" height="130" rx="28" fill="#6366f1" fill-opacity="0.15"/>
  <!-- Clasp circle -->
  <circle cx="680" cy="515" r="28" fill="#6366f1"/>
  <!-- Euro symbol on clasp -->
  <text x="680" y="528" text-anchor="middle" font-size="36" font-weight="700" font-family="system-ui, -apple-system, sans-serif" fill="white">€</text>
</svg>
`

async function main() {
  const outPath = path.join(__dirname, '..', 'electron', 'icon.png')
  await sharp(Buffer.from(svg)).png().toFile(outPath)
  console.log(`✓ Icon generated: ${outPath} (${SIZE}x${SIZE})`)
}

main().catch((err) => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})
