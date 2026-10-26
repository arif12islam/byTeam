/**
 * The Windows installer for the office agent, as a PowerShell script with this
 * byTeam's address filled in. It downloads the agent from byTeam, asks for the
 * device's IP address and comm key, tests both ends, and only then sets the
 * agent to run in the background whenever the computer starts. Running it
 * again updates the agent and keeps its record of what was already sent.
 *
 * Pure: the route only adds the address and serves it.
 */

export const AGENT_FOLDER = "C:\\byTeam-agent";
export const AGENT_TASK_NAME = "byTeam office agent";

/** A PowerShell string literal in single quotes, where only a single quote needs doubling. */
function psQuote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

export function agentInstallerScript(server: string): string {
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(server)) throw new Error(`Not a server address: ${server}`);

  return [
    "# byTeam office agent: setup for Windows.",
    "# Reads punches from a ZKTeco device on this office network and sends them to byTeam.",
    "#",
    "# Run it in PowerShell opened as administrator:",
    "#   powershell -ExecutionPolicy Bypass -File install-byteam-agent.ps1",
    "",
    '$ErrorActionPreference = "Stop"',
    `$Server = ${psQuote(server)}`,
    `$Folder = ${psQuote(AGENT_FOLDER)}`,
    `$TaskName = ${psQuote(AGENT_TASK_NAME)}`,
    "",
    'Write-Host ""',
    'Write-Host "byTeam office agent setup" -ForegroundColor Cyan',
    "",
    "$me = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())",
    "if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
    '  Write-Host "Open PowerShell as administrator (right click, Run as administrator) and run this again." -ForegroundColor Red',
    "  exit 1",
    "}",
    "",
    "$node = Get-Command node -ErrorAction SilentlyContinue",
    "if (-not $node) {",
    '  Write-Host "Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again." -ForegroundColor Red',
    "  exit 1",
    "}",
    "",
    "# Stop a running copy first, so an update replaces it.",
    "if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName }",
    "",
    '$DeviceIp = (Read-Host "Device IP address (on the device: Menu, Comm., Ethernet), for example 192.168.1.201").Trim()',
    'if (-not $DeviceIp) { Write-Host "No IP address given." -ForegroundColor Red; exit 1 }',
    '$CommKey = (Read-Host "Comm key (Menu, Comm., PC Connection). Press Enter for 0").Trim()',
    'if (-not $CommKey) { $CommKey = "0" }',
    "",
    "New-Item -ItemType Directory -Force -Path $Folder | Out-Null",
    '$Agent = Join-Path $Folder "byteam-agent.js"',
    '$Settings = Join-Path $Folder "agent.json"',
    'Write-Host "Downloading the agent from $Server"',
    '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    'Invoke-WebRequest -UseBasicParsing -Uri ($Server + "/downloads/byteam-agent.js") -OutFile $Agent',
    "",
    "$config = [ordered]@{",
    "  server = $Server",
    "  device = [ordered]@{ host = $DeviceIp; port = 4370; commKey = [int]$CommKey }",
    "  pollSeconds = 60",
    '  timeZone = "Asia/Dhaka"',
    "}",
    "$config | ConvertTo-Json -Depth 3 | Set-Content -Path $Settings -Encoding UTF8",
    "",
    'Write-Host ""',
    'Write-Host "Testing the device and byTeam..."',
    "& $node.Source $Agent --config $Settings --check",
    "if ($LASTEXITCODE -ne 0) {",
    '  Write-Host ""',
    '  Write-Host "The test did not pass. Fix the problem above, then run this setup again. Nothing was set to start automatically." -ForegroundColor Red',
    "  exit 1",
    "}",
    "",
    "$action = New-ScheduledTaskAction -Execute $node.Source -Argument ('\"' + $Agent + '\" --config \"' + $Settings + '\"') -WorkingDirectory $Folder",
    "$trigger = New-ScheduledTaskTrigger -AtStartup",
    "$options = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)",
    '$runAs = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
    "Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $options -Principal $runAs -Force | Out-Null",
    "Start-ScheduledTask -TaskName $TaskName",
    "",
    'Write-Host ""',
    'Write-Host "Done. The agent is running and starts by itself whenever this computer starts." -ForegroundColor Green',
    'Write-Host ("Its log is " + (Join-Path $Folder "agent.log"))',
    "",
    '$keepAwake = Read-Host "Stop this computer from sleeping while plugged in, so punches keep flowing? (Y/n)"',
    'if ($keepAwake -ne "n" -and $keepAwake -ne "N") {',
    "  powercfg /change standby-timeout-ac 0",
    '  Write-Host "Sleep is off while plugged in."',
    "}",
    "",
  ].join("\r\n");
}
