import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';

export type Membership = 'basic' | 'plus' | 'pro';
export type EntryKind = 'course' | 'assignment' | 'exam' | 'daily';
export type User = { id: number; email: string; name: string; membership: Membership };
export type Entry = { id: number; kind: EntryKind; title: string; date: string; start: string; end: string; location: string; notes: string; done: number };
export type Holiday = { id?: number; name: string; date: string; source: string };
export type CalendarSettings = { summerDate: string; summerSource: string; holidays: Holiday[] };
export type ServiceTask = { id: number; title: string; due_on: string; instructions: string; status: 'todo' | 'in_progress' | 'completed'; important: number };
export type Lesson = { id: number; subject: string; starts_at: string; ends_at: string; location: string; status: 'scheduled' | 'completed' | 'cancelled' };

const SESSION_KEY = 'studyaboard.current-user';
const CREDENTIAL_PREFIX = 'studyaboard.credential.';

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      membership TEXT NOT NULL DEFAULT 'basic' CHECK(membership IN ('basic','plus','pro')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('course','assignment','exam','daily')),
      title TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      start TEXT NOT NULL DEFAULT '',
      end TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1))
    );
    CREATE INDEX IF NOT EXISTS entries_owner_date ON entries(user_id,date,kind);
    CREATE TABLE IF NOT EXISTS calendar_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      summer_date TEXT NOT NULL DEFAULT '',
      summer_source TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS holidays_owner_date ON holidays(user_id,date);
    CREATE TABLE IF NOT EXISTS service_tasks (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_on TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','completed')),
      important INTEGER NOT NULL DEFAULT 0 CHECK(important IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled'))
    );
    CREATE INDEX IF NOT EXISTS lessons_owner_time ON lessons(user_id,starts_at);
  `);
}

function randomSalt() {
  return Crypto.getRandomBytesAsync(16).then(bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''));
}

async function passwordHash(salt: string, password: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

async function credentialKey(email: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, cleanEmail(email));
  return `${CREDENTIAL_PREFIX}${digest}`;
}

function cleanEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function register(db: SQLiteDatabase, name: string, email: string, password: string): Promise<User> {
  name = name.trim(); email = cleanEmail(email);
  if (!name || name.length > 40) throw new Error('请输入 1–40 个字符的昵称');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('请输入有效邮箱');
  if (password.length < 8 || password.length > 128) throw new Error('密码需要 8–128 个字符');
  const salt = await randomSalt();
  const verifier = await passwordHash(salt, password);
  try {
    const result = await db.runAsync('INSERT INTO users(email,name,salt,password_hash) VALUES(?,?,?,?)', email, name, 'secure-store', 'secure-store');
    try {
      await SecureStore.setItemAsync(await credentialKey(email), JSON.stringify({ salt, verifier }));
    } catch (error) {
      await db.runAsync('DELETE FROM users WHERE id=?', result.lastInsertRowId);
      throw new Error(`系统安全存储不可用：${String(error)}`);
    }
    const user = { id: result.lastInsertRowId, email, name, membership: 'basic' as const };
    await SecureStore.setItemAsync(SESSION_KEY, String(user.id));
    return user;
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) throw new Error('该邮箱已注册');
    throw error;
  }
}

export async function login(db: SQLiteDatabase, email: string, password: string): Promise<User> {
  const row = await db.getFirstAsync<User & { salt: string; password_hash: string }>('SELECT id,email,name,membership,salt,password_hash FROM users WHERE email=? COLLATE NOCASE', cleanEmail(email));
  let salt = row?.salt || 'missing-user'; let expected = row?.password_hash || 'missing-hash';
  if (row?.password_hash === 'secure-store') {
    try {
      const stored = await SecureStore.getItemAsync(await credentialKey(row.email));
      const parsed = stored ? JSON.parse(stored) as { salt?: string; verifier?: string } : null;
      salt = parsed?.salt || 'missing-user'; expected = parsed?.verifier || 'missing-hash';
    } catch (_) {
      salt = 'missing-user'; expected = 'missing-hash';
    }
  }
  const attempted = await passwordHash(salt, password);
  if (!row || attempted !== expected) throw new Error('邮箱或密码不正确');
  const user = { id: row.id, email: row.email, name: row.name, membership: row.membership };
  await SecureStore.setItemAsync(SESSION_KEY, String(user.id));
  return user;
}

export async function restoreSession(db: SQLiteDatabase): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  const user = await db.getFirstAsync<User>('SELECT id,email,name,membership FROM users WHERE id=?', Number(raw));
  if (!user) await SecureStore.deleteItemAsync(SESSION_KEY);
  return user || null;
}

export async function logout() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function getEntries(db: SQLiteDatabase, userId: number) {
  return db.getAllAsync<Entry>('SELECT id,kind,title,date,start,end,location,notes,done FROM entries WHERE user_id=? ORDER BY CASE WHEN date="" THEN 1 ELSE 0 END,date,start,id', userId);
}

export async function createEntry(db: SQLiteDatabase, userId: number, value: Omit<Entry, 'id' | 'done'>) {
  if (!value.title.trim()) throw new Error('请填写标题');
  await db.runAsync('INSERT INTO entries(user_id,kind,title,date,start,end,location,notes) VALUES(?,?,?,?,?,?,?,?)', userId, value.kind, value.title.trim(), value.date, value.start, value.end, value.location.trim(), value.notes.trim());
}

export function setEntryDone(db: SQLiteDatabase, userId: number, id: number, done: boolean) {
  return db.runAsync('UPDATE entries SET done=? WHERE id=? AND user_id=?', done ? 1 : 0, id, userId);
}

export function deleteEntry(db: SQLiteDatabase, userId: number, id: number) {
  return db.runAsync('DELETE FROM entries WHERE id=? AND user_id=?', id, userId);
}

export async function getCalendar(db: SQLiteDatabase, userId: number): Promise<CalendarSettings> {
  const settings = await db.getFirstAsync<{ summer_date: string; summer_source: string }>('SELECT summer_date,summer_source FROM calendar_settings WHERE user_id=?', userId);
  const holidays = await db.getAllAsync<Holiday>('SELECT id,name,date,source FROM holidays WHERE user_id=? ORDER BY date,id', userId);
  return { summerDate: settings?.summer_date || '', summerSource: settings?.summer_source || '', holidays };
}

export async function saveCalendar(db: SQLiteDatabase, userId: number, calendar: CalendarSettings) {
  if (calendar.summerDate && !calendar.summerSource.trim()) throw new Error('请填写暑假日期来源');
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO calendar_settings(user_id,summer_date,summer_source) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET summer_date=excluded.summer_date,summer_source=excluded.summer_source', userId, calendar.summerDate, calendar.summerSource.trim());
    await db.runAsync('DELETE FROM holidays WHERE user_id=?', userId);
    for (const item of calendar.holidays) await db.runAsync('INSERT INTO holidays(user_id,name,date,source) VALUES(?,?,?,?)', userId, item.name.trim(), item.date, item.source.trim());
  });
}

export function getServiceTasks(db: SQLiteDatabase, userId: number) {
  return db.getAllAsync<ServiceTask>('SELECT id,title,due_on,instructions,status,important FROM service_tasks WHERE user_id=? ORDER BY status="completed",important DESC,due_on,id', userId);
}

export async function createServiceTask(db: SQLiteDatabase, userId: number, title: string, dueOn: string, instructions: string, important: boolean) {
  if (!title.trim()) throw new Error('请填写待办标题');
  await db.runAsync('INSERT INTO service_tasks(user_id,title,due_on,instructions,important) VALUES(?,?,?,?,?)', userId, title.trim(), dueOn, instructions.trim(), important ? 1 : 0);
}

export function setServiceTaskStatus(db: SQLiteDatabase, userId: number, id: number, status: ServiceTask['status']) {
  return db.runAsync('UPDATE service_tasks SET status=? WHERE id=? AND user_id=?', status, id, userId);
}

export function getLessons(db: SQLiteDatabase, userId: number) {
  return db.getAllAsync<Lesson>('SELECT id,subject,starts_at,ends_at,location,status FROM lessons WHERE user_id=? ORDER BY starts_at,id', userId);
}

export async function createLesson(db: SQLiteDatabase, userId: number, subject: string, startsAt: string, endsAt: string, location: string) {
  if (!subject.trim() || !startsAt.trim()) throw new Error('请填写课程名称和开始时间');
  await db.runAsync('INSERT INTO lessons(user_id,subject,starts_at,ends_at,location) VALUES(?,?,?,?,?)', userId, subject.trim(), startsAt.trim(), endsAt.trim(), location.trim());
}
