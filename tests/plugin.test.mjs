import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHarness, loadFixture, documentPane, longDocument, SAMPLE_IMAGE } from './harness.mjs'

let harness
before(async () => { harness = await createHarness() })
after(async () => { await harness?.close() })

async function fixture(fn, html, options) {
  const page = await harness.browser.newPage({ viewport: { width: 1600, height: 900 } })
  try { await loadFixture(page, harness.url, html, options); await fn(page) }
  finally { await page.close() }
}

test('injects one button per visible preview; switching modes and reload clean up', async () => {
  await fixture(async page => {
    assert.equal(await page.locator('.hmp-print-button').count(), 1)
    await page.evaluate(() => { for (let i = 0; i < 10; i++) hmpController.reconcile() })
    assert.equal(await page.locator('.hmp-print-button').count(), 1)
    await page.evaluate(() => { document.querySelector('[data-preview-markdown]').remove(); hmpController.reconcile() })
    assert.equal(await page.locator('.hmp-print-button').count(), 0)
    await page.evaluate(() => hmpController.dispose())
    assert.equal(await page.locator('[data-hmp-owned]').count(), 0)
    assert.equal(await page.evaluate(() => hmpContributions.size), 0)
  }, documentPane() + documentPane({id:'b',title:'Hidden',hidden:true}))
})

test('native printing captures the clicked pane and restores title/DOM after cancellation', async () => {
  await fixture(async page => {
    await page.emulateMedia({media:'print'})
    await page.evaluate(() => hmpController.run('native', document.querySelectorAll('[data-preview-markdown]')[1]))
    const result = await page.evaluate(() => ({calls:hmpPrintCalls, title:document.title, roots:document.querySelectorAll('#hermes-markdown-print-document').length, busy:hmpController.busy, opens:hmpOpens.length, notices:hmpNotifications}))
    assert.equal(result.calls.length, 1)
    assert.match(result.calls[0].text, /Document B/)
    assert.doesNotMatch(result.calls[0].text, /Document A|PRIVATE-CHAT/)
    assert.equal(result.calls[0].appDisplay, 'none')
    assert.equal(result.roots, 0)
    assert.equal(result.title, 'Hermes test window')
    assert.equal(result.busy, false)
    assert.equal(result.opens, 0)
    assert.equal(result.notices.length, 0)
  }, documentPane() + documentPane({id:'b',title:'Document B'}))
})

test('palette refuses ambiguous documents and honors the last focused visible pane', async () => {
  await fixture(async page => {
    await page.evaluate(() => hmpController.run('native'))
    assert.match(await page.evaluate(() => hmpNotifications.at(-1).message), /Click inside/)
    await page.locator('[data-pane-host="b"] h1').click()
    await page.evaluate(() => hmpController.run('native'))
    assert.equal(await page.evaluate(() => hmpPrintCalls.at(-1).title), 'Document B')
    await page.evaluate(() => { document.querySelector('[data-pane-host="b"]').setAttribute('aria-hidden','true') })
    await page.evaluate(() => hmpController.run('native'))
    assert.equal(await page.evaluate(() => hmpPrintCalls.at(-1).title), 'Document A')
  }, documentPane() + documentPane({id:'b',title:'Document B'}))
})

test('observer reinserts a removed toolbar button and excludes a newly hidden pane', async () => {
  await fixture(async page => {
    await page.evaluate(() => document.querySelector('.hmp-print-button').remove())
    await page.waitForFunction(() => document.querySelectorAll('.hmp-print-button').length === 1)
    await page.evaluate(() => document.querySelector('.pane').setAttribute('inert',''))
    await page.waitForFunction(() => document.querySelectorAll('.hmp-print-button').length === 0)
  })
})

test('unknown toolbar preserves palette printing; truncation blocks printing', async () => {
  await fixture(async page => {
    assert.equal(await page.locator('.hmp-print-button').count(), 0)
    await page.evaluate(() => hmpController.run('native'))
    assert.equal(await page.evaluate(() => hmpPrintCalls.length), 1)
  }, documentPane({toolbar:false}))
  await fixture(async page => {
    await page.evaluate(() => hmpController.run('native'))
    assert.equal(await page.evaluate(() => hmpPrintCalls.length), 0)
    assert.match(await page.evaluate(() => hmpNotifications.at(-1).message), /partial preview/)
  }, documentPane({truncated:true}))
})

test('printer error offers explicit browser action and native no-op does not auto-open browser', async () => {
  for (const mode of ['throw','noop']) await fixture(async page => {
    await page.evaluate(mode => { hmpPrintMode = mode; return hmpController.run('native') }, mode)
    assert.equal(await page.evaluate(() => hmpOpens.length), 0)
    assert.equal(await page.locator('#hermes-markdown-print-document').count(), 0)
    assert.equal(await page.evaluate(() => hmpNotifications.at(-1).action.label), 'Open in browser')
    await page.evaluate(() => { hmpNotifications.at(-1).action.onClick() })
    await page.waitForFunction(() => hmpOpens.length === 1)
  })
})

test('browser export selects a folder once, writes unique exclusive HTML, and opens a native path', async () => {
  await fixture(async page => {
    await page.evaluate(() => hmpController.run('browser'))
    await page.evaluate(() => hmpController.run('browser'))
    const data = await page.evaluate(() => ({writes:hmpWrites, opens:hmpOpens, picks:hmpPickCount}))
    assert.equal(data.picks, 1)
    assert.equal(data.writes.length, 2)
    assert.notEqual(data.writes[0][1], data.writes[1][1])
    assert.equal(data.writes[0][3].exclusive, true)
    assert.match(data.writes[0][2], /Print \/ Save as PDF/)
    assert.match(data.opens[0], /^C:\\Exports\\hermes-print-/)
    assert.doesNotMatch(data.opens[0], /^file:/)
  })
})

test('folder cancellation and revoked or failed exports are handled without opening files', async () => {
  await fixture(async page => {
    await page.evaluate(() => { hmpFolderPick={ok:true,folder:null}; return hmpController.run('browser') })
    assert.equal(await page.evaluate(() => hmpWrites.length), 0)
    assert.equal(await page.evaluate(() => hmpNotifications.length), 0)
  })
  await fixture(async page => {
    await page.evaluate(() => { hmpStorage.set('exportFolderId','old'); return hmpController.run('browser') })
    assert.equal(await page.evaluate(() => hmpPickCount), 1)
    await page.evaluate(() => { hmpWriteResult={ok:false,error:'not-granted',message:'Folder access revoked'}; return hmpController.run('browser') })
    assert.equal(await page.evaluate(() => hmpStorage.has('exportFolderId')), false)
    assert.match(await page.evaluate(() => hmpNotifications.at(-1).message), /revoked/)
    assert.equal(await page.evaluate(() => hmpOpens.length), 1)
  })
})

test('complete report retains tables, math, images, and final paragraph without app UI', async () => {
  await fixture(async page => {
    await page.evaluate(() => hmpController.run('browser'))
    const html = await page.evaluate(() => hmpWrites[0][2])
    assert.match(html, /FINAL-PARAGRAPH-REACHED/)
    assert.match(html, /<math/)
    assert.match(html, /data:image\/svg/)
    assert.doesNotMatch(html, /PRIVATE-CHAT|DUPLICATE-MATH|data-preview-markdown|hmp-print-button/)
    assert.equal((html.match(/<tbody>/g) || []).length, 1)
  }, longDocument(), {dark:true})
})

test('exports sanitize executable content, unsafe links and styles, and disclose unsupported embeds', async () => {
  await fixture(async page => {
    await page.evaluate(() => {
      const root=document.querySelector('[data-preview-markdown]')
      root.insertAdjacentHTML('beforeend','<a href="javascript:alert(1)" onclick="alert(2)">Unsafe link</a><p style="background:url(https://example.com/leak)">Plain text</p><script>window.shouldNotRun=1</script><iframe src="about:blank"></iframe>')
      return hmpController.run('browser')
    })
    const html = await page.evaluate(() => hmpWrites[0][2])
    assert.doesNotMatch(html, /javascript:|onclick=|window.shouldNotRun|background:url|<iframe/)
    assert.match(html, /Embedded iframe is not included/)
    assert.equal((html.match(/<script>/g)||[]).length, 1)
  })
})

test('broken images fail clearly; double clicks and disable during asset preparation are safe', async () => {
  await fixture(async page => {
    await page.evaluate(() => { document.querySelector('img').src='data:image/png;base64,broken'; return hmpController.run('native') })
    assert.equal(await page.evaluate(() => hmpPrintCalls.length), 0)
    assert.equal(await page.evaluate(() => hmpController.busy), false)
    assert.equal(await page.evaluate(() => hmpNotifications.at(-1).kind), 'error')
  }, documentPane({body:`<img alt="Sample" src="${SAMPLE_IMAGE}">`}))
  await fixture(async page => {
    await page.evaluate(async () => {
      const first=hmpController.run('native')
      const second=hmpController.run('native')
      hmpController.dispose()
      await Promise.all([first,second])
    })
    assert.equal(await page.evaluate(() => hmpPrintCalls.length), 0)
    assert.equal(await page.locator('[data-hmp-owned]').count(), 0)
  })
})

test('blob images become portable data URLs and large exports fail before folder selection', async () => {
  await fixture(async page => {
    await page.evaluate(() => {
      const blob=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><rect width="100" height="30" fill="blue"/></svg>'],{type:'image/svg+xml'})
      const img=document.createElement('img'); img.src=URL.createObjectURL(blob); document.querySelector('[data-preview-markdown]').append(img)
      return hmpController.run('browser')
    })
    assert.match(await page.evaluate(() => hmpWrites[0][2]), /data:image\/svg\+xml;base64,/)
    assert.doesNotMatch(await page.evaluate(() => hmpWrites[0][2]), /src="blob:/)
  })
  await fixture(async page => {
    await page.evaluate(() => { document.querySelector('[data-preview-markdown] p').textContent='x'.repeat(4*1024*1024); return hmpController.run('browser') })
    assert.match(await page.evaluate(() => hmpNotifications.at(-1).message), /4 MiB/)
    assert.equal(await page.evaluate(() => hmpPickCount), 0)
  })
})

test('disable during native printing and subsequent reload leave no stale print state', async () => {
  await fixture(async page => {
    await page.evaluate(() => { hmpNativeAction=()=>hmpController.dispose(); return hmpController.run('native') })
    assert.equal(await page.locator('[data-hmp-owned]').count(), 0)
    assert.equal(await page.evaluate(() => document.body.hasAttribute('data-hmp-printing')), false)
    assert.equal(await page.title(), 'Hermes test window')
    await page.evaluate(() => { hmpNativeAction=null; hmpController=hmpHelpers.createPluginController(hmpCtx) })
    assert.equal(await page.locator('.hmp-print-button').count(), 1)
    await page.evaluate(() => hmpController.run('native'))
    assert.equal(await page.evaluate(() => hmpPrintCalls.length), 2)
  })
})

test('paper typography overrides the host app heading reset', async () => {
  await fixture(async page => {
    const result = await page.evaluate(() => {
      const style=document.createElement('style'); style.textContent='h1,h2,h3,h4,h5,h6{font-weight:inherit;font-size:inherit}'
      document.head.append(style)
      const snapshot=hmpHelpers.captureSnapshot(document.querySelector('[data-preview-markdown]'))
      const unmount=hmpHelpers.mountPrintDocument(snapshot)
      const heading=document.querySelector('#hermes-markdown-print-document h1')
      const result={weight:getComputedStyle(heading).fontWeight,color:getComputedStyle(heading).color}
      unmount()
      return result
    })
    assert.equal(result.weight,'700')
    assert.equal(result.color,'rgb(17, 17, 17)')
  }, undefined, {dark:true})
})
