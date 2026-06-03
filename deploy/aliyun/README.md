# Aliyun ECS Deployment

Target host: `YOUR_ECS_INSTANCE_ID`

This guide is for the first-stage Aliyun ECS + RDS deployment:

- OS: Ubuntu 24.04 LTS, or Ubuntu 22.04 LTS
- Runtime: Node.js 20
- Process manager: PM2
- Web server: Nginx
- Database: Aliyun ApsaraDB RDS for PostgreSQL
- Initial access: public IP over HTTP; later domain and HTTPS can be added

This cloud architecture is the current delivery baseline. First-stage delivery does not include local/on-premise deployment.

## 1. Security Group

Open these inbound ports in the Aliyun console:

- `22/tcp` for SSH
- `80/tcp` for HTTP
- `443/tcp` for later HTTPS

Do not open `3001/tcp`. The backend listens on `127.0.0.1:3001` behind Nginx.

## 2. Install System Packages

SSH into the ECS host, then run:

```bash
sudo apt update
sudo apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v
npm -v
pm2 -v
```

## 3. Clone The Repository

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER":"$USER" /var/www
git clone https://github.com/YOUR_GITHUB_USER/manufacturing-oms-v5.git /var/www/manufacturing-oms-v5
cd /var/www/manufacturing-oms-v5
```

## 4. Configure Environment

Create the backend production env file:

```bash
cp deploy/aliyun/server.env.example backend/.env
nano backend/.env
```

Set:

- `DATABASE_URL` to the Aliyun RDS PostgreSQL URL
- `DATABASE_URL_UNPOOLED` to the same Aliyun RDS PostgreSQL URL
- `FRONTEND_ORIGIN` to `http://YOUR_ECS_PUBLIC_IP`
- `JWT_SECRET` to a random string with at least 32 characters

RDS connection example:

```text
host: RDS_INTERNAL_ENDPOINT
port: 5432
database: manufacturing_oms
sslmode: disable
```

The RDS whitelist must include the ECS private IP (e.g. `YOUR_ECS_PRIVATE_IP/32`).

Recommended data protection:

- Enable RDS disk encryption in the Aliyun console for at-rest database and snapshot protection.
- Enable RDS automatic backups with a 7-day retention period during development/trial operation.
- Keep the manager computer backup task enabled: local LaunchAgent `com.manufacturing-oms.rds-backup` runs `deploy/aliyun/backup-rds-to-desktop.sh` every 7 days and stores backups in `~/Desktop/Database`.

Do not commit `backend/.env`.

## 5. Install And Build

```bash
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run build
npm run build:frontend:safe
```

If the RDS database already has the migrated data, do not run seed.

Apply future schema migrations manually when needed:

```bash
npm --prefix backend run db:deploy
```

## 6. Start Backend With PM2

```bash
sudo mkdir -p /var/log/manufacturing-oms
sudo chown -R "$USER":"$USER" /var/log/manufacturing-oms
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

`pm2 startup systemd` prints a `sudo ...` command. Run that printed command once.

## 7. Configure Nginx

```bash
sudo cp deploy/aliyun/nginx.conf /etc/nginx/sites-available/manufacturing-oms
sudo ln -sf /etc/nginx/sites-available/manufacturing-oms /etc/nginx/sites-enabled/manufacturing-oms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Verify

Replace `YOUR_ECS_PUBLIC_IP` with the public IP from the Aliyun console:

```bash
curl http://YOUR_ECS_PUBLIC_IP/api/health
```

Expected response:

```json
{"status":"ok","time":"..."}
```

Then open:

```text
http://YOUR_ECS_PUBLIC_IP
```

## 9. Update Deployment Later

```bash
cd /var/www/manufacturing-oms-v5
git pull
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run build
npm run build:frontend:safe
npm --prefix backend run db:deploy
pm2 restart manufacturing-oms-api
sudo systemctl reload nginx
```

Do not build the frontend directly into `frontend/dist` on production. The two-step `dist-next` flow keeps
old hashed assets available for users who opened the login page before a deployment and only enter the app
after the new version is live.

Do not place manually managed files directly under `frontend/dist/`; deployment mirrors generated non-asset
files with `rsync --delete`.

## 9.1 Optional Auto Deploy From GitHub

After the server has been switched to `/var/www/manufacturing-oms-v5`, install a cron job that checks GitHub every minute and deploys only when `origin/main` changes:

```bash
chmod +x /var/www/manufacturing-oms-v5/deploy/aliyun/auto-deploy.sh
chmod +x /var/www/manufacturing-oms-v5/deploy/aliyun/build-frontend-safe.sh
chmod +x /var/www/manufacturing-oms-v5/deploy/aliyun/cleanup-assets.sh
crontab -l > /tmp/manufacturing-oms-cron || true
grep -v 'manufacturing-oms-v5/deploy/aliyun/auto-deploy.sh' /tmp/manufacturing-oms-cron > /tmp/manufacturing-oms-cron.new || true
echo '* * * * * APP_ROOT=/var/www/manufacturing-oms-v5 /var/www/manufacturing-oms-v5/deploy/aliyun/auto-deploy.sh >/dev/null 2>&1' >> /tmp/manufacturing-oms-cron.new
crontab /tmp/manufacturing-oms-cron.new
```

Deployment logs are written to:

```text
/var/log/manufacturing-oms/auto-deploy.log
```

## 10. Later Domain And HTTPS

For testing, use the public IP first.

When ready for a domain on a mainland China ECS:

1. Buy or prepare a domain.
2. Complete real-name verification.
3. Complete ICP filing.
4. Point the domain to the ECS public IP.
5. Add the domain to `FRONTEND_ORIGIN`.
6. Configure HTTPS with an Aliyun SSL certificate or Certbot.
