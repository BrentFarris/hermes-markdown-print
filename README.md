# Markdown Print for Hermes Desktop

A standalone Windows plugin that adds **Print…** beside the Markdown viewer's Preview / Source / Edit controls. It prints the full rendered document with white pages, dark text, 11-point type, and approximately 15 mm margins.

No Hermes source edits, application rebuild, backend service, production dependencies, or build step are required.

## Use

1. Open a Markdown file in **Preview** mode.
2. Click **Print…** beside the viewer controls.
3. Choose **Microsoft Print to PDF**, if installed, or another printer in the Windows print dialog. Paper size and other printer options remain under your control.

The command palette also includes:

- **Print Markdown document**
- **Open Markdown print copy in browser**

**For a PDF with selectable/searchable text, use the browser command and the browser's built-in Save as PDF.** Live testing of Hermes v0.23.1 on this computer confirmed that its Windows **Microsoft Print to PDF** route produces readable pages but converts text to vector outlines. The system dialog remains the default, as requested; the plugin cannot change that driver behavior without changing the printing route.

For multiple visible previews, click inside the intended document before using a palette action. A toolbar button always belongs to its own document. Source and Edit views are deliberately excluded: return to Preview first.

Canceling a print dialog leaves the document unchanged and does not open a browser. The plugin does not report that a PDF was saved because Windows does not return that result to `window.print()`.

## Browser printing

Use **Open Markdown print copy in browser** if the native print dialog is unavailable or if you prefer the browser's built-in **Save as PDF** destination.

On first use, choose an export folder in Hermes's folder picker. The plugin remembers the granted folder and writes a uniquely named HTML copy there. The HTML opens in the application associated with `.html` files on Windows. Click its **Print / Save as PDF** button, or use the browser's Print command. If `.html` opens in an editor, use Open with to choose your browser.

HTML copies remain in the selected folder and may be reopened or removed later. No source Markdown is modified. Files are written exclusively, so an existing file is never overwritten. If folder access is revoked, choose a folder again on the next attempt.

## Install

The only required runtime file is `plugin.js`. Put it in:

```text
<HERMES_HOME>\desktop-plugins\hermes-markdown-print\plugin.js
```

For the Windows installation this package was prepared against, `HERMES_HOME` is `C:\Users\brent\AppData\Local\hermes`.

The included `install.ps1` copies only `plugin.js` and this README into that plugin directory. Run it from PowerShell:

```powershell
.\install.ps1 -HermesHome 'C:\Users\brent\AppData\Local\hermes'
```

Hermes normally discovers a new disk plugin automatically. If necessary, run **Reload desktop plugins** from its command palette, or use **Rescan** in **Capabilities → Plugins**. The plugin starts enabled unless Hermes remembers that you disabled this plugin ID.

The installer refuses to replace a different existing installation. To update deliberately, disable the plugin and replace its `plugin.js` with the new version, then reload plugins. No other plugin or application file needs changing.

## Disable or remove

Disable **Markdown Print** in **Capabilities → Plugins**. Its buttons, palette entries, observers, and temporary print markup are removed immediately.

To uninstall, disable it and delete only the `hermes-markdown-print` folder inside `desktop-plugins`. Exported HTML files remain in the folder you chose. Hermes may retain its normal plugin enable preference and folder grant; these are host-managed settings and are not edited by the installer.

## Compatibility and limits

- Version 1.0.0 targets Windows Hermes Desktop and its `@hermes/plugin-sdk`. macOS, Linux, the web dashboard, and mobile are not certified.
- Toolbar placement uses a small adapter for the current Markdown viewer structure. If Hermes changes that structure, the palette actions remain available as long as `[data-preview-markdown]` still identifies the document.
- Partial previews and preview warnings are refused. Printing uses the rendered snapshot present at the click, not raw Markdown or unsaved edits.
- Fonts and images are allowed 15 seconds to finish loading. Missing images produce an error instead of a silently incomplete print.
- Headings, paragraphs, lists, links, tables, code, images, rendered Mermaid diagrams, and semantic math are preserved. Code uses monochrome text. KaTeX's semantic MathML is used to avoid duplicate equations and app-local font dependencies.
- Interactive embedded media is replaced by a labeled placeholder and disclosed. Unsupported inline SVG elements are disclosed. Dark colors inside an image are preserved because the image itself is not redrawn.
- Exported HTML contains its own stylesheet. Blob images are embedded as data URLs. External image URLs still need to be reachable in the browser; the plugin reports this. Local image paths must still exist. There is no document upload or external PDF conversion service.
- Hermes limits plugin text writes to 4 MiB; larger HTML exports are refused with a suggestion to use native printing.
- Runtime detection of a native print error or silent no-op offers an explicit browser action. Subsequent Print clicks in that window use browser export; reload the plugin to retry native printing. A normal print cancellation does not trigger this fallback.

## Validation and development

See `VALIDATION.md` for the tested scope and remaining live verification limits. `sample-print.pdf` demonstrates the selectable-text print layout; it was rendered through Chromium's PDF engine, not the Windows PDF driver.

The shipped plugin is one uncompiled ESM file with a single import from Hermes's public SDK. Tests use Playwright as a development dependency and an in-memory SDK fixture; they make no network requests and do not modify Hermes.

```powershell
npm install
npx playwright install chromium
npm test
npm run validate:pdf
```

For an existing browser/runtime, set `HMP_NODE_MODULES` to the directory containing Playwright, `PLAYWRIGHT_BROWSERS_PATH` to the browser cache, or `HMP_BROWSER` to a Chromium executable. `HMP_VALIDATION_DIR` controls where PDF checks write their output.

The compatibility adapter, snapshot preparation, file export, and print lifecycle are isolated functions in `plugin.js`. No private Hermes stores or React internals are accessed. The plugin registers only two palette contributions and its own DOM additions.
