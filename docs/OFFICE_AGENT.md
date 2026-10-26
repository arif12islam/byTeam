# Office agent

For a device that cannot send punches to byTeam itself, like the office's **ZKTeco K40H**. Its Comm. menu has only Ethernet and PC Connection, with no Cloud Server Setting (ADMS). Such a device waits for software on the office network to connect to it on port 4370 and read its punches. byTeam runs on the internet and cannot reach into the office network, so a small program on an office computer does that and passes everything on.

```
K40H (office network, port 4370)
   ↑ every minute: read new punches, write new employees, check the clock
Office agent (always-on Windows computer, Node.js)
   ↓ HTTPS, as if the device itself were pushing
byTeam (Vercel)
```

To byTeam the device then looks exactly like a pushing device, under its own serial number: the same Devices screen, punch storage, duplicate protection, attendance and payroll. A device that can push (like the SenseFace 4A) needs no agent.

## What it does

Every minute (`pollSeconds`):

1. **Connects to the device.** If the device does not answer, the agent tells byTeam nothing, so the Devices screen shows it as offline after 45 minutes.
2. **Reads new punches** when the device holds a different number than last time, or every 30 minutes anyway, and sends them to byTeam. Punches from the day before the newest one already sent are sent again each time; byTeam stores each punch once, so this costs nothing and covers any gap. The first run sends the device's whole log.
3. **Writes employees byTeam queued for the device** (adding someone, or a name change). A person already on the device keeps their slot, privilege, password and card: only the name changes, so the device admin stays admin.
4. **Checks the device clock** once an hour against office time (Asia/Dhaka), sets it when it is more than 30 seconds off, and tells byTeam what it found, for the Clock line on the Devices screen.

It never deletes anything on the device. The device keeps its own copy of every punch.

If the internet is down, the agent keeps trying every minute and sends the backlog when it is back. If the computer is off, punches wait on the device and arrive when the agent starts again.

## Install on Windows

What you need: an always-on Windows 10 or 11 computer on the UPS, a network cable to the device, and an administrator account.

1. **Connect the device.** Either to the office router (or a switch on it), or straight to the computer's network port.
   - **Through the router:** on the device, Menu, Comm., Ethernet: an IP address in the router's range (for example `192.168.1.201` if office computers have `192.168.1.x`), mask `255.255.255.0`, gateway the router (`192.168.1.1`), DHCP off.
   - **Straight to the computer:** use a range of its own that the Wi-Fi does not use. Device: `192.168.50.201`, mask `255.255.255.0`, gateway `0.0.0.0`, DHCP off. Computer: Settings, Network, Ethernet, IP settings, Manual: `192.168.50.10`, mask `255.255.255.0`, no gateway, no DNS. The computer keeps using Wi-Fi for the internet.
   - Check: `ping 192.168.x.201` in Command Prompt gets replies.
2. **Install Node.js LTS** from https://nodejs.org (the default options are fine).
3. **Download the installer** from byTeam: Devices, Office agent, "Download the installer". It has this byTeam's address in it.
4. **Run it**: open PowerShell as administrator (Start, type PowerShell, right click, Run as administrator), go to the Downloads folder (`cd $HOME\Downloads`) and run
   ```
   powershell -ExecutionPolicy Bypass -File install-byteam-agent.ps1
   ```
   It asks for the device's IP address and comm key (Menu, Comm., PC Connection; 0 unless someone set one), then runs a test that changes nothing:
   ```
   Serial number:   5275220900056
   Users:           1
   Punches stored:  3104
   Device time:     2026-10-26 09:30:12
   Office time:     2026-10-26 09:30:05
   ...
   byTeam at https://byteam.bykorp.com accepts this device. Everything is ready.
   ```
   - If it says **byTeam does not accept serial number ...**, add that serial number on the Devices screen exactly as shown and run the installer again.
   - If it **cannot reach the device**, check the cable, the IP address, and that `ping` works.
5. When the test passes, the installer sets the agent to run in the background whenever the computer starts (a scheduled task named "byTeam office agent", running as SYSTEM, so nobody needs to be signed in). It offers to stop the computer sleeping while plugged in: say yes.

Within a minute the device shows **Online** on the Devices screen, and its punches appear on Today and Attendance. "Last lines received" shows them as the agent sent them.

Files, all in `C:\byTeam-agent`:

| File | What it is |
| --- | --- |
| `byteam-agent.js` | The agent itself, downloaded from byTeam. |
| `agent.json` | Settings: byTeam's address, the device IP, port and comm key, how often to run. |
| `agent-state.json` | What was already sent. Deleting it only makes the next run send the whole log again. |
| `agent.log` | What it did. A new file starts past 1 MB; the previous is kept as `agent.log.1`. |

## Update, check, remove

- **Update:** run the installer again. It stops the agent, downloads the current version, tests, and starts it again. `agent-state.json` is kept.
- **Is it running?** Task Scheduler, "byTeam office agent", or look at the end of `C:\byTeam-agent\agent.log`.
- **Test by hand:** `node C:\byTeam-agent\byteam-agent.js --config C:\byTeam-agent\agent.json --check`
- **Remove:** in PowerShell as administrator: `Unregister-ScheduledTask -TaskName "byTeam office agent" -Confirm:$false`, then delete `C:\byTeam-agent`.

## When something is wrong

| What you see | What to do |
| --- | --- |
| Device shows **Never connected** or **Offline** | Look at `agent.log`. "Cannot reach the device": check the cable, the IP address and `ping`. Nothing new in the log: the computer was off or asleep, or the task stopped (Task Scheduler). |
| `agent.log` says byTeam does not accept the serial number | Add it on Devices exactly as written, or switch the device back on there. |
| `agent.log` says the comm key was refused | Set `commKey` in `agent.json` to the value under Menu, Comm., PC Connection, then restart the task. |
| A new employee does not appear on the device | It can take up to about 20 minutes (quiet polling). Check `agent.log` for "Saved ... on the device" or an error. |
| Punch times are off | The agent sets the device clock hourly. Check the computer's own clock and time zone, since the agent uses Asia/Dhaka from `agent.json`. |

## For developers

- Code: `agent/src`. `zk-protocol.ts` is the device protocol (packets, frames, records), `zk-client.ts` the TCP client, `byteam.ts` the byTeam side, `agent.ts` the cycle, `main.ts` the program. Tests in `tests/agent` run against a fake device (`tests/agent/fake-device.ts`) that answers in one packet or in pieces, a few bytes at a time, with each record layout and with a comm key. `tests/db/office-agent.test.ts` runs the real agent against byTeam's real `/iclock` routes on the test database.
- Build: `npm run agent:build` bundles it into `public/downloads/byteam-agent.js` (one file, no dependencies, Node 18 or later). `npm run build` runs it first, so every deployment serves the matching agent.
- byTeam knows the agent by its `User-Agent: byTeam-agent/<version>`. For those uploads it skips guessing the device clock from punch times (the agent sends them late) and takes the offset the agent measured instead (`clockOffset` on the handshake).
- On a Raspberry Pi or other Linux computer it runs the same way: `node byteam-agent.js --config agent.json` under systemd.
