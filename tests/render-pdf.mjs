import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHarness, loadFixture, longDocument } from './harness.mjs'

const output = resolve(process.env.HMP_VALIDATION_DIR || 'validation')
await mkdir(output, {recursive:true})
const harness = await createHarness()
try {
  for (const dark of [false,true]) {
    const page=await harness.browser.newPage({viewport:{width:1300,height:900}})
    await loadFixture(page,harness.url,longDocument(),{dark})
    await page.evaluate(async () => {
      const snapshot=hmpHelpers.captureSnapshot(document.querySelector('[data-preview-markdown]'))
      await hmpHelpers.prepareAssets(snapshot)
      window.hmpUnmount=hmpHelpers.mountPrintDocument(snapshot)
    })
    await page.pdf({path:resolve(output,`native-layout-${dark?'dark':'light'}.pdf`),format:'Letter',printBackground:true,preferCSSPageSize:true})
    await page.evaluate(() => hmpUnmount())
    if (dark) {
      await page.evaluate(() => hmpController.run('browser'))
      const html=await page.evaluate(() => hmpWrites[0][2])
      await writeFile(resolve(output,'browser-print.html'),html)
      await page.setContent(html,{waitUntil:'load'})
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()))})
      await page.pdf({path:resolve(output,'browser-layout.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true})
    }
    await page.close()
  }
  console.log(`PDF validation files: ${output}`)
} finally {await harness.close()}
