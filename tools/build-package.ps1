$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$PackageJson = Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Version = [string]$PackageJson.version
if ($Version.StartsWith("v")) {
    $Version = $Version.Substring(1)
}

$LocalReleaseDirPath = Join-Path $Root "..\..\releases"
if (Test-Path -LiteralPath (Join-Path $Root "..\..\scripts\github-upload-project.ps1")) {
    $ReleaseDirPath = $LocalReleaseDirPath
} else {
    $ReleaseDirPath = Join-Path $Root "releases"
}
New-Item -ItemType Directory -Force -Path $ReleaseDirPath | Out-Null
$ReleaseDir = (Resolve-Path -LiteralPath $ReleaseDirPath).Path
$PackageDir = Join-Path $Root "package\ddys-tizen"
$Zip = Join-Path $ReleaseDir ("ddys-tizen-v{0}.zip" -f $Version)
$Wgt = Join-Path $ReleaseDir ("ddys-tizen-v{0}.wgt" -f $Version)
$ZipShaFile = "$Zip.sha256"
$WgtShaFile = "$Wgt.sha256"

function Assert-InRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Base
    )

    $separator = [System.IO.Path]::DirectorySeparatorChar
    $full = [System.IO.Path]::GetFullPath($Path)
    $baseFull = [System.IO.Path]::GetFullPath($Base).TrimEnd([char[]]@("\", "/")) + $separator
    if (-not $full.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside project root: $full"
    }
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $separator = [System.IO.Path]::DirectorySeparatorChar
    $basePath = [System.IO.Path]::GetFullPath($Base).TrimEnd([char[]]@("\", "/")) + $separator
    $baseUri = New-Object System.Uri($basePath)
    $fileUri = New-Object System.Uri([System.IO.Path]::GetFullPath($Path))
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()).Replace("/", $separator)
}

function New-ZipFromDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Output
    )

    if (Test-Path -LiteralPath $Output) {
        Remove-Item -LiteralPath $Output -Force
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $fixedTime = [System.DateTimeOffset]::new(2026, 1, 1, 0, 0, 0, [System.TimeSpan]::Zero)
    $archive = [System.IO.Compression.ZipFile]::Open($Output, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $packageFiles = Get-ChildItem -LiteralPath $Source -Recurse -Force -File | Sort-Object FullName
        foreach ($file in $packageFiles) {
            $relative = (Get-RelativePathCompat -Base $Source -Path $file.FullName).Replace("\", "/")
            $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::NoCompression)
            $entry.LastWriteTime = $fixedTime
            $input = [System.IO.File]::OpenRead($file.FullName)
            try {
                $entryStream = $entry.Open()
                try {
                    $input.CopyTo($entryStream)
                } finally {
                    $entryStream.Dispose()
                }
            } finally {
                $input.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
    }
}

Assert-InRoot -Path $PackageDir -Base $Root
if (Test-Path -LiteralPath $PackageDir) {
    Remove-Item -LiteralPath $PackageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PackageDir | Out-Null

$excludeSegments = @(".git", "node_modules", "dist", "build", "coverage", "package", "releases")
$files = Get-ChildItem -LiteralPath $Root -Recurse -Force -File | Where-Object {
    $relative = (Get-RelativePathCompat -Base $Root -Path $_.FullName).Replace("\", "/")
    $segments = $relative -split "/"
    foreach ($segment in $segments) {
        if ($segment -in $excludeSegments) {
            return $false
        }
    }

    if ($_.Name -match "\.(log|tmp|cache|zip|wgt|tgz)$") {
        return $false
    }
    return $true
}

foreach ($file in $files) {
    $relative = Get-RelativePathCompat -Base $Root -Path $file.FullName
    $target = Join-Path $PackageDir $relative
    New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($target)) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

foreach ($path in @($Zip, $Wgt, $ZipShaFile, $WgtShaFile)) {
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
    }
}

New-ZipFromDirectory -Source $PackageDir -Output $Zip

$RuntimeDir = Join-Path $Root "package\wgt"
Assert-InRoot -Path $RuntimeDir -Base $Root
if (Test-Path -LiteralPath $RuntimeDir) {
    Remove-Item -LiteralPath $RuntimeDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
foreach ($relative in @("config.xml", "index.html")) {
    Copy-Item -LiteralPath (Join-Path $Root $relative) -Destination (Join-Path $RuntimeDir $relative) -Force
}
foreach ($relative in @("assets", "src")) {
    Copy-Item -LiteralPath (Join-Path $Root $relative) -Destination (Join-Path $RuntimeDir $relative) -Recurse -Force
}
New-ZipFromDirectory -Source $RuntimeDir -Output $Wgt

$ZipHash = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
$WgtHash = (Get-FileHash -LiteralPath $Wgt -Algorithm SHA256).Hash
Set-Content -LiteralPath $ZipShaFile -Value "$ZipHash  $(Split-Path -Leaf $Zip)" -Encoding ASCII
Set-Content -LiteralPath $WgtShaFile -Value "$WgtHash  $(Split-Path -Leaf $Wgt)" -Encoding ASCII

[pscustomobject]@{
    ok = $true
    zip = $Zip
    wgt = $Wgt
    zipSha256 = $ZipHash
    wgtSha256 = $WgtHash
    files = @($files).Count
} | ConvertTo-Json -Depth 3
