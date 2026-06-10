# Install SPECTRE from the latest GitHub release (Windows x64).
$ErrorActionPreference = "Stop"
$Repo = if ($env:SPECTRE_INSTALL_REPO) { $env:SPECTRE_INSTALL_REPO } else { "EgieSugina/S.P.E.C.T.R.E" }
$InstallDir = if ($env:SPECTRE_INSTALL_DIR) { $env:SPECTRE_INSTALL_DIR } else { "$env:LOCALAPPDATA\Programs\SPECTRE" }

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "spectre-installer" }
$asset = $release.assets | Where-Object { $_.name -eq "spectre_windows_x86_64.zip" } | Select-Object -First 1
if (-not $asset) { throw "spectre_windows_x86_64.zip not found in latest release" }

$tmp = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_.FullName }
$zip = Join-Path $tmp "spectre.zip"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $tmp -Force

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item (Join-Path $tmp "spectre.exe") (Join-Path $InstallDir "spectre.exe") -Force
Write-Host "Installed $(Join-Path $InstallDir 'spectre.exe')"
Write-Host "Add $InstallDir to PATH, then run: spectre start"
