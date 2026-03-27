/**
 * electron-builder afterPack hook:
 * Manually copies the Next.js standalone server into the packaged app's
 * Resources/server directory, including node_modules.
 *
 * electron-builder's extraResources does not reliably copy node_modules
 * when the source directory contains a package.json (it treats it as an
 * app package and extracts/moves node_modules to the asar instead).
 * This hook sidesteps that by copying AFTER packing is done.
 */

const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context

  // Resolve paths
  const resourcesDir = packager.getResourcesDir(appOutDir)
  const projectRoot = path.join(__dirname, '..')
  const standaloneDir = path.join(projectRoot, '.next', 'standalone')

  // Destination: Resources/server
  const serverDest = path.join(resourcesDir, 'server')

  if (!fs.existsSync(standaloneDir)) {
    throw new Error(`Standalone directory not found: ${standaloneDir}\nRun: npm run build first.`)
  }

  // Wipe whatever electron-builder put there (incomplete copy without node_modules)
  if (fs.existsSync(serverDest)) {
    fs.rmSync(serverDest, { recursive: true, force: true })
  }

  console.log(`afterPack: Copying standalone server → ${serverDest}`)
  fs.cpSync(standaloneDir, serverDest, { recursive: true })
  console.log(`afterPack: Done (${Math.round(getDirSize(serverDest) / 1024 / 1024)}MB)`)
}

function getDirSize(dir) {
  let size = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) size += getDirSize(full)
    else size += fs.statSync(full).size
  }
  return size
}
