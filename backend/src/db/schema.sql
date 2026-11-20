-- Run Count schema (MySQL 8 / MariaDB 10.5+). Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(30)  NOT NULL COLLATE utf8mb4_unicode_ci,  -- case-insensitive
  password_hash VARCHAR(100) NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS matches (
  seq          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id           VARCHAR(16)  NOT NULL COLLATE ascii_bin,            -- public id, case-sensitive
  owner_id     INT UNSIGNED NOT NULL,
  title        VARCHAR(200) NOT NULL,
  venue        VARCHAR(200) NOT NULL DEFAULT '',
  match_date   VARCHAR(40)  NOT NULL,
  format       VARCHAR(40)  NOT NULL,
  status       ENUM('live','finished') NOT NULL,
  result       VARCHAR(300) NULL,
  summary_json MEDIUMTEXT   NOT NULL,
  state_json   LONGTEXT     NOT NULL,
  version      INT UNSIGNED NOT NULL DEFAULT 1,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (seq),
  UNIQUE KEY uq_matches_id (id),
  KEY idx_matches_status_updated (status, updated_at),
  KEY idx_matches_owner (owner_id),
  CONSTRAINT fk_matches_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
