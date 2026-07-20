[CmdletBinding()]
param(
  [string]$InstallDirectory = 'C:\Program Files\Mosquitto',
  [string]$CredentialsPath = 'C:\ProgramData\TSEA\secrets\mqtt-credentials.json',
  [string]$RuntimeDirectory = 'C:\ProgramData\TSEA\mosquitto'
)

$ErrorActionPreference = 'Stop'

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Este script precisa ser executado em um PowerShell elevado como administrador.'
  }
}

function New-MosquittoPasswordFile {
  param(
    [Parameter(Mandatory)] [string]$Executable,
    [Parameter(Mandatory)] [string]$Destination,
    [Parameter(Mandatory)] [string]$Username,
    [Parameter(Mandatory)] [string]$Password
  )

  $temporary = Join-Path (
    Split-Path -Parent $Destination
  ) ('.password_file.' + [guid]::NewGuid().ToString('N') + '.tmp')
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Executable
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $escapedTemporary = $temporary.Replace('"', '\"')
  $startInfo.Arguments = "-U `"$escapedTemporary`""

  [System.IO.File]::WriteAllText(
    $temporary,
    "${Username}:$Password`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) {
      throw 'Nao foi possivel iniciar mosquitto_passwd.'
    }
    if (-not $process.WaitForExit(15000)) {
      $process.Kill()
      throw 'Timeout ao gerar o password_file do Mosquitto.'
    }

    $errorOutput = $process.StandardError.ReadToEnd().Trim()
    $hashedLine = Get-Content -LiteralPath $temporary -First 1 -ErrorAction SilentlyContinue
    if (
      $process.ExitCode -ne 0 -or
      -not (Test-Path -LiteralPath $temporary) -or
      $hashedLine -notmatch ('^' + [regex]::Escape($Username) + ':\$') -or
      $hashedLine.Contains($Password)
    ) {
      throw "mosquitto_passwd falhou: $errorOutput"
    }

    Move-Item -LiteralPath $temporary -Destination $Destination -Force
  } finally {
    $process.Dispose()
    if (Test-Path -LiteralPath $temporary) {
      Remove-Item -LiteralPath $temporary -Force
    }
  }
}

function Set-PrivateRuntimePermissions {
  param([Parameter(Mandatory)] [string]$Path)

  $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $Path /inheritance:r /grant:r `
    '*S-1-5-18:(OI)(CI)F' `
    '*S-1-5-32-544:(OI)(CI)F' `
    "${currentIdentity}:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel restringir as permissoes do diretorio MQTT.'
  }
}

Assert-Administrator

$configurationPath = Join-Path $InstallDirectory 'mosquitto.conf'
$passwordUtility = Join-Path $InstallDirectory 'mosquitto_passwd.exe'
$brokerExecutable = Join-Path $InstallDirectory 'mosquitto.exe'
$passwordFile = Join-Path $RuntimeDirectory 'password_file'
$aclFile = Join-Path $RuntimeDirectory 'acl_file'
$dataDirectory = Join-Path $RuntimeDirectory 'data'
$backupPath = "$configurationPath.tsea-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$firewallRuleName = 'TSEA Mosquitto MQTT 1883'
$firewallRuleCreated = $false
$configurationChanged = $false

foreach ($requiredFile in @(
  $configurationPath,
  $passwordUtility,
  $brokerExecutable,
  $CredentialsPath
)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Arquivo obrigatorio nao encontrado: $requiredFile"
  }
}

$credentials = Get-Content -LiteralPath $CredentialsPath -Raw | ConvertFrom-Json
$username = [string]$credentials.usuario_mqtt
$password = [string]$credentials.senha_mqtt
if (
  [string]::IsNullOrWhiteSpace($username) -or
  [string]::IsNullOrWhiteSpace($password) -or
  $username -match ':' -or
  $username -match '"' -or
  $username -match '[\r\n]' -or
  $password -match '[\r\n]'
) {
  throw 'O arquivo externo nao possui usuario e senha MQTT validos.'
}

New-Item -ItemType Directory -Path $RuntimeDirectory, $dataDirectory -Force | Out-Null
Set-PrivateRuntimePermissions -Path $RuntimeDirectory
Copy-Item -LiteralPath $configurationPath -Destination $backupPath -Force

try {
  New-MosquittoPasswordFile `
    -Executable $passwordUtility `
    -Destination $passwordFile `
    -Username $username `
    -Password $password

  [System.IO.File]::WriteAllText(
    $aclFile,
    "user $username`r`ntopic readwrite tsea/#`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  Set-PrivateRuntimePermissions -Path $RuntimeDirectory

  $managedBlock = @(
    '# BEGIN TSEA MANAGED CONFIG',
    'listener 1883',
    'allow_anonymous false',
    'password_file C:/ProgramData/TSEA/mosquitto/password_file',
    'acl_file C:/ProgramData/TSEA/mosquitto/acl_file',
    'persistence true',
    'persistence_location C:/ProgramData/TSEA/mosquitto/data/',
    'log_dest file C:/ProgramData/TSEA/mosquitto/mosquitto.log',
    'log_type error',
    'log_type warning',
    'log_type notice',
    'connection_messages true',
    '# END TSEA MANAGED CONFIG'
  ) -join "`r`n"

  $configuration = [System.IO.File]::ReadAllText($configurationPath)
  if ($configuration -match '(?s)# BEGIN TSEA MANAGED CONFIG.*?# END TSEA MANAGED CONFIG') {
    $configuration = [regex]::Replace(
      $configuration,
      '(?s)# BEGIN TSEA MANAGED CONFIG.*?# END TSEA MANAGED CONFIG',
      $managedBlock
    )
  } else {
    $configuration = $configuration.TrimEnd() + "`r`n`r`n" + $managedBlock + "`r`n"
  }
  [System.IO.File]::WriteAllText(
    $configurationPath,
    $configuration,
    [System.Text.UTF8Encoding]::new($false)
  )
  $configurationChanged = $true

  if (-not (Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule `
      -DisplayName $firewallRuleName `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort 1883 `
      -Program $brokerExecutable `
      -Profile Private `
      -RemoteAddress LocalSubnet | Out-Null
    $firewallRuleCreated = $true
  }

  Restart-Service -Name mosquitto -Force
  $deadline = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 250
    $service = Get-Service -Name mosquitto
  } while ($service.Status -ne 'Running' -and (Get-Date) -lt $deadline)

  if ($service.Status -ne 'Running') {
    throw 'O servico Mosquitto nao voltou ao estado Running.'
  }

  [pscustomobject]@{
    success = $true
    configuration = $configurationPath
    backup = $backupPath
    runtime_directory = $RuntimeDirectory
    password_file_created = Test-Path -LiteralPath $passwordFile
    acl_file_created = Test-Path -LiteralPath $aclFile
    service_status = [string]$service.Status
    firewall_scope = 'Private/LocalSubnet'
  } | ConvertTo-Json -Compress
} catch {
  if ($configurationChanged -and (Test-Path -LiteralPath $backupPath)) {
    Copy-Item -LiteralPath $backupPath -Destination $configurationPath -Force
  }
  if ($firewallRuleCreated) {
    Remove-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
  }
  Start-Service -Name mosquitto -ErrorAction SilentlyContinue
  throw
} finally {
  $password = $null
  $credentials = $null
}
