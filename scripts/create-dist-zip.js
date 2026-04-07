/**
 * Creates the distribution ZIP for sharing with friends/family.
 *
 * Contents:
 *   BudgetApp/
 *     BudgetApp.app          — the app (quarantine already stripped)
 *     BudgetApp installieren.command  — double-click installer
 *     LIES MICH.txt          — instructions
 *
 * Run after electron-builder: node scripts/create-dist-zip.js
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const distDir = path.join(root, 'dist')
const appPath = path.join(distDir, 'mac', 'BudgetApp.app')
const assetsDir = path.join(root, 'electron', 'dist-assets')
const stagingDir = path.join(distDir, 'BudgetApp')
const zipPath = path.join(distDir, 'BudgetApp.zip')

if (!fs.existsSync(appPath)) {
  console.error('ERROR: dist/mac/BudgetApp.app not found. Run electron:build first.')
  process.exit(1)
}

// Clean up previous staging/zip
if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true })
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)

// Create staging directory
fs.mkdirSync(stagingDir, { recursive: true })

// Copy app bundle
console.log('Copying BudgetApp.app...')
execSync(`cp -R "${appPath}" "${stagingDir}/BudgetApp.app"`)

// Strip quarantine from the copy
console.log('Stripping quarantine...')
execSync(`xattr -cr "${stagingDir}/BudgetApp.app"`)

// Copy install script and readme
for (const file of fs.readdirSync(assetsDir)) {
  const src = path.join(assetsDir, file)
  const dest = path.join(stagingDir, file)
  fs.copyFileSync(src, dest)
  // Preserve executable bit on .command files
  if (file.endsWith('.command')) {
    fs.chmodSync(dest, 0o755)
  }
}

// Create ZIP (use ditto to preserve macOS attributes and permissions)
console.log('Creating ZIP...')
execSync(`cd "${distDir}" && ditto -c -k --sequesterRsrc --keepParent BudgetApp "${path.basename(zipPath)}"`)

// Clean up staging directory
fs.rmSync(stagingDir, { recursive: true })

const zipSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)
console.log(`\n✓ Distribution ZIP created: dist/BudgetApp.zip (${zipSize} MB)`)
console.log('  → Diese Datei an Freunde/Familie verschicken!')
