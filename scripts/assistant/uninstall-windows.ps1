param([switch]$Quiet)
$ErrorActionPreference = 'Stop'

try {
    # Only remove the verified application folder containing this script.
    $installation = Get-Item -LiteralPath $PSScriptRoot
    $installationPath = $installation.FullName.TrimEnd('\')
    $dataPath = if ($env:PROJECT_CAD_ASSISTANT_DATA) { [IO.Path]::GetFullPath($env:PROJECT_CAD_ASSISTANT_DATA) } else { Join-Path $env:USERPROFILE '.project-cad\assistant' }
    $dataPath = $dataPath.TrimEnd('\')
    if (($installation.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        $installationPath -eq [IO.Path]::GetPathRoot($installationPath).TrimEnd('\') -or
        $installationPath -eq $env:USERPROFILE -or
        $dataPath -eq $installationPath -or
        $dataPath.StartsWith($installationPath + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $installationPath.StartsWith($dataPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to remove an unsafe installation folder.'
    }
    $manifest = Get-Content -LiteralPath (Join-Path $installationPath 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.name -ne 'Project CAD Assistant') { throw 'This is not a Project CAD Assistant installation.' }
    $runtime = Join-Path $installationPath 'runtime\node.exe'
    $desktop = Join-Path $installationPath 'app\desktop.mjs'
    if (!(Test-Path -LiteralPath $runtime -PathType Leaf) -or !(Test-Path -LiteralPath $desktop -PathType Leaf)) {
        throw 'The assistant installation is incomplete. Reinstall it before uninstalling.'
    }
    $registrationName = if ($env:PROJECT_CAD_ASSISTANT_STARTUP_NAME) { $env:PROJECT_CAD_ASSISTANT_STARTUP_NAME } else { 'ProjectCADAssistant' }
    if ($registrationName -notmatch '^ProjectCADAssistant(?:-[a-zA-Z0-9-]+)?$') { throw 'Invalid assistant registration name.' }
    $registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $registrationName
    $registered = Get-ItemProperty -LiteralPath $registryPath -ErrorAction SilentlyContinue
    $ownsRegistration = $registered -and $registered.InstallLocation -eq $installationPath
    if (!$Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        $answer = [Windows.Forms.MessageBox]::Show('Uninstall Project CAD Assistant from this computer? Your projects, conversations, settings, and agent sign-ins will be kept.', 'Uninstall Project CAD Assistant', 'YesNo', 'Question', 'Button2')
        if ($answer -ne 'Yes') { exit 0 }
    }
    # Wait for the controller and its worker to exit before removing their runtime.
    & $runtime $desktop uninstall
    if ($LASTEXITCODE -ne 0) { throw 'The assistant could not stop. Close it and try uninstalling again.' }
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            Remove-Item -LiteralPath $installationPath -Recurse -Force
            break
        } catch {
            if ($attempt -eq 39) { throw }
            Start-Sleep -Milliseconds 250
        }
    }
    if ($ownsRegistration) {
        Remove-Item -LiteralPath $registryPath -Recurse -Force
        $shortcutName = if ($registrationName -eq 'ProjectCADAssistant') { 'Project CAD Assistant' } else { $registrationName }
        $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Project CAD'
        Remove-Item -LiteralPath (Join-Path $menu ($shortcutName + '.lnk')) -Force -ErrorAction SilentlyContinue
        if ((Test-Path -LiteralPath $menu) -and !(Get-ChildItem -LiteralPath $menu)) {
            Remove-Item -LiteralPath $menu
        }
    }
    if (!$Quiet) {
        [Windows.Forms.MessageBox]::Show('Project CAD Assistant was uninstalled. Your projects, conversations, settings, and sign-ins were kept.', 'Project CAD Assistant', 'OK', 'Information') | Out-Null
    }
} catch {
    if (!$Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Could not uninstall Project CAD Assistant', 'OK', 'Error') | Out-Null
    }
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
