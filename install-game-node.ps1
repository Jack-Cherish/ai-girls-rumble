$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$runtime = Join-Path $env:LOCALAPPDATA 'AI-Girls-Rumble\runtime'
$exe = Join-Path $runtime 'node.exe'
$stage = Join-Path $runtime ([guid]::NewGuid().ToString('N'))
$exitCode = 0

function Test-GameNode($path) {
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
    try {
        $version = & $path --version 2>$null
        return ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 18)
    } catch { return $false }
}

try {
    if (Test-GameNode $exe) { exit 0 }
    $cpu = $env:PROCESSOR_ARCHITEW6432
    if (!$cpu) { $cpu = $env:PROCESSOR_ARCHITECTURE }
    $arch = switch ($cpu) {
        'AMD64' { 'x64' }
        'ARM64' { 'arm64' }
        default { throw "自动安装支持 64 位 x64 和 ARM64 Windows，当前检测到 $cpu。" }
    }
    $null = [IO.Directory]::CreateDirectory($stage)
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $site = 'https://nodejs.org/dist'
    Write-Host '正在获取 Node.js 24 官方版本信息…'
    $manifest = (Invoke-WebRequest -UseBasicParsing -Uri "$site/latest-v24.x/SHASUMS256.txt" -TimeoutSec 45).Content
    if ($manifest -is [byte[]]) { $manifest = [Text.Encoding]::UTF8.GetString($manifest) }
    $entry = [regex]::Match([string]$manifest, "(?m)^([a-fA-F0-9]{64})[ \t]+(node-(v24\.\d+\.\d+)-win-${arch}\.zip)\r?$")
    if (!$entry.Success) { throw '未在官方校验清单中找到当前电脑所需的 Windows 版本。' }
    $expected = $entry.Groups[1].Value
    $archive = $entry.Groups[2].Value
    $version = $entry.Groups[3].Value
    $zip = Join-Path $stage $archive
    Write-Host "正在下载 Node.js $version ($arch)，请保持此窗口开启…"
    Invoke-WebRequest -UseBasicParsing -Uri "$site/$version/$archive" -OutFile $zip -TimeoutSec 300
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $expected) {
        throw '下载文件未通过 SHA-256 校验，请重新启动游戏以重试。'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $bundle = [IO.Compression.ZipFile]::OpenRead($zip)
    $stagedExe = Join-Path $stage 'node.exe'
    try {
        $item = $bundle.GetEntry(([IO.Path]::GetFileNameWithoutExtension($archive) + '/node.exe'))
        if (!$item) { throw '官方压缩包中未找到 node.exe。' }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($item, $stagedExe)
    } finally { $bundle.Dispose() }
    if ((& $stagedExe --version) -ne $version -or $LASTEXITCODE -ne 0) { throw '下载的 Node.js 未能在此电脑上正常运行。' }
    try {
        if ([IO.File]::Exists($exe)) {
            if (!(Test-GameNode $exe)) { [IO.File]::Replace($stagedExe, $exe, (Join-Path $stage 'previous.exe')) }
        } else {
            [IO.File]::Move($stagedExe, $exe)
        }
    } catch {
        if (!(Test-GameNode $exe)) { throw }
    }
    Write-Host 'Node.js 已准备好，正在打开游戏。'
} catch {
    [Console]::Error.WriteLine("自动安装 Node.js 失败：$($_.Exception.Message)")
    $exitCode = 1
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $exitCode
