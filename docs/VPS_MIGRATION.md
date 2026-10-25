# VPS migration checklist

How to move byTeam from Vercel and Neon to a single VPS. Nothing here is needed while the pilot runs on Vercel. Work through it in order when the time comes, and keep Vercel running until the last step.

The app needs nothing Vercel-specific. On the VPS it runs with `next start` behind Nginx, with PostgreSQL on the same machine.

## 1. Server

- [ ] A small VPS is enough: 1 vCPU, 2 GB RAM, 25 GB disk, Ubuntu 24.04 LTS. Pick a region close to Dhaka (Singapore or Mumbai).
- [ ] A non-root user with sudo, SSH keys only (`PasswordAuthentication no`), and the firewall open only on 22, 80 and 443 (`ufw allow OpenSSH`, `ufw allow 'Nginx Full'`).
- [ ] Automatic security updates (`unattended-upgrades`).
- [ ] The time zone can stay UTC. byTeam uses `Asia/Dhaka` for every office date by itself.

## 2. Software

- [ ] Node.js 24 LTS (from NodeSource or `nvm`), the same major version as on Vercel.
- [ ] PostgreSQL 16 (`apt install postgresql`). Create a database and a user for byTeam. PostgreSQL listens on localhost only.
- [ ] Nginx and Certbot (`apt install nginx certbot python3-certbot-nginx`).

## 3. App

- [ ] Clone the repository into `/srv/byteam`, then `npm ci`.
- [ ] Create `/srv/byteam/.env.local` (owner-readable only, `chmod 600`):

  | Variable | Value |
  | --- | --- |
  | `DATABASE_URL` | `postgres://byteam:<password>@localhost:5432/byteam` |
  | `BETTER_AUTH_SECRET` | the same value as on Vercel, so sessions and stored secrets keep working |
  | `BETTER_AUTH_URL` | `https://byteam.bykorp.com` |
  | `CRON_SECRET` | a new random value (`openssl rand -base64 32`) |
  | `APP_TIMEZONE` | `Asia/Dhaka` |
  | `ADMS_QUIET_MINUTES` | `0`. The local database never sleeps, so commands reach the device within 30 seconds again and Offline goes back to 15 minutes. |

- [ ] `npm run build`, then run it as a systemd service:

  ```ini
  # /etc/systemd/system/byteam.service
  [Unit]
  Description=byTeam
  After=network.target postgresql.service

  [Service]
  User=byteam
  WorkingDirectory=/srv/byteam
  EnvironmentFile=/srv/byteam/.env.local
  ExecStart=/usr/bin/npm run start -- -p 3000 -H 127.0.0.1
  Restart=always

  [Install]
  WantedBy=multi-user.target
  ```

  `systemctl enable --now byteam`. The app listens on localhost only. Nginx is the only way in.

## 4. Nginx: HTTPS for people, plain HTTP for the device

The device may only speak plain HTTP (see `DEVICE_SETUP.md`). Nginx serves `/iclock` on port 80 without a redirect, and sends everything else to HTTPS.

```nginx
# /etc/nginx/sites-available/byteam
server {
    listen 80;
    server_name byteam.bykorp.com;

    # The device. Plain HTTP, no redirect.
    location /iclock/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 5m;
        proxy_read_timeout 30s;
    }

    # People. Always HTTPS.
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name byteam.bykorp.com;
    # ssl_certificate lines are added by certbot

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 5m;
    }
}
```

- [ ] `X-Forwarded-For` is **set to** `$remote_addr`, not appended to. The rate limits read the first address in that header, so this stops a client from choosing its own address.
- [ ] Get the certificate with `certbot --nginx -d byteam.bykorp.com` once DNS points at the VPS (step 7). Until then, test with the VPS IP and plain HTTP.

## 5. Cron

Vercel Cron runs the nightly recalculation at 20:00 UTC (02:00 Dhaka). On the VPS, system cron does the same:

```cron
# crontab -e for the byteam user
0 20 * * * curl -fsS -H "Authorization: Bearer $(grep ^CRON_SECRET= /srv/byteam/.env.local | cut -d= -f2-)" http://127.0.0.1:3000/api/cron/recalc > /dev/null
```

- [ ] Run the curl line once by hand and check the reply says `"ok":true`.

## 6. Backups

- [ ] A daily `pg_dump` kept for 30 days:

  ```bash
  # /etc/cron.daily/byteam-backup
  #!/bin/sh
  set -e
  mkdir -p /var/backups/byteam
  sudo -u postgres pg_dump -Fc byteam > /var/backups/byteam/byteam-$(date +%F).dump
  find /var/backups/byteam -name '*.dump' -mtime +30 -delete
  ```

- [ ] Copy the dumps off the server too (another machine, or object storage), daily. A backup on the same disk is lost with the disk.
- [ ] **Try a restore** once into a scratch database: `pg_restore -d byteam_restore_test <file>`. A backup that has never been restored is not yet a backup.

## 7. Move the data and switch over

Pick a quiet time, like a Friday. The device keeps punches while it cannot reach the server, so nothing is lost during the switch.

1. [ ] Apply migrations to the empty VPS database: `npm run db:migrate`.
2. [ ] Stop changes on Vercel: tell HR not to edit anything for the next hour.
3. [ ] Copy the data from Neon: `pg_dump -Fc --no-owner --no-acl "<Neon direct connection string>" > neon.dump`, then `pg_restore --data-only --disable-triggers -d byteam neon.dump`. Use Neon's **direct** connection string, not the pooled one.
4. [ ] Check the counts match (employees, raw punches, attendance days, payroll runs) between Neon and the VPS.
5. [ ] Point DNS for `byteam.bykorp.com` at the VPS, then run certbot (step 4).
6. [ ] Point the device at the VPS: server address `byteam.bykorp.com`, port 80, HTTPS off. If it went through the office forwarder (Path B1), the forwarder is no longer needed.
7. [ ] Check: sign in, Devices shows Online, a test punch reaches Today, the nightly cron ran the next morning, a backup file exists.
8. [ ] Remove the Vercel cron (or the whole Vercel project) only after a week without problems. Keep the Neon project for a month as a fallback, then delete it.

## 8. Updates later

```bash
cd /srv/byteam && git pull && npm ci && npm run db:migrate && npm run build && sudo systemctl restart byteam
```

Back up first (`/etc/cron.daily/byteam-backup`), and update outside office hours. The device retries on its own during the restart.
