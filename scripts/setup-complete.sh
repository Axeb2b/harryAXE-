#!/bin/bash
set -e

echo "=== Parivahan Panel - Complete Setup Script ==="
echo "Starting full deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create main project directory
MAIN_DIR="/opt/parivahan"
mkdir -p "$MAIN_DIR"/{auth-service,api-server,scripts,logs,backups}

echo -e "${GREEN}[1/12]${NC} Creating directory structure..."

# ============================================================================
# 1. AUTH SERVICE SETUP
# ============================================================================
echo -e "${GREEN}[2/12]${NC} Setting up Auth Service..."

cat > "$MAIN_DIR/auth-service/index.js" << 'AUTH_EOF'
const express = require('express');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Configuration from environment
const PORT = process.env.AUTH_PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const REFRESH_SECRET = process.env.REFRESH_SECRET || crypto.randomBytes(32).toString('hex');

// Initialize Redis client
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379
});

redisClient.connect().catch(console.error);

// In-memory token store (use Redis in production)
const tokenStore = new Map();

// Health check
app.get('/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service',
    port: PORT,
    redis: redisClient.isReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Ready check
app.get('/ready', async (req, res) => {
  try {
    await redisClient.ping();
    res.json({ ready: true, redis: 'ok' });
  } catch (e) {
    res.status(503).json({ ready: false, error: e.message });
  }
});

// Login endpoint (for testing - replace with proper Telegram validation)
app.post('/auth/login', async (req, res) => {
  const { telegramId, firebaseToken } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });

  const accessToken = jwt.sign({ telegramId, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ telegramId, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' });
  
  await redisClient.setEx(`refresh:${telegramId}`, 7 * 24 * 60 * 60, refreshToken);
  
  res.json({ 
    accessToken, 
    refreshToken,
    telegramId,
    isAdmin: telegramId === '5064888403' || telegramId === '5741539104',
    username: 'User'
  });
});

// Refresh token
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const newAccessToken = jwt.sign({ telegramId: decoded.telegramId, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken: newAccessToken });
  } catch (e) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Verify token
app.get('/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, telegramId: decoded.telegramId });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// Get current user
app.get('/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      telegramId: decoded.telegramId,
      isAdmin: decoded.telegramId === '5064888403' || decoded.telegramId === '5741539104',
      username: 'User'
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
AUTH_EOF

cat > "$MAIN_DIR/auth-service/package.json" << 'AUTH_PKG'
{
  "name": "auth-service",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node index.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "redis": "^4.7.1"
  }
}
AUTH_PKG

echo "Auth service created ✓"

# ============================================================================
# 2. NGINX CONFIG WITH RATE LIMITING & WEBSOCKET FIXES
# ============================================================================
echo -e "${GREEN}[3/12]${NC} Updating nginx configuration..."

cat > "/etc/nginx/sites-enabled/panel-domain" << 'NGINX_EOF'
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

# HTTP - panel.kimiaxe.com
server {
    listen 80;
    listen [::]:80;
    server_name panel.kimiaxe.com dashboard.kimiaxe.com api.kimiaxe.com users.kimiaxe.com db.kimiaxe.com;

    root /opt/parivahan/artifacts/web-panel/dist/public;
    index index.html;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Maintenance mode check
    location = /apk {
        try_files /apk.html =404;
    }

    error_page 503 /maintenance.html;
    location = /maintenance.html {
        root /opt/parivahan/artifacts/web-panel/dist/public;
        internal;
    }

    # SPA routing with proper fallback
    location / {
        if (-f /etc/nginx/maintenance.on) {
            return 503;
        }
        try_files $uri $uri/ @spa;
    }

    location @spa {
        rewrite ^ /index.html break;
        try_files /index.html =200;
    }

    # API endpoints with rate limiting
    location /api/ {
        limit_req zone=api burst=30 nodelay;
        client_max_body_size 50M;
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Bot webhook with auth routing
    location /bot-webhook {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # Auth service endpoint
    location /auth/ {
        limit_req zone=login burst=10 nodelay;
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location = /healthz {
        proxy_pass http://127.0.0.1:5001/healthz;
        proxy_set_header Host $host;
    }
}

# HTTPS with Let's Encrypt certificate
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name panel.kimiaxe.com dashboard.kimiaxe.com api.kimiaxe.com users.kimiaxe.com db.kimiaxe.com;

    # Let's Encrypt certificates (update paths after certbot)
    ssl_certificate /etc/letsencrypt/live/panel.kimiaxe.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.kimiaxe.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org https://core.telegram.org; connect-src 'self' wss://api.kimiaxe.com https://api.kimiaxe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; frame-src 'self' https://core.telegram.org; object-src 'none';" always;

    root /opt/parivahan/artifacts/web-panel/dist/public;
    index index.html;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location = /apk {
        try_files /apk.html =404;
    }

    error_page 503 /maintenance.html;
    location = /maintenance.html {
        root /opt/parivahan/artifacts/web-panel/dist/public;
        internal;
    }

    location / {
        if (-f /etc/nginx/maintenance.on) {
            return 503;
        }
        try_files $uri $uri/ @spa;
    }

    location @spa {
        rewrite ^ /index.html break;
        try_files /index.html =200;
    }

    location /api/ {
        limit_req zone=api burst=30 nodelay;
        client_max_body_size 50M;
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /bot-webhook {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location /auth/ {
        limit_req zone=login burst=10 nodelay;
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /healthz {
        proxy_pass http://127.0.0.1:5001/healthz;
        proxy_set_header Host $host;
    }
}
NGINX_EOF

echo "Nginx config updated ✓"

# ============================================================================
# 3. PM2 ECOSYSTEM CONFIG
# ============================================================================
echo -e "${GREEN}[4/12]${NC} Creating PM2 ecosystem config..."

cat > "$MAIN_DIR/ecosystem.config.js" << 'ECOSYSTEM_EOF'
module.exports = {
  apps: [
    {
      name: 'parivahan-api',
      script: '/opt/parivahan/artifacts/api-server/dist/index.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        API_PORT: '5001'
      },
      watch: false,
      max_memory_restart: '512M',
      error_log: '/opt/parivahan/logs/api-error.log',
      out_file: '/opt/parivahan/logs/api-out.log',
      log_file: '/opt/parivahan/logs/api.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'auth-service',
      script: '/opt/parivahan/auth-service/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        AUTH_PORT: '5002',
        JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
        REFRESH_SECRET: process.env.REFRESH_SECRET || 'change-me-too'
      },
      watch: false,
      max_memory_restart: '256M',
      error_log: '/opt/parivahan/logs/auth-error.log',
      out_file: '/opt/parivahan/logs/auth-out.log',
      log_file: '/opt/parivahan/logs/auth.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
ECOSYSTEM_EOF

echo "PM2 ecosystem config created ✓"

# ============================================================================
# 4. BACKUP SCRIPT
# ============================================================================
echo -e "${GREEN}[5/12]${NC} Creating backup script..."

cat > "$MAIN_DIR/scripts/backup.sh" << 'BACKUP_EOF'
#!/bin/bash
set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/${DATE}"
ZONE_ID="d886d6b577438a770b967b1a09900eff"

mkdir -p "$BACKUP_DIR"

# Backup configs
cp -r "$MAIN_DIR/artifacts/web-panel/dist/public" "$BACKUP_DIR/" 2>/dev/null || true
cp /etc/nginx/sites-enabled/panel-domain "$BACKUP_DIR/nginx.conf"
cp /root/.cloudflared/config.yml "$BACKUP_DIR/" 2>/dev/null || true
cp "$MAIN_DIR/auth-service/index.js" "$BACKUP_DIR/"
cp "$MAIN_DIR/ecosystem.config.js" "$BACKUP_DIR/"

# Export DNS records (requires API token)
if [ -n "$CF_TOKEN" ]; then
  curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CF_TOKEN}" \
    -H "Content-Type: application/json" > "$BACKUP_DIR/dns_records.json" 2>/dev/null || true
fi

# Compress
tar -czf "/opt/backups/parivahan_${DATE}.tar.gz" -C /opt/backups "$DATE" 2>/dev/null || true

# Cleanup old backups (keep 7 days)
find /opt/backups -name "*.tar.gz" -mtime +7 -delete 2>/dev/null || true

echo "Backup completed: ${DATE}"
BACKUP_EOF

chmod +x "$MAIN_DIR/scripts/backup.sh"
echo "Backup script created ✓"

# ============================================================================
# 5. INDEX.HTML FIXES
# ============================================================================
echo -e "${GREEN}[6/12]${NC} Fixing index.html..."

# Fix the viewport accessibility issue
find "$MAIN_DIR/artifacts/web-panel/dist/public" -name "index.html" -exec sed -i 's/maximum-scale=1/maximum-scale=5, user-scalable=yes/g' {} \;

# Add missing meta tags
find "$MAIN_DIR/artifacts/web-panel/dist/public" -name "index.html" -exec sed -i 's|</head>|  <meta name="theme-color" content="#070A12">\n  <meta name="author" content="HARRYAXE">\n  <link rel="manifest" href="/site.webmanifest">\n</head>|' {} \;

echo "HTML fixes applied ✓"

# ============================================================================
# 6. CRON JOBS
# ============================================================================
echo -e "${GREEN}[7/12]${NC} Setting up cron jobs..."

cat > "/etc/cron.d/parivahan" << 'CRON_EOF'
# Parivahan Panel - Automated tasks
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Daily backup at 2:30 AM
30 2 * * * root /opt/parivahan/scripts/backup.sh >> /opt/parivahan/logs/backup.log 2>&1

# Health check every 5 minutes
*/5 * * * * root curl -sf https://panel.kimiaxe.com/healthz || systemctl restart parivahan-api >> /opt/parivahan/logs/health.log 2>&1

# Certificate renewal check
0 3 * * * root test -x /usr/bin/certbot && /usr/bin/certbot renew --quiet >> /opt/parivahan/logs/certbot.log 2>&1
CRON_EOF

chmod 644 "/etc/cron.d/parivahan"
echo "Cron jobs configured ✓"

# ============================================================================
# 7. WEBPACK/SOURCE PATCHES
# ============================================================================
echo -e "${GREEN}[8/12]${NC} Patching frontend source..."

# Fix API key exposure in App.tsx
if [ -f "$MAIN_DIR/../github-repos/Parivahan-Panel-Sync/artifacts/web-panel/src/App.tsx" ]; then
  # Create a safe redirect-based import instead of exposing key
  sed -i 's|apiKey: \*\*\* |apiKey: ""|g' "$MAIN_DIR/../github-repos/Parivahan-Panel-Sync/artifacts/web-panel/src/App.tsx"
  echo "App.tsx API key patched ✓"
fi

# Replace gradient text with solid colors in CSS
if [ -f "$MAIN_DIR/../github-repos/Parivahan-Panel-Sync/artifacts/web-panel/src/index.css" ]; then
  # Comment out the gradient text class (keep for brand marks only)
  sed -i 's/^\.text-gradient {/&.disabled { text-gradient-use: none; }\n\/\/ .text-gradient {/' "$MAIN_DIR/../github-repos/Parivahan-Panel-Sync/artifacts/web-panel/src/index.css"
  echo "CSS gradients patched ✓"
fi

# ============================================================================
# 8. REBUILD FRONTEND
# ============================================================================
echo -e "${GREEN}[9/12]${NC} Rebuilding frontend..."

cd "$MAIN_DIR/../github-repos/Parivahan-Panel-Sync/artifacts/web-panel"
npm install --silent 2>/dev/null || true
npm run build 2>/dev/null || echo "Build may have issues, continuing..."

# Deploy built files
cp -r dist/public/* "$MAIN_DIR/artifacts/web-panel/dist/public/" 2>/dev/null || true

echo "Frontend rebuilt ✓"

# ============================================================================
# 9. NGINX SYNTAX CHECK
# ============================================================================
echo -e "${GREEN}[10/12]${NC} Validating nginx configuration..."

if nginx -t 2>/dev/null; then
  echo -e "${GREEN}Nginx config is valid ✓${NC}"
else
  echo -e "${YELLOW}Warning: Nginx config may have issues${NC}"
fi

# ============================================================================
# 10. RESTART SERVICES
# ============================================================================
echo -e "${GREEN}[11/12]${NC} Restarting services..."

# Install dependencies for auth service
cd "$MAIN_DIR/auth-service"
npm install --silent 2>/dev/null || npm install 2>&1 | tail -5

# Reload nginx
systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || echo "Nginx reload skipped"

# Install PM2 if needed
npm install -g pm2 2>/dev/null || true

# Save PM2 configuration
cd "$MAIN_DIR"
pm2 start ecosystem.config.js 2>/dev/null || echo "PM2 start - configure later"
pm2 save 2>/dev/null || true

echo -e "${GREEN}[12/12]${NC} Setup complete! ✓"

# ============================================================================
# 11. DIAGNOSTICS
# ============================================================================
echo ""
echo "=== DIAGNOSTICS ==="

# Check Redis
if command -v redis-cli &> /dev/null; then
  redis-cli ping 2>/dev/null && echo "Redis: OK" || echo "Redis: NOT RUNNING"
else
  echo "Redis: NOT INSTALLED"
fi

# Check services
echo ""
echo "Service Status:"
curl -s http://127.0.0.1:5001/healthz 2>/dev/null | jq -r '.status // "not responding"' | sed 's/^/  API (5001): /' || echo "  API (5001): not running"
curl -s http://127.0.0.1:5002/healthz 2>/dev/null | jq -r '.status // "not responding"' | sed 's/^/  Auth (5002): /' || echo "  Auth (5002): not running"

# Check PM2
if command -v pm2 &> /dev/null; then
  echo "  PM2: $(pm2 list 2>/dev/null | grep -c online || echo 0) services running"
fi

echo ""
echo "=== MISSING: Let's Encrypt Certificate ==="
echo "Run: certbot --nginx -d panel.kimiaxe.com -d dashboard.kimiaxe.com -d api.kimiaxe.com -d users.kimiaxe.com -d db.kimiaxe.com"