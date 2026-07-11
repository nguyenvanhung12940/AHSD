import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import os from 'os';

// Determine database path. On Vercel, the root is read-only, so we must use /tmp
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const dbPath = isVercel ? path.join(os.tmpdir(), 'danang_green.db') : 'danang_green.db';

console.log(`[DB] Using database path: ${dbPath}`);
const db = new Database(dbPath);
console.log('[DB] Database connection established.');

export const initDb = () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT, -- 'admin', 'district_manager', 'ward_manager', 'school_manager', 'department_manager', 'environment_department'
      area TEXT, -- e.g., 'Hai Chau', 'Son Tra', 'Hoa Vang'
      organizationName TEXT,
      email TEXT,
      phone TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add columns if they don't exist
  try {
    db.exec("ALTER TABLE users ADD COLUMN organizationName TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  } catch (e) {}

  // Reports table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      mediaUrl TEXT,
      mediaType TEXT,
      latitude REAL,
      longitude REAL,
      userDescription TEXT,
      issueType TEXT,
      description TEXT,
      priority TEXT,
      solution TEXT,
      isIssuePresent INTEGER, -- boolean stored as 0/1
      status TEXT,
      timestamp TEXT,
      area TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    db.exec("ALTER TABLE reports ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  } catch (e) {}

  // Notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      reportId TEXT,
      message TEXT,
      type TEXT, -- 'new_report', 'status_update', 'emergency'
      isRead INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id),
      FOREIGN KEY(reportId) REFERENCES reports(id)
    )
  `);

  // Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      productName TEXT,
      quantity INTEGER,
      address TEXT,
      phone TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);

  // Seed users if empty
  const stmt = db.prepare('SELECT count(*) as count FROM users');
  const result = stmt.get() as { count: number };
  
  if (result.count === 0) {
    const insert = db.prepare('INSERT INTO users (username, password, role, area, organizationName) VALUES (?, ?, ?, ?, ?)');
    const hashedPassword = bcrypt.hashSync('123456', 10);
    
    // Requested Official Accounts
    insert.run('admin@dananggreen.vn', hashedPassword, 'environment_department', 'All', 'Hệ thống Đà Nẵng Green');
    insert.run('quanly@dananggreen.vn', hashedPassword, 'department_manager', 'Hải Châu', 'Ban Quản lý Môi trường');
    insert.run('nguoidan1@gmail.com', hashedPassword, 'citizen', 'Hải Châu', 'Người dân');
    insert.run('nguoidan2@gmail.com', hashedPassword, 'citizen', 'Thanh Khê', 'Người dân');

    // Legacy/Default Accounts
    insert.run('admin', hashedPassword, 'admin', 'All', 'Quản trị viên');
    insert.run('quantrivien', hashedPassword, 'admin', 'All', 'Quản trị viên');
    insert.run('quản trị viên', hashedPassword, 'admin', 'All', 'Quản trị viên');
    console.log('Database seeded with initial users.');
  } else {
    // Ensure the new requested accounts exist even if DB already has data
    const checkUser = db.prepare('SELECT count(*) as count FROM users WHERE username = ?');
    const insert = db.prepare('INSERT INTO users (username, password, role, area, organizationName) VALUES (?, ?, ?, ?, ?)');
    const hashedPassword = bcrypt.hashSync('123456', 10);

    const newUsers = [
      { u: 'admin@dananggreen.vn', r: 'environment_department', a: 'All', o: 'Hệ thống Đà Nẵng Green' },
      { u: 'quanly@dananggreen.vn', r: 'department_manager', a: 'Hải Châu', o: 'Ban Quản lý Môi trường' },
      { u: 'nguoidan1@gmail.com', r: 'citizen', a: 'Hải Châu', o: 'Người dân' },
      { u: 'nguoidan2@gmail.com', r: 'citizen', a: 'Thanh Khê', o: 'Người dân' }
    ];

    newUsers.forEach(user => {
      const exists = checkUser.get(user.u) as { count: number };
      if (exists.count === 0) {
        insert.run(user.u, hashedPassword, user.r, user.a, user.o);
        console.log(`Added requested account: ${user.u}`);
      }
    });
  }
};

export default db;
