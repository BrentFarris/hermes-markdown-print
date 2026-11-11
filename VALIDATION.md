# Validation record

Prepared November 11, 2026, for the user's Windows Hermes Desktop installation.

## Automated checks

All 20 Playwright test scenarios pass. The suite exercises the production plugin module against a fixture reproducing the installed viewer's structure, with public SDK file/palette functions mocked in memory.

Coverage includes visible and hidden panes, multiple documents, focus targeting, Source-mode removal, observer reinsertion, unknown toolbar structure, truncation refusal, repeated printing, print cancellation and errors, native no-op handling, browser export, exclusive filenames, folder cancellation/revocation, oversized exports, broken and blob images, sanitized output, and disposal during active work.

The native print function is mocked in this suite. These checks validate document selection and lifecycle behavior, not the Windows print driver or its dialog.

Version 1.0.1 adds regression coverage through the registered palette callbacks. Hermes invokes these callbacks before closing its Radix dialog, so the preview can still have an `aria-hidden`/`inert` ancestor during the exit animation. The regression failed against 1.0.0 and passes with the fix. The tests include delayed accessibility cleanup, both print commands, ambiguous and focused panes, hidden tabs, a closed preview, disposal while waiting, repeated commands, and an undismissed palette timeout. The plugin never removes the host's accessibility attributes.

## PDF layout checks

Three six-page PDFs were generated with Chromium: the native document layout from light and dark host themes on Letter paper, plus the standalone browser layout on A4.

- All contain the final paragraph and all 34 table rows.
- Table headers repeat across three pages.
- Text extraction confirms selectable text and identical textual content between light and dark host themes.
- Chat text, viewer controls, and duplicate KaTeX visual text are absent.
- Rendered pages were visually inspected for wrapping, pagination, margins, images, and equations. No clipped content or dark page background was found.

`sample-print.pdf` is the validated Letter layout.

## Live Windows verification (1.0.0)

Verified in the running Hermes v0.23.1 installation:

- The plugin was discovered without an application rebuild or restart.
- **Print…** appeared next to Preview / Source / Edit on the existing Markdown report.
- Both palette actions appeared in Hermes's command palette.
- The toolbar button opened the actual Windows print dialog.
- Selecting **Microsoft Print to PDF** and saving produced a seven-page PDF of the open report, including its final source entry. The document view and window title returned to their normal state.
- The first and final native PDF pages were visually checked. The Windows driver converted the text to vector outlines: the PDF is readable but text is not selectable/extractable. Browser **Save as PDF** is the provided route for selectable text. The user explicitly chose to retain system printing as the toolbar default after this finding.

The user stopped computer control with the physical Escape key before live cancellation and the actual browser folder-picker flow were exercised. Those behaviors have automated coverage; they are not claimed as end-to-end Windows UI tests. No further app input was sent after the stop.

The 1.0.1 palette fix was verified with the regression suite and installed; the browser folder-picker flow has not been retested through live computer control.

## Application integrity

SHA-256 hashes of the installed application bundle (`app.asar`), Markdown viewer (`preview-file.tsx`), preview pane (`preview-pane.tsx`), and Electron entry (`main.ts`) matched before and after installation. Only the new `desktop-plugins/hermes-markdown-print` directory was added, containing `plugin.js` and `README.md`. The installer was also tested in a workspace fixture, including its identical-version no-op.
