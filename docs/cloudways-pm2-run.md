# Cloudways PM2 Runbook

Project path on Cloudways:

```bash
/home/master/Mobile-Messenger-IOS/server
```

## 1. Update code

```bash
cd /home/master/Mobile-Messenger-IOS
git pull
cd /home/master/Mobile-Messenger-IOS/server
```

## 2. Verify production env

Required values in `/home/master/Mobile-Messenger-IOS/server/.env`:

- `NODE_ENV=production`
- `PORT=3001`
- `DATABASE_URL=<Supabase PostgreSQL URL>`
- `DB_SYNCHRONIZE=false`
- `JWT_SECRET_KEY`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ADMIN_LOGIN`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`
- `ADMIN_JWT_EXPIRES_IN`

Quick check:

```bash
cd /home/master/Mobile-Messenger-IOS/server
grep -E '^(NODE_ENV|PORT|DATABASE_URL|DB_SYNCHRONIZE|JWT_SECRET_KEY|JWT_SECRET|JWT_EXPIRES_IN|ADMIN_LOGIN|ADMIN_PASSWORD|ADMIN_DISPLAY_NAME|ADMIN_JWT_EXPIRES_IN)=' .env
```

Do not commit `.env` to GitHub.

## 3. Install dependencies

```bash
cd /home/master/Mobile-Messenger-IOS/server
npm install
```

## 4. Build backend

```bash
cd /home/master/Mobile-Messenger-IOS/server
npm run build
```

## 5. Run migrations

```bash
cd /home/master/Mobile-Messenger-IOS/server
npm run migration:run
```

## 6. Local process check

```bash
cd /home/master/Mobile-Messenger-IOS/server
npm start
```

If the app starts correctly, stop it with `Ctrl+C` and continue with PM2.

## 7. PM2 start or restart

Check current process:

```bash
pm2 status
pm2 logs messenger-backend --lines 100
```

If `messenger-backend` already exists and must be recreated:

```bash
cd /home/master/Mobile-Messenger-IOS/server
pm2 delete messenger-backend
pm2 start dist/main.js --name messenger-backend --update-env
pm2 save
```

If you want to use the repo PM2 config instead:

```bash
cd /home/master/Mobile-Messenger-IOS/server
pm2 delete messenger-backend
pm2 start ecosystem.config.js --only messenger-backend --update-env
pm2 save
```

## 8. Check PM2 and port

```bash
pm2 status
ss -ltnp | grep 3001
```

## 9. Check internal endpoints

```bash
curl -i http://127.0.0.1:3001/api/health
curl -i http://127.0.0.1:3001/api/version
```

## 10. Check public endpoints

```bash
curl -i https://phpstack-1634854-6489525.cloudwaysapps.com/api/health
curl -i https://phpstack-1634854-6489525.cloudwaysapps.com/api/version
```

## 11. Check WebSocket proxy

Basic handshake check:

```bash
curl --http1.1 -i -N \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://phpstack-1634854-6489525.cloudwaysapps.com/realtime
```

Expected result: `HTTP/1.1 101 Switching Protocols`.

## 12. Logs

```bash
pm2 logs messenger-backend --lines 100
tail -n 100 /home/master/Mobile-Messenger-IOS/server/logs/app.log
tail -n 100 /home/master/Mobile-Messenger-IOS/server/logs/errors.log
```

## 13. Restore after reboot

```bash
pm2 startup
pm2 save
```

If `pm2 startup` requires elevated rights or Cloudways blocks system startup registration, do not force it. Ask Cloudways support to confirm how PM2 services should be restored after reboot on this stack.
