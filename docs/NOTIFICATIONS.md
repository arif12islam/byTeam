# Push notifications

Free alerts on a phone or computer, even when byTeam is closed. They use the browser's own push services (Apple, Google, Mozilla), so there is nothing to pay for and no account to make.

## What you get

Each device chooses its own, in Settings, Notifications:

- **Fingerprint device offline.** When the device or the office laptop has gone quiet during office hours, once, and a "back" notice when it returns.
- **Morning summary.** Who is in, late, absent or on leave, once each working day at about 10:00.
- **Unknown code punched.** When someone punches with a code that is not linked to an employee, once a day for each code.

Nothing is sent on a holiday or weekly off day (summary) or outside office hours (the earliest shift start to the latest shift end).

## Turn it on

1. **iPhone:** notifications work from the Home Screen app. Open byTeam in Safari, tap Share, then Add to Home Screen, and open byTeam from the new icon. (This needs iOS 16.4 or newer.)
   **Android and computers:** Chrome, Edge and Firefox work in the browser.
2. Sign in, open Settings, find **Notifications** and tap **Turn on notifications on this device**. Allow notifications when asked.
3. Tap **Send a test**. It should appear within a few seconds.

## The scheduler (one-time, free)

byTeam cannot check by itself whether the device has gone quiet, because nothing reaches it while the device is off. A free scheduler has to ask it. Vercel's free plan can only run a job once a day, so use cron-job.org (free, no card):

1. Make an account at https://cron-job.org and choose **Create cronjob**.
2. **URL:** `https://byteam.bykorp.com/api/cron/notify`
3. **Schedule:** every hour, from 08:00 to 19:00, in the **Asia/Dhaka** time zone. (Custom: minutes `5`, hours `8-19`, every day.) The 10:00 run sends the morning summary.
4. Under **Advanced**, add the header `Authorization` with the value `Bearer ` followed by your `CRON_SECRET`. The secret is the `CRON_SECRET` environment variable in the Vercel project; it is the same one the nightly job uses.
5. Save, then use **Test run**. A good answer looks like `{"ok":true, ...}`. A `401` means the header is wrong.

Why hourly: the database on Neon's free plan sleeps when idle, and every check wakes it. An hourly check in office hours costs about 30 hours of the roughly 100 free compute hours a month. A check every 10 minutes would use most of the allowance. On a server whose database never sleeps (the planned VPS), 10 minutes is fine.

Outside 07:00 to 21:00 (office time) a check answers at once without touching the database, so a scheduler left running overnight costs nothing. When no device has notifications on, a check does almost nothing either.

## How it works, for the next person

- `public/sw.js` is the service worker. It shows a push and opens the page when it is tapped. It caches nothing and does not touch normal requests.
- A device's subscription is stored in `push_subscriptions` with its choices. Only addresses of known push services are accepted (`src/lib/notifications/endpoints.ts`), so the server cannot be pointed at other addresses. A device the push service reports as gone is forgotten.
- The server signs pushes with its own VAPID keys. They are made the first time a device turns notifications on and kept in `push_keys`. The private key is never sent to a browser or logged.
- `src/lib/notifications/rules.ts` decides what to say and when (pure, tested). `run.ts` loads the data, sends and remembers what was announced in `notification_state`, so an alert is never sent twice. A send that failed everywhere is not remembered, so the next check tries again.
- `/api/cron/notify` needs the `CRON_SECRET` bearer token, like the nightly job.
- Notification choices are a personal setting, not office data, so they write no audit row.
