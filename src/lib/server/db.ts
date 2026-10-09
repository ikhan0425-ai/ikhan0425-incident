import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// 업로드 파일이 쌓이는 곳이라 빌드 결과물 추적(tracing)에서 제외한다
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(process.cwd(), "data"));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  nsfw INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS models_user ON models(user_id);
CREATE INDEX IF NOT EXISTS models_created ON models(created_at);

CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY,
  model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_model TEXT NOT NULL,
  trigger_words TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  sha256 TEXT,
  external_url TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS versions_model ON model_versions(model_id);
CREATE INDEX IF NOT EXISTS versions_sha ON model_versions(sha256);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS model_tags (
  model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (model_id, tag_id)
);
CREATE INDEX IF NOT EXISTS model_tags_tag ON model_tags(tag_id);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  version_id INTEGER REFERENCES model_versions(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  thumb_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  dominant_color TEXT,
  prompt TEXT,
  negative_prompt TEXT,
  sampler TEXT,
  scheduler TEXT,
  steps INTEGER,
  cfg_scale REAL,
  seed TEXT,
  clip_skip INTEGER,
  size TEXT,
  gen_model TEXT,
  gen_model_hash TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  meta_source TEXT,
  nsfw INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS images_model ON images(model_id, created_at);
CREATE INDEX IF NOT EXISTS images_version ON images(version_id);
CREATE INDEX IF NOT EXISTS images_user ON images(user_id, created_at);
CREATE INDEX IF NOT EXISTS images_created ON images(created_at);

CREATE TABLE IF NOT EXISTS model_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, model_id)
);
CREATE INDEX IF NOT EXISTS model_likes_model ON model_likes(model_id, created_at);

CREATE TABLE IF NOT EXISTS image_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, image_id)
);
CREATE INDEX IF NOT EXISTS image_likes_image ON image_likes(image_id, created_at);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY,
  model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS downloads_model ON downloads(model_id, created_at);
CREATE INDEX IF NOT EXISTS downloads_version ON downloads(version_id);
`;

function open(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(/*turbopackIgnore: true*/ DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { __db?: Database.Database };

/** DB 는 처음 쿼리할 때 연다 (빌드 중 import 만으로 파일이 생기지 않도록). */
export function getDb(): Database.Database {
  if (!globalForDb.__db) globalForDb.__db = open();
  return globalForDb.__db;
}
