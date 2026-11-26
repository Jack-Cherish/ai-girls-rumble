$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'OpenCLHost.cs')
    [DuelCompute]::Serve((Join-Path $PSScriptRoot 'duel.cl'))
} catch {
    $msg = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.Exception.GetBaseException().Message))
    [Console]::WriteLine("ERR " + $msg)
    exit 1
}
