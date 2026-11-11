import { host, PALETTE_AREA } from '@hermes/plugin-sdk'

// A disk plugin: no imports of Hermes internals, native bridge calls, or backend.
export const ID = 'hermes-markdown-print'
export const VERSION = '1.0.1'
const DOCUMENT = '[data-preview-markdown]'
const OWNED = 'data-hmp-owned'
const ROOT_ID = 'hermes-markdown-print-document'
const ACTIVE = 'data-hmp-printing'
const MAX_EXPORT_BYTES = 4 * 1024 * 1024
const ASSET_TIMEOUT = 15000
const PALETTE_TIMEOUT = 2000

export const PRINT_CSS = `
@page { size: auto; margin: 15mm; }
.hmp-document { color-scheme: light; color: #171717; background: #fff; font: 11pt/1.5 Arial, "Segoe UI", sans-serif; text-align: left; overflow-wrap: anywhere; }
.hmp-document, .hmp-document * { box-sizing: border-box; }
.hmp-document :where(div, section, article) { max-height: none; height: auto; min-width: 0; overflow: visible; }
.hmp-document h1 { font-size: 22pt; line-height: 1.2; margin: 0 0 6mm; }
.hmp-document h2 { font-size: 17pt; line-height: 1.25; margin: 7mm 0 3mm; }
.hmp-document h3 { font-size: 13pt; margin: 5mm 0 2mm; }
.hmp-document :is(h1,h2,h3,h4,h5,h6) { color: #111; font-weight: 700; break-after: avoid; page-break-after: avoid; }
.hmp-document :is(strong,b) { font-weight: 700; } .hmp-document :is(em,i) { font-style: italic; }
.hmp-document p { margin: 0 0 3.5mm; orphans: 3; widows: 3; }
.hmp-document :is(ul,ol) { margin: 0 0 4mm; padding-left: 7mm; }
.hmp-document ul { list-style: disc outside; } .hmp-document ol { list-style: decimal outside; }
.hmp-document li { margin: 1mm 0; }
.hmp-document blockquote { margin: 4mm 0; padding-left: 4mm; border-left: 0.7mm solid #aaa; color: #444; }
.hmp-document a { color: #163b70; text-decoration: underline; overflow-wrap: anywhere; }
.hmp-document hr { border: 0; border-top: 0.3mm solid #bbb; margin: 5mm 0; }
.hmp-document :is(pre,code) { font-family: Consolas, "Courier New", monospace; font-size: 9pt; color: #222; background: #f5f5f5; }
.hmp-document pre { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; margin: 3mm 0; padding: 3mm; border: 0.25mm solid #ddd; border-radius: 1mm; }
.hmp-document pre code { white-space: inherit; padding: 0; }
.hmp-document pre :is(span,code) { color: #222 !important; background: transparent !important; }
.hmp-document table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; margin: 4mm 0; font-size: 9.5pt; }
.hmp-document :is(th,td) { border: 0.25mm solid #bcbcbc; padding: 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.hmp-document th { font-weight: bold; background: #eee; }
.hmp-document thead { display: table-header-group; } .hmp-document tfoot { display: table-footer-group; }
.hmp-document tr { break-inside: avoid; page-break-inside: avoid; }
.hmp-document :is(img,svg) { max-width: 100%; height: auto; max-height: 240mm; object-fit: contain; break-inside: avoid; }
.hmp-document img { display: block; margin: 3mm 0; }
.hmp-document math { font-size: 1em; } .hmp-document math[display="block"] { margin: 4mm 0; overflow-wrap: normal; }
.hmp-document .hmp-omitted { padding: 2mm; border: 0.25mm solid #bbb; color: #555; font-style: italic; }
@media print {
  html { height: auto !important; overflow: visible !important; color-scheme: light !important; background: white !important; }
  body[${ACTIVE}] { display: block !important; position: static !important; height: auto !important; min-height: 0 !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: white !important; transform: none !important; zoom: 1 !important; }
  body[${ACTIVE}] > :not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} { display: block !important; position: static !important; width: auto !important; max-width: none !important; height: auto !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; visibility: visible !important; }
  .hmp-browser-controls { display: none !important; }
}
`

const UI_CSS = `
button.hmp-print-button { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; padding: 0; white-space: nowrap; }
button.hmp-print-button:hover { text-decoration: underline; text-underline-offset: 3px; }
button.hmp-print-button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
button.hmp-print-button:disabled { opacity: .5; cursor: wait; }
#${ROOT_ID} { display: none; }
`

export function isVisible(element) {
  if (!element?.isConnected || !element.getClientRects().length) return false
  const win = element.ownerDocument.defaultView
  for (let node = element; node instanceof win.Element; node = node.parentElement) {
    if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false
    const css = win.getComputedStyle(node)
    if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse') return false
  }
  return true
}

// The only dependency on the viewer's undocumented toolbar structure.
// PreviewModeSwitcher is immediately before the scrolling Markdown body.
export function viewerAdapter(root) {
  const scroller = root?.parentElement
  const view = scroller?.parentElement
  const candidate = scroller?.previousElementSibling
  const buttons = candidate ? [...candidate.children].filter(n => n.tagName === 'BUTTON' && !n.hasAttribute(OWNED)) : []
  const toolbar = candidate?.tagName === 'DIV' && buttons.length >= 2 && !candidate.querySelector(DOCUMENT)
    ? candidate : null
  const explicitTruncation = Boolean(root?.closest('[data-truncated="true"]'))
  // Hermes puts its truncation banner before the mode switcher, outside the
  // document. Refuse an unknown nonempty banner too: do not print partial text.
  const banner = toolbar && [...view.children].slice(0, [...view.children].indexOf(toolbar))
    .some(n => !n.hasAttribute(OWNED) && n.textContent.trim() && isVisible(n))
  return { toolbar, view, truncated: Boolean(explicitTruncation || banner) }
}

export function chooseDocument(doc, lastFocused) {
  const roots = [...doc.querySelectorAll(DOCUMENT)].filter(isVisible)
  if (lastFocused && roots.includes(lastFocused)) return lastFocused
  if (roots.length === 1) return roots[0]
  throw new Error(roots.length
    ? 'Click inside the Markdown document you want to print, then try again.'
    : 'Open the Markdown file in Preview mode before printing.')
}

function waitForPaletteDismissal(doc, signal) {
  checkAbort(signal)
  const commandSelector = '[data-slot="command"], [cmdk-root]'
  const focusedDialog = doc.activeElement?.closest('[role="dialog"]')
  const palette = focusedDialog?.querySelector(commandSelector) ? focusedDialog
    : [...doc.querySelectorAll('[role="dialog"]')].find(node => node.querySelector(commandSelector) && isVisible(node))
  if (!palette) return Promise.resolve()
  const win = doc.defaultView
  return new Promise((resolve, reject) => {
    let timer
    let settled = false
    const finish = error => {
      if (settled) return
      settled = true
      observer.disconnect()
      win.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(abortError())
    const check = () => {
      if (isVisible(palette)) return
      const roots = [...doc.querySelectorAll(DOCUMENT)]
      // Radix may release the background's aria-hidden/inert attributes after
      // removing the dialog. Keep the normal hidden-tab checks while waiting.
      if (!roots.length || roots.some(isVisible)) finish()
    }
    const observer = new win.MutationObserver(check)
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style','hidden','inert','aria-hidden','data-state'] })
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = win.setTimeout(() => finish(isVisible(palette)
      ? new Error('The command palette did not close. Close it and try printing again.') : undefined), PALETTE_TIMEOUT)
    if (signal?.aborted) onAbort()
    else check()
  })
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const unique = items => [...new Set(items)]
const message = error => error instanceof Error ? error.message : String(error)

function safeURL(value, kind, base) {
  if (!value) return ''
  if (kind === 'link' && value.startsWith('#') && !value.startsWith('#preview/')) return value
  if (value.startsWith('#preview/')) return '' // Hermes-only navigation, not an exported link.
  try {
    const url = new URL(value, base)
    const allowed = kind === 'image' ? ['https:', 'http:', 'file:', 'blob:', 'data:'] : ['https:', 'http:', 'mailto:']
    if (!allowed.includes(url.protocol)) return ''
    if (url.username || url.password) return ''
    if (url.protocol === 'data:' && !/^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)(;|,)/i.test(value)) return ''
    return url.href
  } catch { return '' }
}

export function captureSnapshot(root) {
  if (!isVisible(root)) throw new Error('That document is no longer visible. Open its Preview and try again.')
  if (viewerAdapter(root).truncated) throw new Error('Hermes is showing a partial preview or a preview warning. Load the complete document before printing.')
  const doc = root.ownerDocument
  const content = root.cloneNode(true)
  const warnings = []
  const sourceImages = [...root.querySelectorAll('img')]
  const clonedImages = [...content.querySelectorAll('img')]
  clonedImages.forEach((img, i) => {
    const source = sourceImages[i]
    // currentSrc can still refer to the PREVIOUS file while a plain img's src
    // is changing. Use it only when responsive source selection is involved.
    const chosen = source.hasAttribute('srcset') || source.closest('picture')
      ? source.currentSrc || source.src : source.getAttribute('src')
    const url = safeURL(chosen, 'image', doc.baseURI)
    if (!url) throw new Error(`An image cannot be printed: ${source.alt || 'unsupported image address'}.`)
    img.setAttribute('src', url)
    img.removeAttribute('srcset')
    img.removeAttribute('sizes')
    img.loading = 'eager'
  })
  // Chromium supports MathML. Keep KaTeX's semantic math, avoiding its hidden
  // duplicate plus dependencies on app-local KaTeX font/CSS files in exports.
  content.querySelectorAll('.katex').forEach(katex => {
    const math = katex.querySelector('math')
    if (math) katex.replaceWith(math.cloneNode(true))
  })
  content.querySelectorAll('iframe,video,audio,object,embed,canvas').forEach(node => {
    const note = doc.createElement('p')
    note.className = 'hmp-omitted'
    note.textContent = `[Embedded ${node.tagName.toLowerCase()} is not included in this print copy.]`
    node.replaceWith(note)
    warnings.push('Interactive or embedded media was replaced with a labeled placeholder.')
  })
  content.querySelectorAll('script,style,link,meta,base,button,input,select,textarea,form,noscript,[data-hmp-owned]').forEach(n => n.remove())
  // Copy presentation attributes only. Never carry event handlers, arbitrary
  // CSS/URLs, or active document elements from a preview into a standalone file.
  const htmlTags = new Set('DIV SPAN P H1 H2 H3 H4 H5 H6 UL OL LI DL DT DD BLOCKQUOTE PRE CODE TABLE THEAD TBODY TFOOT TR TH TD CAPTION COLGROUP COL A IMG HR BR STRONG B EM I S DEL U SUP SUB SMALL MARK SECTION ARTICLE FIGURE FIGCAPTION DETAILS SUMMARY'.split(' '))
  const htmlAttrs = new Set(['id', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'value', 'reversed', 'scope', 'dir', 'lang', 'open'])
  const svgAttrs = new Set(['id','viewbox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','opacity','fill-opacity','stroke-opacity','transform','preserveaspectratio','text-anchor','dominant-baseline','font-size','font-family','font-weight','offset','stop-color','stop-opacity','clip-path','mask','marker-start','marker-end','refx','refy','markerwidth','markerheight','orient','gradientunits','gradienttransform','xmlns'])
  const svgTags = new Set('svg g path rect circle ellipse line polyline polygon text tspan defs linearGradient radialGradient stop clipPath mask marker title desc'.toLowerCase().split(' '))
  for (const node of [...content.querySelectorAll('*')]) {
    const isSvg = node.namespaceURI === 'http://www.w3.org/2000/svg'
    const isMath = node.namespaceURI === 'http://www.w3.org/1998/Math/MathML'
    if ((isSvg && !svgTags.has(node.localName.toLowerCase())) || (isMath && /^(annotation|annotation-xml)$/i.test(node.localName))) {
      if (isSvg) warnings.push('An unsupported SVG element was omitted.')
      node.remove()
      continue
    }
    if (!isSvg && !isMath && !htmlTags.has(node.tagName)) { node.replaceWith(...node.childNodes); continue }
    const omission = node.classList.contains('hmp-omitted')
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase()
      const allowed = isSvg ? svgAttrs.has(name) : isMath ? /^(display|mathvariant|mathsize|stretchy|fence|separator|accent|accentunder|displaystyle|scriptlevel|linethickness|columnalign|rowalign|columnspacing|rowspacing|columnspan|rowspan|notation|encoding|xmlns)$/.test(name) : htmlAttrs.has(name)
      if (!allowed || /url\((?!\s*['"]?#)/i.test(attr.value)) node.removeAttribute(attr.name)
    }
    if (omission) node.className = 'hmp-omitted'
    if (node.tagName === 'A') {
      const href = safeURL(node.getAttribute('href'), 'link', doc.baseURI)
      if (href) node.setAttribute('href', href)
      else node.removeAttribute('href')
    }
    if (node.tagName === 'IMG') node.loading = 'eager'
    if (node.tagName === 'DETAILS') node.open = true
  }
  for (const attr of [...content.attributes]) content.removeAttribute(attr.name)
  content.className = 'hmp-document'
  const title = root.querySelector('h1,h2')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) || 'Markdown document'
  return { content, title, warnings: unique(warnings) }
}

function abortError() { return new DOMException('Printing was canceled.', 'AbortError') }
function checkAbort(signal) { if (signal?.aborted) throw abortError() }

function withDeadline(promise, signal, label, timeout = ASSET_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let timer
    const finish = (fn, value) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); fn(value) }
    const onAbort = () => finish(reject, abortError())
    timer = setTimeout(() => finish(reject, new Error(label)), timeout)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) return onAbort()
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error))
  })
}

export async function prepareAssets(snapshot, signal, timeout = ASSET_TIMEOUT) {
  checkAbort(signal)
  const doc = snapshot.content.ownerDocument
  if (doc.fonts) await withDeadline(doc.fonts.ready, signal, 'Document fonts did not finish loading. Try again.', timeout)
  await Promise.all([...snapshot.content.querySelectorAll('img')].map(async img => {
    const image = new doc.defaultView.Image()
    image.src = img.src
    const failure = `An image did not load: ${img.alt || img.src.slice(0, 100)}. Retry after the preview finishes loading.`
    await withDeadline(image.decode().catch(() => { throw new Error(failure) }), signal, failure, timeout)
    if (!image.naturalWidth) throw new Error(`An image is unavailable: ${img.alt || 'unnamed image'}.`)
  }))
  checkAbort(signal)
}

export function mountPrintDocument(snapshot, doc = document) {
  if (doc.getElementById(ROOT_ID)) throw new Error('Another Markdown print operation is already open.')
  const root = snapshot.content.cloneNode(true)
  root.id = ROOT_ID
  root.setAttribute(OWNED, 'document')
  const style = doc.createElement('style')
  style.setAttribute(OWNED, 'print-style')
  style.textContent = `#${ROOT_ID}{display:none;}\n${PRINT_CSS}`
  const oldTitle = doc.title
  const oldMarker = doc.body.getAttribute(ACTIVE)
  doc.head.append(style)
  doc.body.append(root)
  doc.body.setAttribute(ACTIVE, '')
  doc.title = snapshot.title
  let cleaned = false
  return () => {
    if (cleaned) return
    cleaned = true
    root.remove()
    style.remove()
    if (oldMarker === null) doc.body.removeAttribute(ACTIVE)
    else doc.body.setAttribute(ACTIVE, oldMarker)
    if (doc.title === snapshot.title) doc.title = oldTitle
  }
}

export async function portableSnapshot(snapshot, signal) {
  const portable = { ...snapshot, content: snapshot.content.cloneNode(true), warnings: [...snapshot.warnings] }
  const win = snapshot.content.ownerDocument.defaultView
  await Promise.all([...portable.content.querySelectorAll('img')].map(async img => {
    checkAbort(signal)
    const protocol = new URL(img.src).protocol
    if (protocol === 'blob:') {
      const response = await withDeadline(win.fetch(img.src, { signal }), signal, 'An app-local image could not be exported.')
      if (!response.ok) throw new Error('An app-local image could not be exported. Use the system print dialog instead.')
      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) throw new Error('An app-local image has an unsupported format.')
      img.src = await withDeadline(new Promise((resolve, reject) => {
        const reader = new win.FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('An app-local image could not be read.'))
        reader.readAsDataURL(blob)
      }), signal, 'An app-local image could not be exported.')
    } else if (protocol === 'http:' || protocol === 'https:') {
      portable.warnings.push('External images remain links and must be reachable in your browser.')
    }
  }))
  checkAbort(signal)
  portable.warnings = unique(portable.warnings)
  return portable
}

export function standaloneHTML(snapshot) {
  // This is the only executable script in an exported file; never interpolate
  // document text into it. Images and fonts must settle before printing.
  const script = `const button=document.getElementById('hmp-browser-print');const status=document.getElementById('hmp-browser-status');button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Preparing document…';try{await Promise.race([Promise.all([document.fonts.ready,...Array.from(document.images,i=>i.decode())]),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Images or fonts have not finished loading. Please retry.')),15000))]);status.textContent='Choose Save as PDF or a printer in the print dialog.';window.print();}catch(e){status.textContent=e.message||'Printing is unavailable. Try your browser’s Print command.';}finally{button.disabled=false;}});`
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file: https: http:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(snapshot.title)}</title><style>${PRINT_CSS}\nbody{margin:24px auto;max-width:900px;padding:0 24px;background:#fff;color:#171717}.hmp-browser-controls{font:14px/1.5 Arial,sans-serif;margin-bottom:24px;padding:16px;background:#f3f4f6;border-radius:6px}.hmp-browser-controls button{font:inherit;cursor:pointer;padding:8px 14px}.hmp-browser-controls p{margin:8px 0 0}@media print{body{margin:0;max-width:none;padding:0}}</style></head><body><div class="hmp-browser-controls"><button type="button" id="hmp-browser-print">Print / Save as PDF</button><p id="hmp-browser-status">Choose Save as PDF in your browser’s print dialog.</p>${snapshot.warnings.map(w => `<p>${escapeHTML(w)}</p>`).join('')}</div>${snapshot.content.outerHTML}<script>${script}</script></body></html>`
}

export function exportFilename(title, date = new Date(), suffix = crypto.randomUUID().slice(0, 8)) {
  const slug = title.normalize('NFKC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, '-').replace(/^[. ]+|[. ]+$/g, '').slice(0, 65) || 'Markdown-document'
  return `hermes-print-${slug}-${date.toISOString().replace(/[:.]/g, '-')}-${suffix}.html`
}

export async function writeBrowserCopy(ctx, snapshot, signal) {
  if (!ctx.files?.requestFolder || !ctx.files?.writeText) throw new Error('This Hermes build does not expose plugin file access. System printing is still available.')
  const portable = await portableSnapshot(snapshot, signal)
  const html = standaloneHTML(portable)
  if (new TextEncoder().encode(html).length > MAX_EXPORT_BYTES) throw new Error('The printable HTML exceeds Hermes’s 4 MiB export limit. Use the system print dialog for this document.')
  checkAbort(signal)
  const savedId = ctx.storage.get('exportFolderId', '')
  const granted = await ctx.files.folders()
  let folder = granted.find(f => f.id === savedId)
  if (!folder) {
    const picked = await ctx.files.requestFolder()
    checkAbort(signal)
    if (!picked.ok) throw new Error(picked.message || 'The export folder is unavailable.')
    if (!picked.folder) return null
    folder = picked.folder
    ctx.storage.set('exportFolderId', folder.id)
  }
  checkAbort(signal)
  const filename = exportFilename(snapshot.title)
  const result = await ctx.files.writeText(folder.id, filename, html, { exclusive: true })
  checkAbort(signal)
  if (!result.ok) {
    if (['not-granted','folder-missing','folder-changed'].includes(result.error)) ctx.storage.remove('exportFolderId')
    throw new Error(result.message || 'The printable HTML could not be saved.')
  }
  // writeText returns a RELATIVE path. Join only our generated basename with
  // the folder path supplied by the SDK, never with a path from the document.
  const path = folder.path.replace(/[\\/]+$/, '') + (folder.path.includes('\\') ? '\\' : '/') + filename
  if (!(await ctx.os.openExternal(path))) throw new Error('The print copy was saved, but could not be opened. Open it from your export folder.')
  return { path, warnings: portable.warnings }
}

export function createPluginController(ctx, { doc = document, win = window, notify = value => host.notify(value), assetTimeout = ASSET_TIMEOUT } = {}) {
  const buttons = new Map()
  const operations = new Set()
  let lastFocused = null
  let busy = false
  let disposed = false
  let scheduled = null
  let printCleanup = null
  let nativeUnavailable = false
  const disposers = []
  const uiStyle = doc.createElement('style')
  uiStyle.setAttribute(OWNED, 'ui-style')
  uiStyle.textContent = UI_CSS
  doc.head.append(uiStyle)
  const tell = (kind, text, action) => { if (!disposed) notify({ kind, title: 'Markdown Print', message: text, ...(action ? { action } : {}) }) }
  const updateBusy = () => { for (const button of buttons.values()) button.disabled = busy }

  async function run(mode, root, existingSnapshot, fromPalette = false) {
    if (disposed) return
    if (busy) { tell('info', 'A Markdown print operation is already in progress.'); return }
    const operation = new AbortController()
    operations.add(operation)
    busy = true
    updateBusy()
    let snapshot
    try {
      // Hermes invokes a palette contribution before dismissing the modal.
      // Its exit animation temporarily makes even visible previews aria-hidden.
      if (fromPalette) await waitForPaletteDismissal(doc, operation.signal)
      checkAbort(operation.signal)
      snapshot = existingSnapshot || captureSnapshot(root || chooseDocument(doc, lastFocused))
      await prepareAssets(snapshot, operation.signal, assetTimeout)
      checkAbort(operation.signal)
      if (mode === 'browser' || nativeUnavailable) {
        if (mode !== 'browser') tell('info', 'Native printing is unavailable in this window. Opening a browser print copy.')
        const result = await writeBrowserCopy(ctx, snapshot, operation.signal)
        if (result) tell(result.warnings.length ? 'warning' : 'info', `Print copy saved and sent to your HTML application.${result.warnings.length ? ' ' + result.warnings.join(' ') : ''}`)
        return result
      }
      if (snapshot.warnings.length) tell('warning', snapshot.warnings.join(' '))
      let nativeStarted = false
      let printReturned = false
      let afterPrint = false
      const onBefore = () => { nativeStarted = true }
      const cleanup = mountPrintDocument(snapshot, doc)
      const onAfter = () => { afterPrint = true; cleanup() }
      printCleanup = () => {
        cleanup()
        win.removeEventListener('beforeprint', onBefore)
        win.removeEventListener('afterprint', onAfter)
        printCleanup = null
      }
      win.addEventListener('beforeprint', onBefore)
      win.addEventListener('afterprint', onAfter)
      try {
        if (typeof win.print !== 'function') throw new Error('The system print dialog is unavailable.')
        win.print()
        printReturned = true
      } catch (error) {
        nativeUnavailable = true
        throw new Error(`The system print dialog could not open: ${message(error)}`)
      } finally {
        // Windows/Chromium print() blocks until the dialog closes; afterprint
        // also fires on cancellation. Neither event proves a PDF was saved.
        printCleanup?.()
      }
      if (printReturned && !nativeStarted && !afterPrint) {
        // A silent no-op is distinguishable from a normal cancel (beforeprint
        // and afterprint fire). Still offer a user action, never spawn a browser.
        nativeUnavailable = true
        tell('warning', 'The system print dialog did not open. Use a browser print copy instead.', { label: 'Open in browser', onClick: () => void run('browser', null, snapshot) })
      }
    } catch (error) {
      if (error?.name !== 'AbortError') tell('error', message(error), snapshot && nativeUnavailable
        ? { label: 'Open in browser', onClick: () => void run('browser', null, snapshot) } : undefined)
    } finally {
      operations.delete(operation)
      busy = false
      updateBusy()
    }
  }

  function reconcile() {
    scheduled = null
    if (disposed) return
    const roots = [...doc.querySelectorAll(DOCUMENT)].filter(isVisible)
    for (const [root, button] of buttons) {
      const toolbar = viewerAdapter(root).toolbar
      if (!roots.includes(root) || !toolbar || button.parentElement !== toolbar) {
        button.remove()
        buttons.delete(root)
      }
    }
    for (const root of roots) {
      if (buttons.has(root)) continue
      const { toolbar } = viewerAdapter(root)
      if (!toolbar) continue
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'hmp-print-button'
      button.setAttribute(OWNED, 'button')
      button.setAttribute('aria-label', 'Print Markdown document')
      button.textContent = 'Print…'
      button.disabled = busy
      button.addEventListener('click', event => { event.stopPropagation(); lastFocused = root; void run('native', root) })
      toolbar.append(button)
      buttons.set(root, button)
    }
  }
  function schedule() {
    if (!disposed && scheduled === null) scheduled = win.setTimeout(reconcile, 75)
  }
  const observer = new win.MutationObserver(records => {
    if (records.some(r => !(r.target instanceof win.Element && r.target.closest(`[${OWNED}]`)))) schedule()
  })
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','hidden','inert','aria-hidden'] })
  function remember(event) {
    const node = event.target instanceof win.Element ? event.target : null
    const root = node?.closest(DOCUMENT)
    if (root && isVisible(root)) lastFocused = root
  }
  doc.addEventListener('pointerdown', remember, true)
  doc.addEventListener('focusin', remember, true)
  for (const [id, label, mode] of [
    ['print', 'Print Markdown document', 'native'],
    ['browser', 'Open Markdown print copy in browser', 'browser']
  ]) {
    const remove = ctx.register({ id, area: PALETTE_AREA, data: { id: `${ID}.${id}`, label, keywords: ['markdown','print','pdf','export'], run: () => void run(mode, undefined, undefined, true) } })
    if (typeof remove === 'function') disposers.push(remove)
  }
  function dispose() {
    if (disposed) return
    disposed = true
    observer.disconnect()
    if (scheduled !== null) win.clearTimeout(scheduled)
    for (const operation of operations) operation.abort()
    printCleanup?.()
    doc.removeEventListener('pointerdown', remember, true)
    doc.removeEventListener('focusin', remember, true)
    for (const button of buttons.values()) button.remove()
    buttons.clear()
    for (const remove of disposers) remove()
    uiStyle.remove()
    lastFocused = null
  }
  ctx.onDispose(dispose)
  reconcile()
  return { run, dispose, reconcile, get busy() { return busy } }
}

export default {
  id: ID,
  name: 'Markdown Print',
  description: 'Print rendered Markdown with a light paper layout, or open a browser print copy.',
  defaultEnabled: true,
  register(ctx) { createPluginController(ctx) }
}
