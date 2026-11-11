import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = fileURLToPath(new URL('../', import.meta.url))
export async function createHarness() {
  const require = createRequire(process.env.HMP_NODE_MODULES
    ? resolve(process.env.HMP_NODE_MODULES, '__hmp_resolver.cjs') : import.meta.url)
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: true, ...(process.env.HMP_BROWSER ? { executablePath: process.env.HMP_BROWSER } : {}) })
  // Routes below fulfill every request in memory. Tests need no network/server.
  return { browser, url: 'https://hermes-print.test', async close() { await browser.close() } }
}

export function documentPane({ title = 'Document A', body = '<p>First paragraph.</p>', id = 'a', hidden = false, truncated = false, toolbar = true } = {}) {
  return `<div data-pane-host="${id}" ${hidden ? 'aria-hidden="true" inert style="display:none"' : ''} class="pane"><div class="file-view">${truncated ? '<div class="warning">Preview truncated</div>' : ''}${toolbar ? '<div class="mode-switcher"><button class="active">Preview</button><button>Source</button><div><button>Edit</button></div></div>' : ''}<div class="scroller"><div data-preview-markdown><h1>${title}</h1>${body}</div></div></div></div>`
}

export const SAMPLE_IMAGE = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="100" viewBox="0 0 480 100"><rect x="2" y="2" width="476" height="96" rx="8" fill="#eef4fa" stroke="#557799"/><text x="28" y="57" font-size="24" fill="#163b70">Rendered diagram: Start → Finish</text></svg>')

export function longDocument() {
  const table = `<table><thead><tr><th>Genre</th><th>Sample size</th><th>Success share</th><th>Details</th></tr></thead><tbody>${Array.from({length: 34}, (_, i) => `<tr><td>Genre ${i + 1}</td><td>${310 + i}</td><td>${18 + i}%</td><td>Measured across titles; row ${i + 1}.</td></tr>`).join('')}</tbody></table>`
  const math = '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">DUPLICATE-MATH-MUST-NOT-PRINT</span></span>'
  return documentPane({ title: 'Markdown Print Validation', body: `<p>This report validates complete, selectable PDF output. <strong>Bold text</strong>, <em>italic text</em>, and <a href="https://example.com/report">a citation link</a> remain readable.</p><h2>Distribution across titles</h2><p>Tables must fit the page and repeat their headings across page breaks.</p>${table}<h2>Code and long links</h2><pre><code>${'const measurement = "' + 'long_value_'.repeat(26) + '";'}\nconsole.log(measurement);</code></pre><p>https://example.com/${'segment/'.repeat(35)}</p><h2>Images and equations</h2><img alt="Flow diagram" src="${SAMPLE_IMAGE}">${math}<blockquote>Each sample receives equal weight. The light layout is independent of the application theme.</blockquote><ul><li>First observation</li><li>Second observation</li></ul>${Array.from({length: 14}, (_, i) => `<h2>Finding ${i + 1}</h2><p>${('This paragraph checks pagination, margins, and the preservation of text across multiple pages. ').repeat(5)}</p>`).join('')}<h2>Final result</h2><p>FINAL-PARAGRAPH-REACHED: Every section of the report is present.</p>` })
}

export async function loadFixture(page, url, html = documentPane(), { dark = false, assetTimeout = 1000 } = {}) {
  const source = (await readFile(resolve(packageRoot, 'plugin.js'), 'utf8')).replace("'@hermes/plugin-sdk'", "'/sdk.js'")
  await page.route('**/*', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/plugin.js') return route.fulfill({contentType:'text/javascript',body:source})
    if (pathname === '/sdk.js') return route.fulfill({contentType:'text/javascript',body:"export const PALETTE_AREA='palette'; export const host={notify:value=>window.hmpNotifications.push(value)};"})
    return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Hermes test window</title><body></body>'})
  })
  await page.goto(url)
  await page.evaluate(({ html, dark }) => {
    document.documentElement.className = dark ? 'dark' : ''
    document.head.insertAdjacentHTML('beforeend', `<style>body{margin:0;font:14px Arial;background:${dark ? '#10151a' : '#fafafa'};color:${dark ? '#eee' : '#222'}}#app{display:flex;gap:12px;height:650px}.chat{width:220px}.pane{width:640px;height:650px}.file-view{height:100%;display:flex;flex-direction:column}.mode-switcher{display:flex;justify-content:flex-end;align-items:center;gap:12px;height:28px}.scroller{flex:1;overflow:auto;min-height:0}[data-preview-markdown]{padding:16px}pre{overflow:hidden;background:#141414;color:white}table{min-width:600px}img{max-width:100%}.katex-mathml{position:absolute;clip:rect(1px,1px,1px,1px);width:1px;height:1px;overflow:hidden}</style>`)
    document.body.innerHTML = `<main id="app"><aside class="chat">PRIVATE-CHAT-MUST-NOT-PRINT</aside>${html}</main>`
    window.hmpNotifications = []
    window.hmpWrites = []
    window.hmpOpens = []
    window.hmpFolders = [{ id: 'folder-1', path: 'C:\\Exports', name: 'Exports' }]
    window.hmpFolderPick = { ok: true, folder: window.hmpFolders[0] }
    window.hmpPickCount = 0
    window.hmpStorage = new Map()
    window.hmpContributions = new Map()
    window.hmpDisposers = []
    window.hmpPrintCalls = []
    window.hmpPrintMode = 'normal'
    window.hmpNativeAction = null
    window.print = () => {
      if (window.hmpPrintMode === 'throw') throw new Error('No printer service')
      if (window.hmpPrintMode === 'noop') return
      window.dispatchEvent(new Event('beforeprint'))
      window.hmpPrintCalls.push({ title: document.title, text: document.getElementById('hermes-markdown-print-document')?.textContent, roots: document.querySelectorAll('#hermes-markdown-print-document').length, appDisplay: getComputedStyle(document.getElementById('app')).display })
      window.hmpNativeAction?.()
      window.dispatchEvent(new Event('afterprint'))
    }
    window.hmpCtx = {
      register(c) { window.hmpContributions.set(c.id, c); return () => window.hmpContributions.delete(c.id) },
      onDispose(fn) { window.hmpDisposers.push(fn) },
      storage: { get: (key, fallback) => window.hmpStorage.has(key) ? window.hmpStorage.get(key) : fallback, set: (key, value) => window.hmpStorage.set(key, value), remove: key => window.hmpStorage.delete(key) },
      files: {
        folders: async () => window.hmpFolders,
        requestFolder: async () => { window.hmpPickCount++; return window.hmpFolderPick },
        writeText: async (...args) => { window.hmpWrites.push(args); return window.hmpWriteResult || { ok: true, path: args[1], size: args[2].length } }
      },
      os: { openExternal: async path => { window.hmpOpens.push(path); return window.hmpOpenResult !== false } }
    }
  }, { html, dark })
  await page.evaluate(async assetTimeout => {
    window.hmpHelpers = await import('/plugin.js')
    window.hmpController = window.hmpHelpers.createPluginController(window.hmpCtx, { assetTimeout })
  }, assetTimeout)
}
