# Device setup

How to connect the ZKTeco face and fingerprint device to byTeam while byTeam runs on Vercel at `byteam.bykorp.com`. For the order of the whole pilot and the tests to run, see `docs/PILOT.md`.

The steps in this guide were written from the push (ADMS) protocol and the way byTeam answers it, and tested with the simulator. They have **not** been tried on the real device yet. Menu names differ between models and firmware, so where this guide names a menu, check it against your device and fix the guide. Section 7 lists what to confirm.

## 1. The one thing that decides everything: HTTPS

Vercel only serves HTTPS. A plain HTTP request is answered with a redirect (308) to HTTPS, and attendance devices usually do not follow redirects. I checked this on the live site:

- `https://byteam.bykorp.com/iclock/...` works (TLS 1.3, and Vercel also accepts TLS 1.2).
- `http://byteam.bykorp.com/iclock/...` returns `308 Permanent Redirect`.

So find out which kind of device you have:

| The device menu has | Use |
| --- | --- |
| An HTTPS option for the cloud server (often "Enable HTTPS" or a port of 443) | **Path A**: connect straight to Vercel. |
| Only a server address and port, with no HTTPS option | **Path B**: put a small forwarder on the office network, or move byTeam to a VPS (see section 6). |

Do not guess. Open the device menu first (section 3) and look.

## 2. Before touching the device

1. Sign in to byTeam as the owner or HR and open **Devices**.
2. Add the device with its **serial number** and a name like "Front door". The serial number is printed on the label at the back of the device, or in its menu under System info. Type it exactly, with no spaces. Only listed serial numbers are accepted, so a device that is not listed gets a refusal.
3. Add the employees on the **Employees** screen. The device PIN must equal the employee code, and byTeam sends new employees to the device itself. Face and fingerprint enrollment still happens at the device.
4. Check **Settings** has the weekly off days (Friday and Saturday) and the holidays, and that each employee has the right **shift**. A wrong shift makes people late or absent.

Optional but sensible: rehearse everything with no device. See "Trying the device without hardware" in the README. It works against the live site too:

```
npm run sim -- --url https://byteam.bykorp.com --sn SIM0000001
```

Register `SIM0000001` on the Devices screen first, and switch it off afterwards ("Stop accepting this device").

## 3. Path A: the device speaks HTTPS

On the device, open the menu for the cloud or ADMS server. It is usually under **Comm.** (or **Communication**), then **Cloud server setting** (or **ADMS**). Typical settings:

| Setting | Value |
| --- | --- |
| Server address | `byteam.bykorp.com` |
| Server port | `443` |
| Enable domain name | On, because it is a name and not an IP address |
| HTTPS | On |
| Proxy server | Off |

The device also needs:

- **Internet access.** It talks to Vercel over the internet, so the router must give it a working gateway and DNS. A device on a network with no internet will show as offline.
- **The right date, time and time zone.** Set Asia/Dhaka (UTC+6). byTeam reads every punch time as Dhaka time. See "Clock" below.

Then restart the device or switch the cloud server setting off and on. It sends a first request (the handshake), and byTeam replies with how it should behave:

- send each punch as it happens (real time on),
- ask for commands every 30 seconds,
- upload the attendance log and the operation log,
- after a restart, resend anything it holds (safe: a punch is stored once, however often it is sent).

## 4. Check that it works

1. **Devices screen.** Within about a minute the device should show **Online** with a "Last seen" time that keeps updating.
2. **Clock.** Under the device name the notice should say "Clock looks right" after the first punch. If it says the clock is off by some minutes, set the time on the device. If the gap is whole hours, the device time zone is wrong.
3. **Punch test.** Have an enrolled person punch. They should appear on **Today** within seconds, and on **Attendance** for the day. A punch at a wrong time means a clock problem.
4. **Employee push.** Add a test employee in byTeam. The device should get the new user within about 20 minutes, usually much sooner. The device asks every 30 seconds, but to let the free database sleep, most of those asks are answered without looking at the database (quiet polling, `ADMS_QUIET_MINUTES`).
5. **Unknown code.** Punch with a PIN that has no employee. It appears under "Punches from unknown employee codes" on Devices, and counts automatically once you add an employee with that code.

## 5. When something is wrong

| What you see | Likely cause and what to do |
| --- | --- |
| Device says **Never connected** | It never reached us. Check the device has internet, the address and port, and that HTTPS is on. Check the serial number on Devices matches the label exactly. |
| Device shows **Not accepted** | The device is switched off on the Devices screen. Use "Start accepting this device". |
| The device shows a network or server error and byTeam never sees it | The device is probably sending plain HTTP and getting the redirect. Use Path B. |
| Device went **Offline** | Nothing heard for 45 minutes (15 with quiet polling off). While idle, "Last seen" only moves about every 20 minutes, so up to 20 minutes is normal. Power, Wi-Fi or internet. Punches made meanwhile are kept on the device and arrive when it reconnects, and the days are recomputed. |
| People are late or absent when they were not | Check **Clock** on Devices first. Then check the employee's shift and the weekly off days. If the office had a power cut, record it under Settings, Office outages. |
| Punches arrive in bursts | Normal after an outage: the device sends its backlog. They are stored once each. |
| Everything was fine and now the device gets errors | Look at **Audit log** and the Devices screen. The Vercel dashboard shows runtime errors for the project. A brief database connection timeout makes the server answer with an error, and the device retries on its own, so no punch is lost. |
| The device is blocked for a while | More than 60 requests a minute from one device, or many refused requests from one address, are turned away with "too many requests". A real device sends a few a minute, so something is repeating. Check for a second device with a wrong serial number on the same network. |

## 6. Path B: the device only speaks plain HTTP

Two ways out.

**B1. A small forwarder in the office.** Any always-on computer on the office network (a spare PC, a Raspberry Pi) runs a tiny web server that accepts plain HTTP from the device and passes it on over HTTPS. Point the device at the forwarder's local address and port 80. Example with nginx:

```nginx
server {
    listen 80;

    location /iclock/ {
        proxy_pass https://byteam.bykorp.com;
        proxy_ssl_server_name on;
        proxy_set_header Host byteam.bykorp.com;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_http_version 1.1;
        proxy_read_timeout 30s;
    }
}
```

The device settings become: server address = the forwarder's local IP address (give it a fixed address), port = 80, HTTPS off, domain name off. The forwarder must stay on whenever the device should work, so put it on the same UPS as the device and the router. It carries only punches and commands. Nothing else is exposed.

**B2. Move byTeam to a VPS earlier than planned.** On a VPS the device route can stay plain HTTP while the admin screens use HTTPS (Nginx serves both). That is the plan for production anyway. It is a bigger step than B1.

I recommend B1 for the pilot if the device turns out to be HTTP only.

## 7. Confirm on the real device (not verified yet)

These are the things I could not check without the device. Please check each and update this guide:

- [ ] The real menu names for the cloud server settings, and whether an HTTPS option exists.
- [ ] That the device accepts a domain name and port 443.
- [ ] The real ATTLOG lines. On **Devices**, open **Last lines received** under the device: it shows the last few punch lines exactly as the device sent them, tabs kept, ready to copy. Compare them with what the simulator sends (`scripts/simulator-lib.ts`). If a field order differs, the parser in `src/lib/adms/` needs adjusting. Raw lines are kept, so nothing is lost meanwhile.
- [ ] Which other addresses the firmware calls. Any `/iclock` address the app does not use (for example `/iclock/ping` or `/iclock/registry`), and any upload table other than ATTLOG and OPERLOG (for example ATTPHOTO), is answered `OK` and written to the server log as `[iclock] <serial> ... not used, answered OK`. Read them in the Vercel dashboard under Logs, filtered by `[iclock]`.
- [ ] That the handshake reply (`src/lib/adms/handshake.ts`) is understood: real time on, a poll every 30 seconds, no encryption.
- [ ] Enroll, punch, Wi-Fi off and on, server unreachable and back, and a user push from byTeam.
- [ ] What the device shows when the server answers with an error.
- [ ] Whether the device clock stays right on its own, or drifts (the Clock notice will tell you).

## 8. Good habits for the pilot

- Put the device and the router on a small UPS, so a short power cut does not stop punches.
- Run the old attendance method alongside byTeam for one full month and compare the Attendance grid with it every week. Fix differences in shifts, holidays and leave before the first payroll.
- Do not finalize payroll until the month's attendance has been checked against the old method.
- Keep the Vercel Hobby plan in mind: it is for testing. The device polls about 2,900 times a day, which is small, but plan the move to a VPS before relying on byTeam for real salaries.
