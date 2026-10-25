# Pilot on Vercel

How to run the M7 pilot with byTeam on Vercel Hobby and Neon Free, from switching the device on to the first real payroll. `docs/DEVICE_SETUP.md` covers the device menus. This guide covers the order of things, what to test and when the pilot counts as done.

## 1. Before the device arrives

- [ ] **Employees, shifts, off days and holidays** are entered and checked. The device PIN must equal the employee code.
- [ ] **The device is registered** on the Devices screen with its exact serial number.
- [ ] **Rehearse with the simulator** against the live site (`npm run sim -- --url https://byteam.bykorp.com --sn SIM0000001`, see the README). Switch `SIM0000001` off afterwards.
- [ ] **Know the free plan limits.** They are fine for one office, with two things to keep in mind:
  - **Neon Free** allows about 100 compute hours a month and sleeps after 5 minutes idle. Quiet polling (`ADMS_QUIET_MINUTES`, 20 by default) lets it sleep between device polls. Check usage in the Neon console after the first week. If it is on course to pass the allowance, raise `ADMS_QUIET_MINUTES` in the Vercel project settings (up to 60) or move to a paid Neon plan.
  - **Vercel Hobby** is meant for personal, non-commercial use. It is fine for a test. Before byTeam pays real salaries, move to Vercel Pro or to the VPS (`docs/VPS_MIGRATION.md`).
- [ ] **Backups.** Neon Free keeps only a short restore window. Until the VPS with its daily `pg_dump` exists, download the Attendance and Payroll Excel files at the end of every week.

## 2. Connect the device (replaces the LAN test)

The plan had a LAN test with the app on a laptop. On Vercel the device talks to the live site over the internet instead, so the first test is that connection.

- [ ] Open the device's cloud server menu and find out whether it has an HTTPS option (`DEVICE_SETUP.md` section 1).
- [ ] **HTTPS option:** follow Path A. **No HTTPS option:** set up the forwarder in Path B1.
- [ ] Within a minute the device shows **Online** on the Devices screen.
- [ ] Punch once. On Devices, open **Last lines received** under the device and copy the lines. Send them over so they can be compared with the simulator's format (next section).

## 3. Compare the real lines with the simulator

The parser was written for the common format: PIN, date and time, status and verify method, separated by tabs, with extra fields ignored. For each line copied from **Last lines received**, check:

- [ ] The first field is the PIN and it matches the employee code exactly, including any leading zeros (`0001` and `1` are different codes).
- [ ] The time is the moment of the punch in Dhaka time.
- [ ] The punch shows on **Today** and on **Attendance** for the right person and day.

Also read the server log in the Vercel dashboard (Logs, search `[iclock]`). Lines ending in `not used, answered OK` name addresses or upload tables the firmware uses that byTeam ignores. If any of them carry punches, the parser needs a change before the pilot goes on.

## 4. Behaviour tests

Do each one, then check the result where the table says.

| Test | How | Expected | Where to look |
| --- | --- | --- | --- |
| Enroll | Enroll a test person's face or finger on the device under an employee code that exists in byTeam | Their punches count for that employee | Today |
| Punch | Punch normally | Appears within seconds | Today |
| Unknown code | Punch with a code that is not an employee | Listed under "Punches from unknown employee codes" | Devices |
| Wi-Fi off and on | Unplug the router's internet for 10 minutes, punch twice, plug it back | Both punches arrive after reconnecting, once each | Today, Attendance |
| Server unreachable | Switch the device off on the Devices screen ("Stop accepting"), punch, switch it back on | The punch arrives once the device is accepted again | Today |
| User push | Add a test employee in byTeam | The person appears on the device within about 20 minutes | Device user list |
| Restart | Power the device off and on | Online again, no duplicate punches | Devices, Attendance |
| Clock | Look at the Clock notice after a few punches | "Clock looks right" | Devices |

Write down anything unexpected, with the time it happened, and check `DEVICE_SETUP.md` section 5 first.

## 5. Power

- [ ] Put the device and the router (and the forwarder, if there is one) on a small DC UPS. Test it by switching the mains off for a minute while someone punches.

## 6. One month in parallel

Keep the current attendance method running for one full calendar month next to byTeam.

- [ ] **Every week:** download the Attendance Excel for the week and compare it with the current method, person by person. For each difference, find the cause: a missed punch, a wrong shift, a holiday not entered, leave not recorded, or a real problem in byTeam.
- [ ] **Fix the inputs, not the results.** Correct shifts, holidays and leave at the source. Correct a day by hand on Attendance only when the punches really are wrong (someone forgot to punch). Each hand correction is in the audit log.
- [ ] **End of month:** run payroll in byTeam and compare every net pay with the current method's salary sheet. Do not finalize until they match or every difference is explained.

## 7. Done when

One real month of attendance and payroll matches the current method, with no hand corrections beyond genuine ones (forgotten punches and the like). Then tick the M7 items in `docs/BUILD_PLAN.md` and plan the move to the VPS.
