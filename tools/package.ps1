$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$releaseDir=Join-Path $repo 'dist\release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Compress-Archive -Path (Join-Path $repo 'dist\windows\*') -DestinationPath (Join-Path $releaseDir 'HKVSZombie-Godot-Windows.zip') -Force
Compress-Archive -Path (Join-Path $repo 'dist\web\*') -DestinationPath (Join-Path $releaseDir 'HKVSZombie-Godot-Web.zip') -Force
Get-ChildItem -LiteralPath $releaseDir | Get-FileHash -Algorithm SHA256 | Select-Object Hash,Path
