/**
 * Post-build helper:
 * 1. Copies Next.js static assets and public/ into the standalone server directory
 * 2. Resolves all symlinks inside .next/standalone so electron-builder can
 *    package them correctly (it fails on dangling/relative symlinks)
 *
 * Run after `next build` and before `electron-builder`.
 */

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const standalone = path.join(root, '.next', 'standalone')

if (!fs.existsSync(standalone)) {
  console.error('ERROR: .next/standalone not found. Run `npm run build` first.')
  process.exit(1)
}

// .next/static → .next/standalone/.next/static
const staticSrc = path.join(root, '.next', 'static')
const staticDest = path.join(standalone, '.next', 'static')
if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true })
  console.log('✓ Copied .next/static')
}

// public → .next/standalone/public
const publicSrc = path.join(root, 'public')
const publicDest = path.join(standalone, 'public')
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true })
  console.log('✓ Copied public/')
}

// Resolve symlinks: electron-builder cannot stat targets of relative symlinks.
// Walk the entire standalone tree and replace every symlink with a real copy.
function resolveSymlinks(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const target = fs.realpathSync(fullPath)
      fs.unlinkSync(fullPath)
      if (fs.statSync(target).isDirectory()) {
        fs.cpSync(target, fullPath, { recursive: true })
      } else {
        fs.copyFileSync(target, fullPath)
      }
      console.log(`  resolved symlink: ${path.relative(standalone, fullPath)}`)
    } else if (entry.isDirectory()) {
      resolveSymlinks(fullPath)
    }
  }
}

console.log('Resolving symlinks in standalone directory...')
resolveSymlinks(standalone)
console.log('✓ All symlinks resolved')

console.log('\nDone – standalone directory is ready for electron-builder.')
