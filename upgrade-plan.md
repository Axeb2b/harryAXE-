# Parivahan Panel - Upgrade & Optimization Plan

## Current State Assessment

### Infrastructure
- VPS: Decommissioned (all services stopped)
- Local: Debian 13, 2CPU, 7.8GB RAM
- Web Server: nginx (80/443)
- API: parivahan-api (port 5001)
- Proxy: Cloudflare Tunnel (harryxpanel-local)

### DNS Status (proxied=False)
```
panel.kimiaxe.com      → 188.166.250.216
dashboard.kimiaxe.com  → 188.166.250.216  
api.kimiaxe.com        → 188.166.250.216
users.kimiaxe.com      → 188.166.250.216
db.kimiaxe.com         → 188.166.250.216
```

### Security Issues Identified
1. **Self-signed SSL certificate** - Needs Let's Encrypt
2. **Single API key placeholder** (`***`) found in source
3. **Gradient text overuse** in UI (Design.md notes)
4. **No rate limiting** on API endpoints
5. **No session management** layer

---

## Phase 1: Security & Authentication

### 1.1 JWT/OAuth2 Auth Service

Create new microservice at `/opt/parivahan/auth-service/`:

```javascript
// auth-service/index.js
const jwt = require('jsonwebtoken');
const express = require('express');
const redis = require('redis');

const app = express();
const redisClient = redis.createClient();

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

// Generate tokens
function generateTokens(user) {
  const access = jwt.sign({ ...user, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ ...user, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' });
  return { access, refresh };
}

// Middleware
function authRequired(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 1.2 Redis Layer Setup

Install Redis for caching and sessions:
```bash
apt-get install redis-server
systemctl enable redis-server
systemctl start redis-server
```

Configure Redis persistence and security:
```bash
# /etc/redis/redis.conf
bind 127.0.0.1
protected-mode yes
port 6379
save 900 1
save 300 10
save 60 10000
```

### 1.3 Rate Limiting Service

Create rate limiting middleware:

```javascript
// middleware/rateLimit.js
async function rateLimit(maxRequests = 100, windowMs = 60000) {
  return async (req, res, next) => {
    const key = `rate:${req.user?.id || req.ip}:${req.path}`;
    const count = await redisClient.incr(key);
    
    if (count === 1) {
      await redisClient.expire(key, Math.floor(windowMs / 1000));
    }
    
    if (count > maxRequests) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    res.set('X-RateLimit-Count', count);
    res.set('X-RateLimit-Limit', maxRequests);
    next();
  };
}
```

---

## Phase 2: Backend Modernization

### 2.1 API Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (nginx)                      │
│  Rate Limiting | CORS | Auth Middleware | Request Parsing   │
└──────────┬───────────────────────────────────────┬──────────┘
           │                                       │
┌──────────▼──────────┐               ┌───────────▼──────────┐
│   Auth Service       │               │   Main API Service   │
│   JWT/OAuth2         │◄──────────────┤   Business Logic     │
│   Session Mgmt      │  Token Verif  │   Data Processing    │
└──────────┬──────────┘               └───────────┬──────────┘
           │                                       │
           └────────────────┬──────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                    Redis Cache Layer                     │
│  Sessions | Rate Limits | Hot Data | WebSocket States   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                     Firebase RTDB                         │
│  Device Telemetry | SMS/OTP | User Data | Logs          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Environment Variables

Create `.env` files for services:

```bash
# /opt/parivahan/auth-service/.env
JWT_SECRET=<generate-32-char-secret>
REFRESH_SECRET=<generate-32-char-secret>
REDIS_URL=redis://127.0.0.1:6379
TELEGRAM_BOT_TOKEN=8245670708:AAE0LT...

# /opt/parivahan/api-server/.env
API_PORT=5001
DATABASE_URL=https://<project>-default-rtdb.firebaseio.com
FIREBASE_API_KEY=<from-firebase-console>
```

### 2.3 API Endpoints Structure

```
/api/v2/
├── auth/
│   ├── POST /login (telegram)
│   ├── POST /refresh
│   └── GET /verify
├── users/
│   ├── GET /
│   ├── GET /:id
│   └── PUT /:id
├── devices/
│   ├── GET /
│   ├── GET /:id
│   └── POST /events
├── sms/
│   ├── POST /forward
│   └── GET /history
└── healthz (monitoring)
```

---

## Phase 3: Infrastructure Hardening

### 3.1 PM2 Process Management

```bash
npm install -g pm2

# Create ecosystem.config.js
module.exports = {
  apps: [{
    name: 'parivahan-api',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production' }
  }, {
    name: 'auth-service',
    script: './auth-service/index.js',
    instances: 1,
    exec_mode: 'cluster'
  }]
};

# Start services
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 3.2 Monitoring Endpoints

Add to API service:

```javascript
// metrics.js
app.get('/metrics', (req, res) => {
  const os = require('os');
  res.set('Content-Type', 'text/plain');
  res.send(`
# HELP uptime_seconds Service uptime in seconds
uptime_seconds ${process.uptime()}
# HELP memory_rss_bytes Resident set size
memory_rss_bytes ${process.memoryUsage().rss}
# HELP cpu_usage_percent CPU usage
cpu_usage_percent 0
# HELP active_connections Number of active connections
active_connections ${Object.keys(connections).length}
# HELP request_total Total requests
request_total ${requestCount}
  `);
});
```

### 3.3 Automated Backups

Create backup script `/opt/parivahan/scripts/backup.sh`:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/${DATE}"

mkdir -p ${BACKUP_DIR}

# Backup configs
cp -r /opt/parivahan/artifacts/web-panel/dist/public ${BACKUP_DIR}
cp /etc/nginx/sites-enabled/panel-domain ${BACKUP_DIR}/nginx.conf
cp /root/.cloudflared/config.yml ${BACKUP_DIR}/

# Export DNS zone
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/d886d6b577438a770b967b1a09900eff/dns_records" \
  -H "Authorization: Bearer ${CF_TOKEN}" > ${BACKUP_DIR}/dns_records.json

# Compress
tar -czf /opt/backups/parivahan_${DATE}.tar.gz -C ${BACKUP_DIR} .

# Cleanup old backups (keep 7 days)
find /opt/backups -name "*.tar.gz" -mtime +7 -delete
```

Add to crontab:
```bash
# Daily backup at 2AM
0 2 * * * /opt/parivahan/scripts/backup.sh
```

---

## Phase 4: SSL/TLS Automation

### 4.1 Let's Encrypt Certificate Setup

Once DNS propagates globally:

```bash
# Stop nginx temporarily
systemctl stop nginx

# Get certificate
certbot certonly --standalone \
  -d panel.kimiaxe.com \
  -d dashboard.kimiaxe.com \
  -d api.kimiaxe.com \
  -d users.kimiaxe.com \
  -d db.kimiaxe.com

# Start nginx
systemctl start nginx

# Test auto-renewal
certbot renew --dry-run
```

### 4.2 Automated Renewal Cron

```bash
# Every 12 hours, check renewal
0 */12 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx
```

---

## Phase 5: Frontend UI/UX Improvements

### 5.1 Fix CSS Issues

Replace gradient text in `src/index.css`:

```css
/* Before (per Design.md recommendation) */
.text-gradient {
  background: linear-gradient(100deg, #6D63FF, #16C7F2);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* After - solid color for headings */
.page-title {
  color: #6D63FF; /* Use the primary color */
}
```

### 5.2 Bundle Optimization

Update `vite.config.ts`:

```typescript
rollupOptions: {
  output: {
    manualChunks: {
      vendor: ['react', 'react-dom'],
      radix: ['@radix-ui/react-*'],
      firebase: [], // Inline (avoids empty chunk)
    },
    // Optimize splitting
    chunkFileNames: 'assets/[name]-[hash].js',
    entryFileNames: 'assets/[name]-[hash].js',
  }
}
```

---

## Implementation Timeline

| Week | Tasks |
|------|-------|
| Week 1 | Redis install, Auth service setup, Rate limiting middleware |
| Week 2 | PM2 process management, Monitoring endpoints |
| Week 3 | Let's Encrypt certs, Automated backups cron |
| Week 4 | Frontend optimizations, Bundle tuning |
| Week 5 | Security audit, Load testing |

---

## Quick Commands Reference

```bash
# Reload services after changes
systemctl reload nginx
pm2 reload all

# Check logs
journalctl -u nginx -f
pm2 logs

# Health check
curl https://panel.kimiaxe.com/healthz

# Redis status
redis-cli ping
```

---

## Files Created/Modified

- `/root/upgrade-architecture.html` - Visual architecture diagram
- `/root/upgrade-plan.md` - This upgrade plan
- `/etc/nginx/sites-enabled/panel-domain` - Updated for all subdomains
- `/root/.cloudflared/config.yml` - Tunnel routes configured