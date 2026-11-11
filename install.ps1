[CmdletBinding(SupportsShouldProcess)]
param([string]$HermesHome = '')

$ErrorActionPreference = 'Stop'
if (-not $HermesHome) {
    $HermesHome = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA 'hermes' }
}
$pluginRoot = Join-Path ([IO.Path]::GetFullPath($HermesHome)) 'desktop-plugins'
if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) {
    throw "Hermes desktop-plugins directory was not found: $pluginRoot. Supply the existing Hermes home with -HermesHome."
}
$pluginDirectory = Join-Path $pluginRoot 'hermes-markdown-print'
$source = Join-Path $PSScriptRoot 'plugin.js'
$readme = Join-Path $PSScriptRoot 'README.md'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'plugin.js is missing from this package.' }
if (Test-Path -LiteralPath $pluginDirectory) {
    $existing = Get-Item -LiteralPath $pluginDirectory
    if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The plugin target is a link. Refusing to replace it.' }
    $installed = Join-Path $pluginDirectory 'plugin.js'
    if ((Test-Path -LiteralPath $installed -PathType Leaf) -and
        ((Get-FileHash -LiteralPath $installed).Hash -eq (Get-FileHash -LiteralPath $source).Hash)) {
        Write-Output "This plugin version is already installed: $installed"
        return
    }
    throw "A different installation already exists at $pluginDirectory. Disable it and replace its plugin.js deliberately; this installer will not overwrite it."
}
if ($PSCmdlet.ShouldProcess($pluginDirectory, 'Install the standalone Markdown Print plugin')) {
    $null = New-Item -ItemType Directory -Path $pluginDirectory
    Copy-Item -LiteralPath $source -Destination (Join-Path $pluginDirectory 'plugin.js')
    Copy-Item -LiteralPath $readme -Destination (Join-Path $pluginDirectory 'README.md')
    Write-Output "Installed: $pluginDirectory"
    Write-Output 'Hermes should load it automatically. If needed, run Reload desktop plugins from its command palette.'
}
