import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db, { initDb } from './database';
import { EnvironmentalReport } from './types';
import { supabase } from './services/supabaseClient';

import dns from 'dns';
import { promisify } from 'util';
import fs from 'fs';
import admin from 'firebase-admin';

// Initialize Firebase Admin
const FIREBASE_ADMIN_PATH = './serviceAccountKey.json';
let firebaseAdminApp: admin.app.App | null = null;

try {
  // Try loading from environment variable first
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    });
    console.log('Firebase Admin: Initialized using environment variable.');
  } 
  // Then try loading from file
  else if (fs.existsSync(FIREBASE_ADMIN_PATH)) {
    firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(fs.readFileSync(FIREBASE_ADMIN_PATH, 'utf8')))
    });
    console.log('Firebase Admin: Initialized using local serviceAccountKey.json.');
  }
} catch (error) {
  console.error('Firebase Admin: Initialization failed:', (error as Error).message);
}

const lookup = promisify(dns.lookup);

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-me';

// Global state for Supabase backoff to avoid log spam on connection errors
let supabaseBackoffUntil = 0;
const SUPABASE_BACKOFF_DURATION = 60000; // 1 minute backoff

const checkSupabaseDns = async (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    await lookup(hostname);
    return true;
  } catch (err) {
    return false;
  }
};

const shouldTrySupabase = () => {
  return !!(supabase && Date.now() > supabaseBackoffUntil);
};

const handleSupabaseError = (error: any, method: string, url: string) => {
  if (!error) return;
  
  // Silence "Table not found" errors as they are expected before initial setup
  const isTableNotFound = error.code === '42P01' || (error.message && error.message.includes('Could not find the table'));
  if (!isTableNotFound) {
    const errorMessage = error.message || String(error);
    
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('fetch failed')) {
      console.warn(`Supabase Connection Error [${method} ${url}]: DNS lookup failed for "${process.env.VITE_SUPABASE_URL}". This usually means the URL is incorrect or the project is deleted. Backing off for 1 min.`);
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_DURATION;
    } else {
      console.warn(`Supabase fetch failed [${method} ${url}]:`, errorMessage);
    }
  }
};

console.log('Starting server.ts...');
try {
  fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Starting server.ts...\n`);
} catch (e) {}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  console.log('Initializing startServer()...');
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Initialize Database
  try {
    console.log('Initializing Database...');
    fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Initializing Database...\n`);
    initDb();
    console.log('Database initialized.');
    fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Database initialized.\n`);
    
    if (process.env.VITE_SUPABASE_URL) {
      const url = process.env.VITE_SUPABASE_URL;
      console.log(`[CONFIG] Supabase URL: ${url}`);
      console.log(`[CONFIG] Supabase Key: ${process.env.VITE_SUPABASE_ANON_KEY ? 'Present' : 'Missing'}`);
      
      if (!url.startsWith('https://')) {
        console.warn('CRITICAL: Supabase URL MUST start with https://');
      }
      if (!url.includes('.supabase.co')) {
        console.warn('CRITICAL: Supabase URL MUST end with .supabase.co');
      }
      if (url.includes('fpgvshoxoxnebouesuct')) {
        console.log('[CONFIG] Using project fpgvshoxoxnebouesuct.');
      }

      // Pre-flight DNS check
      console.log('Starting Supabase DNS check...');
      fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Starting Supabase DNS check...\n`);
      checkSupabaseDns(url).then(isValid => {
        console.log(`Supabase DNS check result: ${isValid}`);
        fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Supabase DNS check result: ${isValid}\n`);
        if (!isValid) {
          console.warn(`CRITICAL: Supabase DNS lookup failed for ${url}. Backing off for 1 min.`);
          supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_DURATION;
        } else {
          console.log('Supabase DNS lookup successful.');
        }
      });
    } else {
      console.log('Supabase URL not configured.');
      fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Supabase URL not configured.\n`);
    }
  } catch (err) {
    console.error('Failed to initialize database:', err);
    fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Failed to initialize database: ${err}\n`);
    process.exit(1);
  }

  console.log('Setting up middleware...');
  fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Setting up middleware...\n`);
  app.use(cors());
  app.use(express.json({ limit: '100mb' })); // Increase limit for base64 images and videos

  // Performance Logging Middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    });
    next();
  });

  // WebSocket handling
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    ws.on('close', () => console.log('Client disconnected'));
  });

  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // Helper: Create notifications for authorities
  const createNotificationsForReport = async (report: any) => {
    try {
      const { id: reportId, area, aiAnalysis, priority } = report;
      const issueType = aiAnalysis?.issueType || report.issueType;
      const reportPriority = aiAnalysis?.priority || report.priority;

      let authorities: any[] = [];

      // Try Supabase first
      if (shouldTrySupabase()) {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('id, username, email, phone')
            .neq('role', 'citizen')
            .or(`area.eq."${area}",area.eq.All`);
          
          if (!error && data) {
            authorities = data;
          } else if (error) {
            handleSupabaseError(error, 'SELECT', 'users');
          }
        } catch (err) {
          handleSupabaseError(err, 'SELECT', 'users');
        }
      }

      // Fallback to SQLite if no authorities found or Supabase failed
      if (authorities.length === 0) {
        authorities = db.prepare(`
          SELECT id, username, email, phone FROM users 
          WHERE role NOT IN ('citizen') 
          AND (area = ? OR area = 'All')
        `).all(area) as any[];
      }

      const message = `Báo cáo mới: ${issueType} tại ${area}. Mức độ ưu tiên: ${reportPriority}.`;

      authorities.forEach(async (auth) => {
        // Save to Supabase if possible
        if (shouldTrySupabase()) {
          try {
            const { error } = await supabase.from('notifications').insert([{
              userId: auth.id,
              reportId,
              message,
              type: 'new_report',
              isRead: 0
            }]);
            if (error) {
              handleSupabaseError(error, 'INSERT', 'notifications');
            }
          } catch (err) {
            handleSupabaseError(err, 'INSERT', 'notifications');
          }
        }

        // Save to SQLite
        try {
          db.prepare(`
            INSERT INTO notifications (userId, reportId, message, type, isRead)
            VALUES (?, ?, ?, ?, 0)
          `).run(auth.id, reportId, message, 'new_report');
        } catch (err) {}
        
        // Real-time notification via WebSocket
        broadcast({ 
          type: 'NEW_NOTIFICATION', 
          userId: auth.id, 
          notification: {
            reportId,
            message,
            type: 'new_report',
            timestamp: new Date().toISOString()
          }
        });

        // Simulate external notification (Email/SMS)
        if (auth.email) {
          console.log(`[SIMULATED EMAIL] To: ${auth.email} | Subject: Sự cố môi trường mới | Body: ${message}`);
        }
        if (auth.phone) {
          console.log(`[SIMULATED SMS] To: ${auth.phone} | Body: ${message}`);
        }
      });
    } catch (error) {
      console.error('Error creating notifications:', error);
    }
  };

  // --- API Routes ---
  
  // Supabase Reset Backoff
  app.post('/api/supabase/reset-backoff', (req, res) => {
    supabaseBackoffUntil = 0;
    console.log('Supabase backoff reset by user.');
    res.json({ message: 'Supabase backoff reset' });
  });

  // Health check for Vercel and Supabase
  app.get('/api/health', async (req, res) => {
    const status: any = {
      server: 'ok',
      sqlite: 'connected',
      supabase: 'not_configured'
    };

    if (supabase) {
      if (Date.now() < supabaseBackoffUntil) {
        status.supabase = 'backing_off';
        status.supabaseError = 'DNS lookup failed recently. Backing off to prevent log spam.';
        status.supabaseAdvice = 'Lỗi kết nối DNS. Vui lòng kiểm tra lại VITE_SUPABASE_URL trong phần Settings và nhấn "Thử lại".';
      } else {
        try {
          const { error } = await supabase.from('reports').select('id').limit(1);
          if (error) {
            status.supabase = 'error';
            status.supabaseError = error.message;
            if (error.message.includes('Could not find the table')) {
              status.supabaseAdvice = 'Bạn cần chạy lệnh SQL để tạo bảng "reports" trên Supabase.';
            } else if (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed')) {
              status.supabaseAdvice = 'Lỗi kết nối DNS. Vui lòng kiểm tra lại VITE_SUPABASE_URL trong phần Settings.';
              supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_DURATION;
            }
          } else {
            status.supabase = 'connected';
          }
        } catch (err: any) {
          status.supabase = 'exception';
          const errMsg = err.message || String(err);
          status.supabaseError = errMsg;
          if (errMsg.includes('ENOTFOUND')) {
            status.supabaseAdvice = 'Không tìm thấy địa chỉ máy chủ Supabase (DNS Error). Kiểm tra lại URL.';
            supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_DURATION;
          }
        }
      }
    }

    res.json(status);
  });

  // Auth Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log(`Login attempt for username: ${username}`);
      
      if (!username || !password) {
        return res.status(400).json({ message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu' });
      }
      
      let user: any = null;

      // Try Supabase first
      if (shouldTrySupabase()) {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
          
          if (!error && data) {
            user = data;
          } else if (error) {
            handleSupabaseError(error, req.method, req.url);
          }
        } catch (err) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      // Fallback to SQLite
      if (!user) {
        user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
      }

      if (!user) {
        console.log(`User not found: ${username}`);
        return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
      }

      if (!bcrypt.compareSync(password, user.password)) {
        console.log(`Invalid password for user: ${username}`);
        return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
      }

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, area: user.area }, JWT_SECRET, { expiresIn: '24h' });
      console.log(`Login successful for user: ${username}`);
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, area: user.area, organizationName: user.organizationName } });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Lỗi hệ thống khi đăng nhập' });
    }
  });

  // Auth Register
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, role, area, organizationName } = req.body;
      
      // Validate input
      if (!username || !password || !role) {
          return res.status(400).json({ 
              message: 'Thiếu thông tin bắt buộc: username, password, role' 
          });
      }

      if (password.length < 8) {
          return res.status(400).json({ 
              message: 'Mật khẩu phải có ít nhất 8 ký tự' 
          });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);

      // Try Supabase first
      if (shouldTrySupabase()) {
        try {
          // Check if user exists in Supabase
          const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .single();
          
          if (checkError && !(checkError.code === 'PGRST116' || checkError.code === '42P01' || checkError.message?.includes('Could not find the table'))) {
            handleSupabaseError(checkError, req.method, req.url);
          }

          if (existingUser) {
            return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại (Supabase)' });
          }

          const { error } = await supabase
            .from('users')
            .insert([{
              username,
              password: hashedPassword,
              role,
              area,
              organizationName,
              status: 'active'
            }]);
          
          if (!error) {
            return res.status(201).json({ message: 'Đăng ký tài khoản thành công (Supabase). Bạn có thể đăng nhập ngay.' });
          }
          
          handleSupabaseError(error, req.method, req.url);
        } catch (err: any) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      // Check if user exists in SQLite
      const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (existingUser) {
        return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại (SQLite)' });
      }

      const stmt = db.prepare(`
        INSERT INTO users (username, password, role, area, organizationName, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(username, hashedPassword, role, area, organizationName, 'active');

      res.status(201).json({ message: 'Đăng ký tài khoản thành công (SQLite). Bạn có thể đăng nhập ngay.' });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Lỗi hệ thống khi đăng ký' });
    }
  });

let supabaseTableErrorLogged = false;

  // Auth Firebase Login (Bridge Firebase Auth with Server JWT)
  app.post('/api/auth/firebase-login', async (req, res) => {
    try {
      const { uid, email, displayName } = req.body;
      
      if (!uid || !email) {
        return res.status(400).json({ message: 'Thiếu thông tin Firebase' });
      }

      // Try to find user in Supabase or SQLite
      let user: any = null;

      if (shouldTrySupabase()) {
        try {
          const { data, error } = await supabase.from('users').select('*').eq('username', email).single();
          if (error && !(error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('Could not find the table'))) {
            handleSupabaseError(error, req.method, req.url);
          }
          user = data;
        } catch (err) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      if (!user) {
        try {
          user = db.prepare('SELECT * FROM users WHERE username = ?').get(email);
        } catch (err) {}
      }

      // If user doesn't exist, create a default citizen record
      if (!user) {
        const defaultRole = 'citizen';
        const defaultArea = 'All';
        const defaultOrg = displayName || 'Người dùng';
        
        if (shouldTrySupabase()) {
          try {
            const { data, error } = await supabase.from('users').insert([{
              username: email,
              password: 'firebase-auth-no-password',
              role: defaultRole,
              area: defaultArea,
              organizationName: defaultOrg,
              status: 'active'
            }]).select().single();
            if (!error) {
              user = data;
            } else if (error) {
              handleSupabaseError(error, req.method, req.url);
            }
          } catch (err) {
            handleSupabaseError(err, req.method, req.url);
          }
        }

        if (!user) {
          try {
            const stmt = db.prepare(`
              INSERT INTO users (username, password, role, area, organizationName, status)
              VALUES (?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(email, 'firebase-auth-no-password', defaultRole, defaultArea, defaultOrg, 'active');
            user = { id: result.lastInsertRowid, username: email, role: defaultRole, area: defaultArea, organizationName: defaultOrg };
          } catch (err) {}
        }
      }

      if (!user) {
        return res.status(500).json({ message: 'Không thể tạo hoặc tìm thấy người dùng' });
      }

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, area: user.area }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, area: user.area, organizationName: user.organizationName } });
    } catch (error) {
      console.error('Firebase login bridge error:', error);
      res.status(500).json({ message: 'Lỗi hệ thống khi đồng bộ Firebase' });
    }
  });

  // Auth Bulk Register
  app.post('/api/auth/bulk-register', async (req, res) => {
    try {
      const { users } = req.body;
      if (!Array.isArray(users)) {
        return res.status(400).json({ message: 'Dữ liệu không hợp lệ. Phải là một mảng người dùng.' });
      }

      console.log(`Bulk registering ${users.length} users...`);
      const results = { success: 0, failed: 0 };

      for (const user of users) {
        const { username, password, role, area, organizationName } = user;
        
        if (!username || !password || !role) {
          results.failed++;
          continue;
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        // Try Supabase first
        if (shouldTrySupabase()) {
          try {
            const { data: existingUser, error: checkError } = await supabase.from('users').select('username').eq('username', username).single();
            if (checkError && !(checkError.code === 'PGRST116' || checkError.code === '42P01' || checkError.message?.includes('Could not find the table'))) {
              handleSupabaseError(checkError, req.method, req.url);
            }
            if (!existingUser) {
              const { error } = await supabase.from('users').insert([{
                username,
                password: hashedPassword,
                role,
                area,
                organizationName,
                status: 'active'
              }]);
              if (!error) {
                results.success++;
                continue;
              } else {
                handleSupabaseError(error, req.method, req.url);
              }
            } else {
              results.failed++; // Already exists
              continue;
            }
          } catch (err) {
            handleSupabaseError(err, req.method, req.url);
          }
        }

        // Fallback to SQLite
        try {
          const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
          if (!existingUser) {
            const stmt = db.prepare(`
              INSERT INTO users (username, password, role, area, organizationName, status)
              VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(username, hashedPassword, role, area, organizationName, 'active');
            results.success++;
          } else {
            results.failed++;
          }
        } catch (err) {
          results.failed++;
        }
      }

      res.json({ message: `Đã nhập thành công ${results.success} người dùng. Thất bại: ${results.failed}`, results });
    } catch (error) {
      console.error('Bulk registration error:', error);
      res.status(500).json({ message: 'Lỗi hệ thống khi nhập người dùng hàng loạt' });
    }
  });

  // Get Reports
  app.get('/api/reports', async (req, res) => {
    console.log(`[${new Date().toISOString()}] GET /api/reports - Request received`);
    try {
      // Try Supabase first if configured and not in backoff
      if (shouldTrySupabase()) {
        try {
          const { data, error } = await supabase
            .from('reports')
            .select('*')
            .order('timestamp', { ascending: false });
          
          if (!error && data) {
            const parsedReports = data.map((r: any) => ({
              ...r,
              isIssuePresent: !!r.isIssuePresent,
              aiAnalysis: {
                issueType: r.issueType,
                description: r.description,
                priority: r.priority,
                solution: r.solution,
                isIssuePresent: !!r.isIssuePresent
              }
            }));
            return res.json(parsedReports);
          }
          
          handleSupabaseError(error, req.method, req.url);
        } catch (err: any) {
          const errMsg = err.message || String(err);
          if (errMsg.includes('ENOTFOUND')) {
            console.warn(`Supabase Connection Error: DNS lookup failed. Backing off for 1 min.`);
            supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_DURATION;
          } else {
            console.error('Supabase unexpected error:', errMsg);
          }
        }
      }

      const reports = db.prepare('SELECT * FROM reports ORDER BY timestamp DESC').all();
      // Parse JSON fields if necessary or boolean conversion
      const parsedReports = reports.map((r: any) => ({
        ...r,
        isIssuePresent: !!r.isIssuePresent,
        aiAnalysis: {
          issueType: r.issueType,
          description: r.description,
          priority: r.priority,
          solution: r.solution,
          isIssuePresent: !!r.isIssuePresent
        }
      }));
      res.json(parsedReports);
    } catch (err) {
      console.error('Error fetching reports:', err);
      res.status(500).json({ message: 'Lỗi khi tải danh sách báo cáo' });
    }
  });

  // Create Report
  app.post('/api/reports', async (req, res) => {
    const report = req.body;
    console.log(`Received report at Lat: ${report.latitude}, Lng: ${report.longitude}`);
    
    // Determine area based on lat/lng using distance-based matching
    const districtCoords: Record<string, { lat: number, lng: number }> = {
      // Đà Nẵng
      'Hải Châu': { lat: 16.0474, lng: 108.2197 },
      'Thanh Khê': { lat: 16.0614, lng: 108.1801 },
      'Sơn Trà': { lat: 16.0911, lng: 108.2616 },
      'Ngũ Hành Sơn': { lat: 16.0025, lng: 108.2492 },
      'Liên Chiểu': { lat: 16.0592, lng: 108.1384 },
      'Cẩm Lệ': { lat: 15.9988, lng: 108.1916 },
      'Hòa Vang': { lat: 15.9867, lng: 108.0671 },
      // Quảng Nam
      'Tam Kỳ': { lat: 15.5647, lng: 108.4811 },
      'Hội An': { lat: 15.8801, lng: 108.3380 },
      'Điện Bàn': { lat: 15.8912, lng: 108.2415 },
      'Đại Lộc': { lat: 15.8854, lng: 108.0054 },
      'Duy Xuyên': { lat: 15.8197, lng: 108.2492 },
      'Thăng Bình': { lat: 15.7412, lng: 108.3715 },
      'Quế Sơn': { lat: 15.6812, lng: 108.1512 },
      'Núi Thành': { lat: 15.4212, lng: 108.6512 },
      'Phú Ninh': { lat: 15.5112, lng: 108.4512 },
      'Tiên Phước': { lat: 15.4812, lng: 108.3112 },
      'Bắc Trà My': { lat: 15.28, lng: 108.23 },
      'Nam Trà My': { lat: 15.05, lng: 108.08 },
      'Phước Sơn': { lat: 15.35, lng: 107.85 },
      'Hiệp Đức': { lat: 15.55, lng: 108.05 },
      'Nông Sơn': { lat: 15.65, lng: 107.95 },
      'Đông Giang': { lat: 15.95, lng: 107.85 },
      'Nam Giang': { lat: 15.65, lng: 107.65 },
      'Tây Giang': { lat: 15.9, lng: 107.45 }
    };

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    let area = 'Hải Châu';
    let minDistance = Infinity;

    Object.entries(districtCoords).forEach(([name, coords]) => {
      const dist = calculateDistance(report.latitude, report.longitude, coords.lat, coords.lng);
      if (dist < minDistance) {
        minDistance = dist;
        area = name;
      }
    });

    const timestamp = new Date().toISOString();

    // Try Supabase first
    if (shouldTrySupabase()) {
      try {
        const { error } = await supabase
          .from('reports')
          .insert([{
            id: report.id,
            mediaUrl: report.mediaUrl,
            mediaType: report.mediaType,
            latitude: report.latitude,
            longitude: report.longitude,
            userDescription: report.userDescription,
            issueType: report.aiAnalysis.issueType,
            description: report.aiAnalysis.description,
            priority: report.aiAnalysis.priority,
            solution: report.aiAnalysis.solution,
            isIssuePresent: report.aiAnalysis.isIssuePresent ? 1 : 0,
            status: report.status,
            timestamp: timestamp,
            area: area
          }]);
        
        if (!error) {
          const fullReport = { ...report, area, timestamp };
          broadcast({ type: 'NEW_REPORT', report: fullReport });
          await createNotificationsForReport(fullReport);
          return res.status(201).json({ message: 'Report created successfully (Supabase)' });
        }
        
        handleSupabaseError(error, req.method, req.url);
      } catch (err: any) {
        handleSupabaseError(err, req.method, req.url);
      }
    }

    const stmt = db.prepare(`
      INSERT INTO reports (id, mediaUrl, mediaType, latitude, longitude, userDescription, issueType, description, priority, solution, isIssuePresent, status, timestamp, area)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        report.id,
        report.mediaUrl,
        report.mediaType,
        report.latitude,
        report.longitude,
        report.userDescription,
        report.aiAnalysis.issueType,
        report.aiAnalysis.description,
        report.aiAnalysis.priority,
        report.aiAnalysis.solution,
        report.aiAnalysis.isIssuePresent ? 1 : 0,
        report.status,
        timestamp,
        area
      );

      // Broadcast new report via WebSocket
      const fullReport = { ...report, area, timestamp };
      broadcast({ type: 'NEW_REPORT', report: fullReport });
      await createNotificationsForReport(fullReport);

      res.status(201).json({ message: 'Report created successfully (SQLite)' });
    } catch (error) {
      console.error('Error saving report:', error);
      res.status(500).json({ message: 'Failed to save report' });
    }
  });

  // Bulk Create Reports
  app.post('/api/reports/bulk', async (req, res) => {
    const { reports } = req.body;
    if (!Array.isArray(reports)) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ. Phải là một mảng báo cáo.' });
    }

    console.log(`Bulk importing ${reports.length} reports...`);
    const timestamp = new Date().toISOString();
    const results = { success: 0, failed: 0 };

    // District coordinates for area matching
    const districtCoords: Record<string, { lat: number, lng: number }> = {
      'Hải Châu': { lat: 16.0474, lng: 108.2197 },
      'Thanh Khê': { lat: 16.0614, lng: 108.1801 },
      'Sơn Trà': { lat: 16.0911, lng: 108.2616 },
      'Ngũ Hành Sơn': { lat: 16.0025, lng: 108.2492 },
      'Liên Chiểu': { lat: 16.0592, lng: 108.1384 },
      'Cẩm Lệ': { lat: 15.9988, lng: 108.1916 },
      'Hòa Vang': { lat: 15.9867, lng: 108.0671 },
      'Tam Kỳ': { lat: 15.5647, lng: 108.4811 },
      'Hội An': { lat: 15.8801, lng: 108.3380 }
    };

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    for (const report of reports) {
      let area = 'Hải Châu';
      let minDistance = Infinity;
      Object.entries(districtCoords).forEach(([name, coords]) => {
        const dist = calculateDistance(report.latitude, report.longitude, coords.lat, coords.lng);
        if (dist < minDistance) {
          minDistance = dist;
          area = name;
        }
      });

      const reportTimestamp = report.timestamp || timestamp;

      // Try Supabase
      if (shouldTrySupabase()) {
        try {
          const { error } = await supabase.from('reports').insert([{
            id: report.id,
            mediaUrl: report.mediaUrl,
            mediaType: report.mediaType,
            latitude: report.latitude,
            longitude: report.longitude,
            userDescription: report.userDescription,
            issueType: report.aiAnalysis.issueType,
            description: report.aiAnalysis.description,
            priority: report.aiAnalysis.priority,
            solution: report.aiAnalysis.solution,
            isIssuePresent: report.aiAnalysis.isIssuePresent ? 1 : 0,
            status: report.status,
            timestamp: reportTimestamp,
            area: area
          }]);
          if (!error) {
            results.success++;
            await createNotificationsForReport({ ...report, area, timestamp: reportTimestamp });
            continue;
          }
          handleSupabaseError(error, req.method, req.url);
        } catch (err: any) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      // Fallback to SQLite
      try {
        const stmt = db.prepare(`
          INSERT INTO reports (id, mediaUrl, mediaType, latitude, longitude, userDescription, issueType, description, priority, solution, isIssuePresent, status, timestamp, area)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          report.id, report.mediaUrl, report.mediaType, report.latitude, report.longitude,
          report.userDescription, report.aiAnalysis.issueType, report.aiAnalysis.description,
          report.aiAnalysis.priority, report.aiAnalysis.solution, report.aiAnalysis.isIssuePresent ? 1 : 0,
          report.status, reportTimestamp, area
        );
        results.success++;
        await createNotificationsForReport({ ...report, area, timestamp: reportTimestamp });
      } catch (err) {
        console.error('SQLite bulk insert error:', err);
        results.failed++;
      }
    }

    broadcast({ type: 'NEW_REPORT' }); // Notify clients to refresh
    res.json({ message: `Đã nhập thành công ${results.success} báo cáo. Thất bại: ${results.failed}`, results });
  });

  // Update Report Status
  app.patch('/api/reports/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    // Try Supabase first
    if (shouldTrySupabase()) {
      try {
        const { error } = await supabase
          .from('reports')
          .update({ status })
          .eq('id', id);
        
        if (!error) {
          broadcast({ type: 'REPORT_UPDATED', id, status });
          return res.json({ message: 'Status updated (Supabase)' });
        }
        
        handleSupabaseError(error, req.method, req.url);
      } catch (err: any) {
        handleSupabaseError(err, req.method, req.url);
      }
    }

    const stmt = db.prepare('UPDATE reports SET status = ? WHERE id = ?');
    const result = stmt.run(status, id);

    if (result.changes > 0) {
      broadcast({ type: 'REPORT_UPDATED', id, status });
      res.json({ message: 'Status updated (SQLite)' });
    } else {
      res.status(404).json({ message: 'Report not found' });
    }
  });

  // External Model Analysis Proxy
  app.post('/api/external-analysis', async (req, res) => {
    const { reportId, data } = req.body;
    const apiUrl = process.env.EXTERNAL_MODEL_API_URL;
    const apiKey = process.env.EXTERNAL_MODEL_API_KEY;

    if (!apiUrl) {
      return res.status(500).json({ message: 'Chưa cấu hình URL cho mô hình bên ngoài' });
    }

    try {
      console.log(`Sending report ${reportId} to external model for analysis...`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ reportId, image_data: data, timestamp: new Date().toISOString() })
      });

      if (!response.ok) throw new Error(`Mô hình ngoài trả về lỗi: ${response.status}`);
      const result = await response.json();
      res.json({ success: true, analysis: result });
    } catch (error: any) {
      console.error('External Model Error:', error);
      res.status(500).json({ message: 'Lỗi khi kết nối với mô hình bên ngoài', error: error.message });
    }
  });

  // Get Notifications
  app.get('/api/notifications', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
      
      const token = authHeader.split(' ')[1];
      if (!token || token === 'null' || token === 'undefined') return res.status(401).json({ message: 'Token missing or invalid' });
      
      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
      }
      
      // Try Supabase first
      if (shouldTrySupabase()) {
        try {
          const { data, error } = await supabase
            .from('notifications')
            .select(`
              *,
              reports (area, issueType, priority)
            `)
            .eq('userId', decoded.id)
            .order('created_at', { ascending: false })
            .limit(50);
          
          if (!error && data) {
            const formatted = data.map((n: any) => ({
              ...n,
              area: n.reports?.area,
              issueType: n.reports?.issueType,
              priority: n.reports?.priority
            }));
            return res.json(formatted);
          } else if (error) {
            handleSupabaseError(error, req.method, req.url);
          }
        } catch (err) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      const notifications = db.prepare(`
        SELECT n.*, r.area, r.issueType, r.priority 
        FROM notifications n
        LEFT JOIN reports r ON n.reportId = r.id
        WHERE n.userId = ?
        ORDER BY n.created_at DESC
        LIMIT 50
      `).all(decoded.id);
      
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi tải thông báo' });
    }
  });

  // Mark Notification as Read
  app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
      const { id } = req.params;

      // Try Supabase
      if (shouldTrySupabase()) {
        try {
          const { error } = await supabase.from('notifications').update({ isRead: 1 }).eq('id', id);
          if (error) handleSupabaseError(error, req.method, req.url);
        } catch (err) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi cập nhật thông báo' });
    }
  });

  // Mark All Notifications as Read
  app.post('/api/notifications/read-all', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
      
      const token = authHeader.split(' ')[1];
      if (!token || token === 'null' || token === 'undefined') return res.status(401).json({ message: 'Token missing or invalid' });

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
      }
      
      // Try Supabase
      if (shouldTrySupabase()) {
        try {
          const { error } = await supabase.from('notifications').update({ isRead: 1 }).eq('userId', decoded.id);
          if (error) handleSupabaseError(error, req.method, req.url);
        } catch (err) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ?').run(decoded.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi cập nhật thông báo' });
    }
  });

  // Get Stats for Dashboard
  app.get('/api/stats', async (req, res) => {
    try {
      // Try Supabase first
      if (shouldTrySupabase()) {
        try {
          const { data: reports, error } = await supabase
            .from('reports')
            .select('priority, status, area, id, issueType, timestamp');
          
          if (!error && reports) {
            const total = reports.length;
            
            const byPriorityMap: Record<string, number> = {};
            const byStatusMap: Record<string, number> = {};
            const byAreaMap: Record<string, number> = {};
            
            reports.forEach(r => {
              byPriorityMap[r.priority] = (byPriorityMap[r.priority] || 0) + 1;
              byStatusMap[r.status] = (byStatusMap[r.status] || 0) + 1;
              byAreaMap[r.area] = (byAreaMap[r.area] || 0) + 1;
            });

            const byPriority = Object.entries(byPriorityMap).map(([priority, count]) => ({ priority, count }));
            const byStatus = Object.entries(byStatusMap).map(([status, count]) => ({ status, count }));
            const byArea = Object.entries(byAreaMap).map(([area, count]) => ({ area, count }));
            const recentActivity = [...reports]
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 5)
              .map(r => ({ id: r.id, issueType: r.issueType, timestamp: r.timestamp, status: r.status }));

            return res.json({
              total,
              byPriority,
              byStatus,
              byArea,
              recentActivity
            });
          }
          
          if (error) handleSupabaseError(error, req.method, req.url);
        } catch (err: any) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      const totalReports = db.prepare('SELECT count(*) as count FROM reports').get() as any;
      const byPriority = db.prepare('SELECT priority, count(*) as count FROM reports GROUP BY priority').all();
      const byStatus = db.prepare('SELECT status, count(*) as count FROM reports GROUP BY status').all();
      const byArea = db.prepare('SELECT area, count(*) as count FROM reports GROUP BY area').all();
      const recentActivity = db.prepare('SELECT id, issueType, timestamp, status FROM reports ORDER BY timestamp DESC LIMIT 5').all();

      res.json({
        total: totalReports.count,
        byPriority,
        byStatus,
        byArea,
        recentActivity
      });
    } catch (err) {
      console.error('Stats error:', err);
      res.status(500).json({ message: 'Lỗi khi tải thống kê' });
    }
  });

  // --- Order Management ---
  app.post('/api/orders', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
      
      const token = authHeader.split(' ')[1];
      if (!token || token === 'null' || token === 'undefined') return res.status(401).json({ message: 'Token missing or invalid' });

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
      }
      
      const { productName, quantity, address, phone } = req.body;

      if (shouldTrySupabase()) {
        try {
          const { data, error } = await supabase
            .from('orders')
            .insert([{
              userId: decoded.id,
              productName,
              quantity,
              address,
              phone,
              status: 'pending'
            }])
            .select()
            .single();
          
          if (!error) {
            return res.status(201).json(data);
          }
          handleSupabaseError(error, req.method, req.url);
        } catch (err) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      // Fallback to SQLite
      try {
        const stmt = db.prepare(`
          INSERT INTO orders (userId, productName, quantity, address, phone, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(decoded.id, productName, quantity, address, phone, 'pending');
        res.status(201).json({ id: result.lastInsertRowid, userId: decoded.id, productName, quantity, address, phone, status: 'pending' });
      } catch (err) {
        console.error('SQLite order error:', err);
        res.status(500).json({ message: 'Lỗi khi tạo đơn hàng' });
      }
    } catch (error) {
      console.error('Order creation error:', error);
      res.status(500).json({ message: 'Lỗi hệ thống khi tạo đơn hàng' });
    }
  });

  app.get('/api/orders', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
      
      const token = authHeader.split(' ')[1];
      if (!token || token === 'null' || token === 'undefined') return res.status(401).json({ message: 'Token missing or invalid' });

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      if (shouldTrySupabase()) {
        try {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('userId', decoded.id)
            .order('created_at', { ascending: false });
          
          if (!error) {
            return res.json(data);
          }
          handleSupabaseError(error, req.method, req.url);
        } catch (err) {
          handleSupabaseError(err, req.method, req.url);
        }
      }

      // Fallback to SQLite
      try {
        const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY created_at DESC').all(decoded.id);
        res.json(orders);
      } catch (err) {
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi tải đơn hàng' });
    }
  });

  // 404 handler for API routes
  app.all('/api/*all', (req, res) => {
    console.warn(`[404] API Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ message: `API route not found: ${req.method} ${req.url}` });
  });

  // API routes... (omitted for brevity)
  
  console.log('[SERVER] API routes initialized.');
  fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] API routes initialized.\n`);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('[VITE] Starting Vite server...');
      fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Starting Vite server...\n`);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('[VITE] Vite server started.');
      fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Vite server started.\n`);
    } catch (viteError) {
      console.error('[VITE] Failed to start Vite server:', viteError);
      fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Failed to start Vite server: ${viteError}\n`);
    }
  } else {
    // Serve static files in production (if needed)
    console.log('[SERVER] Production mode: serving static files from dist');
    app.use(express.static('dist'));
    
    // SPA fallback for production
    app.get('*all', (req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  console.log(`[SERVER] Attempting to listen on port ${PORT}...`);
  try {
    fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Attempting to listen on port ${PORT}\n`);
  } catch (e) {}

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Server running on http://0.0.0.0:${PORT}`);
    try {
      fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] Server running on port ${PORT}\n`);
    } catch (e) {}
  });
  
  server.on('error', (err) => {
    console.error('[SERVER] Server failed to start:', err);
  });

  return app;
}

// Start the server
startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
  try {
    fs.appendFileSync('server-log.txt', `[${new Date().toISOString()}] CRITICAL: Failed to start server: ${err}\n`);
  } catch (e) {}
});
