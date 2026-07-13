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

    if (-not ("DdysZipCrc32" -as [type])) {
        Add-Type -TypeDefinition @"
public static class DdysZipCrc32 {
    public static uint Compute(byte[] bytes) {
        uint crc = 0xffffffffu;
        for (int i = 0; i < bytes.Length; i++) {
            uint value = (crc ^ bytes[i]) & 0xffu;
            for (int bit = 0; bit < 8; bit++) {
                value = ((value & 1u) != 0u) ? (0xedb88320u ^ (value >> 1)) : (value >> 1);
            }
            crc = (crc >> 8) ^ value;
        }
        return crc ^ 0xffffffffu;
    }
}
"@
    }

    $utf8 = [System.Text.Encoding]::UTF8
    $fixedDosTime = [uint16]0x0000
    $fixedDosDate = [uint16]0x5c21
    $generalPurposeFlagUtf8 = [uint16]0x0800
    $storedMethod = [uint16]0
    $entries = New-Object System.Collections.Generic.List[object]
    $packageFiles = Get-ChildItem -LiteralPath $Source -Recurse -Force -File | Sort-Object FullName

    $stream = [System.IO.File]::Open($Output, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $writer = $null
    try {
        $writer = [System.IO.BinaryWriter]::new($stream, $utf8, $false)
        foreach ($file in $packageFiles) {
            $relative = (Get-RelativePathCompat -Base $Source -Path $file.FullName).Replace("\", "/")
            $nameBytes = $utf8.GetBytes($relative)
            $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
            if ($bytes.LongLength -gt [uint32]::MaxValue) {
                throw "File too large for deterministic ZIP32 package: $relative"
            }
            if ($nameBytes.Length -gt [uint16]::MaxValue) {
                throw "File name too long for ZIP package: $relative"
            }

            $offset = [uint32]$writer.BaseStream.Position
            $size = [uint32]$bytes.Length
            $crc = [DdysZipCrc32]::Compute($bytes)

            $writer.Write([uint32]0x04034b50)
            $writer.Write([uint16]20)
            $writer.Write($generalPurposeFlagUtf8)
            $writer.Write($storedMethod)
            $writer.Write($fixedDosTime)
            $writer.Write($fixedDosDate)
            $writer.Write([uint32]$crc)
            $writer.Write($size)
            $writer.Write($size)
            $writer.Write([uint16]$nameBytes.Length)
            $writer.Write([uint16]0)
            $writer.Write($nameBytes)
            $writer.Write($bytes)

            [void]$entries.Add([pscustomobject]@{
                NameBytes = $nameBytes
                Crc = [uint32]$crc
                Size = $size
                Offset = $offset
            })
        }

        if ($entries.Count -gt [uint16]::MaxValue) {
            throw "Too many files for deterministic ZIP32 package."
        }

        $centralOffset = [uint32]$writer.BaseStream.Position
        foreach ($entry in $entries) {
            $writer.Write([uint32]0x02014b50)
            $writer.Write([uint16]20)
            $writer.Write([uint16]20)
            $writer.Write($generalPurposeFlagUtf8)
            $writer.Write($storedMethod)
            $writer.Write($fixedDosTime)
            $writer.Write($fixedDosDate)
            $writer.Write([uint32]$entry.Crc)
            $writer.Write([uint32]$entry.Size)
            $writer.Write([uint32]$entry.Size)
            $writer.Write([uint16]$entry.NameBytes.Length)
            $writer.Write([uint16]0)
            $writer.Write([uint16]0)
            $writer.Write([uint16]0)
            $writer.Write([uint16]0)
            $writer.Write([uint32]0)
            $writer.Write([uint32]$entry.Offset)
            $writer.Write($entry.NameBytes)
        }
        $centralSize = [uint32]($writer.BaseStream.Position - $centralOffset)

        $writer.Write([uint32]0x06054b50)
        $writer.Write([uint16]0)
        $writer.Write([uint16]0)
        $writer.Write([uint16]$entries.Count)
        $writer.Write([uint16]$entries.Count)
        $writer.Write($centralSize)
        $writer.Write($centralOffset)
        $writer.Write([uint16]0)
    } finally {
        if ($null -ne $writer) {
            $writer.Dispose()
        } else {
            $stream.Dispose()
        }
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
