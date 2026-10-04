-- ThaiDataCorp — MySQL / MariaDB schema
-- รัน: npm run db:migrate   (idempotent — รันซ้ำได้)

-- นิติบุคคล 1 แถวต่อ 1 เลขทะเบียน (รวมข้อมูลชุด "ตั้งใหม่" กับ "เลิก" ไว้ด้วยกัน)
CREATE TABLE IF NOT EXISTS juristic (
  id                    CHAR(13)      NOT NULL,
  name_th               VARCHAR(500)  NOT NULL COMMENT 'ชื่อเต็ม เช่น บริษัท ตัวอย่าง จำกัด',
  name_raw              VARCHAR(500)  NOT NULL COMMENT 'ชื่อตามต้นฉบับ เช่น บจ.ตัวอย่าง จำกัด',
  juristic_type         VARCHAR(64)   NOT NULL,
  register_date         DATE          NULL,
  dissolved_date        DATE          NULL,
  register_capital      DECIMAL(20,2) NOT NULL DEFAULT 0,
  tsic_code             CHAR(5)       NULL,
  objective             TEXT          NULL,
  address_line          VARCHAR(1000) NULL,
  sub_district          VARCHAR(128)  NULL,
  district              VARCHAR(128)  NULL,
  province              VARCHAR(128)  NULL,
  post_code             CHAR(5)       NULL,
  new_resource_id       CHAR(36)      NULL COMMENT 'resource ของชุดตั้งใหม่ที่พบ',
  dissolved_resource_id CHAR(36)      NULL COMMENT 'resource ของชุดเลิกที่พบ',
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_register_date (register_date),
  KEY idx_dissolved_date (dissolved_date),
  KEY idx_province (province, register_date),
  KEY idx_tsic (tsic_code, register_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สถานะการ sync ของแต่ละ resource รายเดือน (ใช้ข้าม resource ที่ไม่เปลี่ยน)
CREATE TABLE IF NOT EXISTS sync_resource (
  resource_id     CHAR(36)     NOT NULL,
  dataset         VARCHAR(64)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  year_be         SMALLINT     NULL,
  month           TINYINT      NULL,
  source_modified VARCHAR(40)  NULL,
  row_count       INT          NOT NULL DEFAULT 0,
  synced_at       DATETIME     NOT NULL,
  PRIMARY KEY (resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v2: ข้อมูลจาก DBD Open API (ชื่ออังกฤษ, สถานะล่าสุด) + ที่มาของข้อมูล
ALTER TABLE juristic
  ADD COLUMN IF NOT EXISTS name_en        VARCHAR(500) NULL AFTER name_raw,
  ADD COLUMN IF NOT EXISTS status_text    VARCHAR(64)  NULL COMMENT 'สถานะล่าสุดจาก DBD Open API' AFTER juristic_type,
  ADD COLUMN IF NOT EXISTS source         VARCHAR(16)  NOT NULL DEFAULT 'opend' COMMENT 'opend | dbd' AFTER post_code,
  ADD COLUMN IF NOT EXISTS dbd_fetched_at DATETIME     NULL COMMENT 'ดึงจาก DBD Open API ล่าสุดเมื่อ' AFTER source;

-- v3: กรรมการ / ผู้ถือหุ้น / งบการเงิน (จากเจ้าของบริษัท หรือแหล่งที่มีสิทธิ์ เช่น BDEX ในอนาคต)
ALTER TABLE juristic
  ADD COLUMN IF NOT EXISTS authorized_signatory TEXT        NULL COMMENT 'อำนาจกรรมการ' AFTER objective,
  ADD COLUMN IF NOT EXISTS business_size        VARCHAR(8)  NULL COMMENT 'S / M / L' AFTER authorized_signatory;

CREATE TABLE IF NOT EXISTS juristic_director (
  juristic_id CHAR(13)     NOT NULL,
  seq         SMALLINT     NOT NULL,
  name        VARCHAR(255) NOT NULL,
  position    VARCHAR(128) NULL,
  source      VARCHAR(16)  NOT NULL DEFAULT 'manual' COMMENT 'manual | bdex',
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (juristic_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS juristic_shareholder (
  juristic_id CHAR(13)      NOT NULL,
  seq         SMALLINT      NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  nationality VARCHAR(64)   NULL,
  shares      BIGINT        NOT NULL DEFAULT 0,
  percent     DECIMAL(7,4)  NOT NULL DEFAULT 0,
  source      VARCHAR(16)   NOT NULL DEFAULT 'manual',
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (juristic_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS juristic_financial (
  juristic_id       CHAR(13)      NOT NULL,
  fiscal_year       SMALLINT      NOT NULL COMMENT 'ปี ค.ศ.',
  total_revenue     DECIMAL(20,2) NOT NULL DEFAULT 0,
  net_profit        DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_assets      DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_liabilities DECIMAL(20,2) NULL,
  equity            DECIMAL(20,2) NULL,
  source            VARCHAR(16)   NOT NULL DEFAULT 'manual',
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (juristic_id, fiscal_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v4: รหัส TSIC 2552 ทางการ (สำนักงานสถิติแห่งชาติ) สำหรับชื่อหมวด + หน้า pSEO ตามประเภทธุรกิจ
CREATE TABLE IF NOT EXISTS tsic (
  code        VARCHAR(5)   NOT NULL COMMENT 'A–U หรือรหัส 2–5 หลัก',
  level       TINYINT      NOT NULL COMMENT '1=หมวดใหญ่ 2=หมวดย่อย 3=หมู่ใหญ่ 4=หมู่ย่อย 5=กิจกรรม',
  name_th     VARCHAR(500) NOT NULL,
  section     CHAR(1)      NOT NULL COMMENT 'หมวดใหญ่ที่สังกัด',
  parent_code VARCHAR(5)   NULL,
  PRIMARY KEY (code),
  KEY idx_parent (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE juristic ADD INDEX IF NOT EXISTS idx_tsic_province (tsic_code, province, register_date);

-- v5: สัญญาจัดซื้อจัดจ้างภาครัฐ (e-GP, สพร. / data.go.th, CC-BY) — เก็บเฉพาะผู้ชนะที่เป็นนิติบุคคล
CREATE TABLE IF NOT EXISTS procurement_contract (
  fiscal_year     SMALLINT      NOT NULL COMMENT 'ปีงบประมาณ พ.ศ.',
  seq             INT           NOT NULL COMMENT 'ลำดับในชุดข้อมูลปีนั้น (ใช้เป็น key ให้ sync ซ้ำได้)',
  project_id      BIGINT        NULL,
  project_name    VARCHAR(500)  NOT NULL,
  project_type    VARCHAR(64)   NULL,
  agency          VARCHAR(255)  NULL,
  sub_agency      VARCHAR(255)  NULL,
  method          VARCHAR(128)  NULL,
  budget          DECIMAL(18,2) NULL,
  ref_price       DECIMAL(18,2) NULL,
  agreed_price    DECIMAL(18,2) NULL,
  province        VARCHAR(64)   NULL,
  district        VARCHAR(128)  NULL,
  project_status  VARCHAR(64)   NULL,
  lat             DECIMAL(9,6)  NULL,
  lon             DECIMAL(9,6)  NULL,
  winner_id       CHAR(13)      NOT NULL,
  winner_name     VARCHAR(255)  NULL,
  contract_no     VARCHAR(128)  NULL,
  sign_date       DATE          NULL,
  end_date        DATE          NULL,
  contract_value  DECIMAL(18,2) NULL,
  contract_status VARCHAR(64)   NULL,
  PRIMARY KEY (fiscal_year, seq),
  KEY idx_winner (winner_id, sign_date),
  KEY idx_agency (agency(100), fiscal_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=COMPRESSED;

-- สรุปต่อบริษัท (สร้างใหม่หลัง sync) — ใช้แสดงผลเร็ว + จัดอันดับ
CREATE TABLE IF NOT EXISTS procurement_summary (
  winner_id      CHAR(13)      NOT NULL,
  contracts      INT           NOT NULL,
  total_value    DECIMAL(20,2) NOT NULL,
  agencies       INT           NOT NULL,
  first_sign     DATE          NULL,
  last_sign      DATE          NULL,
  PRIMARY KEY (winner_id),
  KEY idx_value (total_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v6: บันทึกการดึง DBD Open API (กันยิงซ้ำเลขที่ไม่พบ / ใช้ติดตามความคืบหน้า backfill)
CREATE TABLE IF NOT EXISTS dbd_fetch_log (
  id         CHAR(13)    NOT NULL,
  status     VARCHAR(16) NOT NULL COMMENT 'found | not_found | error',
  fetched_at DATETIME    NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v7: ตารางสรุปสำหรับหน้าหน่วยงาน / จัดอันดับ (สร้างใหม่หลัง sync:egp) + index ที่อยู่สำหรับ "บริษัทที่อยู่เดียวกัน"
CREATE TABLE IF NOT EXISTS procurement_agency_summary (
  agency         VARCHAR(255)  NOT NULL,
  contracts      INT           NOT NULL,
  total_value    DECIMAL(20,2) NOT NULL,
  winners        INT           NOT NULL,
  ebid_contracts INT           NOT NULL COMMENT 'จำนวนสัญญาวิธี e-bidding / ประกวดราคา',
  top_province   VARCHAR(64)   NULL,
  PRIMARY KEY (agency),
  KEY idx_value (total_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS procurement_province_winner (
  province    VARCHAR(64)   NOT NULL,
  winner_id   CHAR(13)      NOT NULL,
  contracts   INT           NOT NULL,
  total_value DECIMAL(20,2) NOT NULL,
  PRIMARY KEY (province, winner_id),
  KEY idx_rank (province, total_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE juristic ADD INDEX IF NOT EXISTS idx_address (province, sub_district, address_line(120));

-- v8: เก็บชื่อผู้ชนะในตารางสรุป (กันหน้าอันดับต้อง scan สัญญาทั้งหมดเพื่อหาชื่อ)
ALTER TABLE procurement_summary ADD COLUMN IF NOT EXISTS winner_name VARCHAR(255) NULL AFTER winner_id;

-- v9: สมาชิก / เข้าสู่ระบบด้วยลิงก์อีเมล / ติดตาม / แจ้งเตือน / ชำระเงิน (PromptPay)
CREATE TABLE IF NOT EXISTS app_user (
  id              INT          NOT NULL AUTO_INCREMENT,
  email           VARCHAR(255) NOT NULL,
  plan            VARCHAR(16)  NOT NULL DEFAULT 'free' COMMENT 'free | pro | business',
  plan_expires_at DATETIME     NULL,
  last_alert_at   DATETIME     NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_token (
  token_hash CHAR(64)     NOT NULL,
  email      VARCHAR(255) NOT NULL,
  next_path  VARCHAR(255) NULL,
  expires_at DATETIME     NOT NULL,
  used_at    DATETIME     NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_session (
  id_hash    CHAR(64)  NOT NULL,
  user_id    INT       NOT NULL,
  expires_at DATETIME  NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_hash),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_watch (
  user_id    INT          NOT NULL,
  kind       VARCHAR(16)  NOT NULL COMMENT 'company | agency',
  target     VARCHAR(255) NOT NULL COMMENT 'เลขทะเบียน หรือชื่อหน่วยงาน',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, kind, target)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_search (
  id         INT         NOT NULL AUTO_INCREMENT,
  user_id    INT         NOT NULL,
  tsic_code  CHAR(5)     NULL,
  province   VARCHAR(64) NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_order (
  id         INT           NOT NULL AUTO_INCREMENT,
  ref        VARCHAR(16)   NOT NULL COMMENT 'รหัสอ้างอิงให้ลูกค้าใส่ในบันทึกการโอน',
  user_id    INT           NOT NULL,
  plan       VARCHAR(16)   NOT NULL,
  months     TINYINT       NOT NULL DEFAULT 1,
  amount     DECIMAL(10,2) NOT NULL,
  status     VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT 'pending | submitted | paid | cancelled',
  payer_note VARCHAR(255)  NULL COMMENT 'ข้อมูลการโอนที่ลูกค้าแจ้ง',
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at    DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ref (ref),
  KEY idx_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- วันที่ระบบเห็นสัญญาครั้งแรก (ใช้หา "สัญญาใหม่" สำหรับแจ้งเตือน) — แถวเดิมทั้งหมดได้ค่าเวลาที่ migrate
ALTER TABLE procurement_contract ADD COLUMN IF NOT EXISTS first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- (ทำครั้งเดียวหลังเพิ่มคอลัมน์: UPDATE procurement_contract SET first_seen_at = '2025-10-01' — กันแจ้งเตือนสัญญาเก่าว่าเป็นของใหม่)

-- v10: ระบบหลังบ้าน — ตารางงาน (cron) / ประวัติการรัน / แพ็กเกจใน DB / การตั้งค่า
CREATE TABLE IF NOT EXISTS job_schedule (
  job_key      VARCHAR(32)  NOT NULL,
  enabled      TINYINT(1)   NOT NULL DEFAULT 0,
  cron         VARCHAR(64)  NOT NULL COMMENT 'cron 5 ช่อง เวลาไทย (Asia/Bangkok)',
  args         VARCHAR(255) NULL COMMENT 'argument เพิ่มเติม เช่น --limit=3000',
  next_run_at  DATETIME     NULL,
  requested_at DATETIME     NULL COMMENT 'ผู้ดูแลกด "รันตอนนี้" (รอ tick ถัดไป)',
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (job_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_run (
  id          INT          NOT NULL AUTO_INCREMENT,
  job_key     VARCHAR(32)  NOT NULL,
  trigger_by  VARCHAR(64)  NOT NULL COMMENT 'schedule | manual:<email>',
  args        VARCHAR(255) NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'running' COMMENT 'running | success | failed | stale',
  exit_code   INT          NULL,
  pid         INT          NULL,
  log         MEDIUMTEXT   NULL,
  started_at  DATETIME     NOT NULL,
  heartbeat_at DATETIME    NULL,
  finished_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_job (job_key, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan (
  id                 VARCHAR(16)  NOT NULL,
  name               VARCHAR(64)  NOT NULL,
  price              INT          NOT NULL DEFAULT 0 COMMENT 'บาท/เดือน',
  max_watches        INT          NOT NULL DEFAULT 3,
  max_saved_searches INT          NOT NULL DEFAULT 1,
  alert_every_days   INT          NOT NULL DEFAULT 7,
  export_rows        INT          NOT NULL DEFAULT 0,
  export_contracts   TINYINT(1)   NOT NULL DEFAULT 0,
  features           TEXT         NULL COMMENT 'บรรทัดละ 1 ข้อ',
  active             TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'แสดงในหน้าราคา / ซื้อได้',
  sort               INT          NOT NULL DEFAULT 0,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_setting (
  k          VARCHAR(64)  NOT NULL,
  v          TEXT         NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ค่าเริ่มต้นของตารางงาน (ปิดไว้ก่อน — เปิดใช้จากหน้า /admin/jobs)
INSERT IGNORE INTO job_schedule (job_key, enabled, cron, args) VALUES
  ('sync-opend',  0, '0 2 * * *',    NULL),
  ('sync-egp',    0, '0 3 * * 1',    NULL),
  ('egp-summary', 0, '30 4 * * 1',   NULL),
  ('backfill-dbd',0, '15 * * * *',   '--limit=3000'),
  ('alerts',      0, '0 7 * * *',    NULL);

-- แพ็กเกจเริ่มต้น (แก้ได้จากหน้า /admin/plans)
INSERT IGNORE INTO plan (id, name, price, max_watches, max_saved_searches, alert_every_days, export_rows, export_contracts, features, sort) VALUES
  ('free', 'ฟรี', 0, 3, 1, 7, 0, 0, 'ดูข้อมูลทุกหน้าบนเว็บ\nติดตามบริษัท/หน่วยงานได้ 3 รายการ\nแจ้งเตือนทางอีเมลรายสัปดาห์\nเงื่อนไขแจ้งเตือนบริษัทเปิดใหม่ 1 เงื่อนไข', 0),
  ('pro', 'Pro', 990, 50, 10, 1, 5000, 0, 'ติดตามบริษัท/หน่วยงานได้ 50 รายการ\nแจ้งเตือนทางอีเมลทุกวัน\nเงื่อนไขแจ้งเตือนบริษัทเปิดใหม่ 10 เงื่อนไข\nดาวน์โหลดรายชื่อบริษัทเปิดใหม่เป็น CSV (สูงสุด 5,000 แถว/ไฟล์)', 1),
  ('business', 'Business', 2990, 500, 50, 1, 50000, 1, 'ทุกอย่างใน Pro\nติดตามบริษัท/หน่วยงานได้ 500 รายการ\nดาวน์โหลดสัญญาจัดซื้อจัดจ้างภาครัฐเป็น CSV (ตามบริษัท/หน่วยงาน)\nดาวน์โหลดรายชื่อบริษัทเปิดใหม่ สูงสุด 50,000 แถว/ไฟล์', 2);

-- v11: ทดลองใช้ฟรี (ครั้งเดียวต่อบัญชี)
ALTER TABLE plan ADD COLUMN IF NOT EXISTS trial_days INT NOT NULL DEFAULT 0 COMMENT 'ทดลองใช้ฟรีกี่วัน (0 = ไม่มี)' AFTER price;
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS trial_used_at     DATETIME   NULL COMMENT 'เริ่มทดลองเมื่อ (ใช้สิทธิ์ทดลองแล้ว)',
  ADD COLUMN IF NOT EXISTS trial_plan        VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS on_trial          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = แพ็กเกจปัจจุบันเป็นช่วงทดลอง',
  ADD COLUMN IF NOT EXISTS trial_reminded_at DATETIME   NULL;
-- (ทำครั้งเดียวแล้ว: UPDATE plan SET trial_days = 7 WHERE id IN ('pro','business') — แก้ต่อได้ที่ /admin/plans)

-- v12: เข้าสู่ระบบด้วย Facebook (และผู้ให้บริการอื่นในอนาคต) เชื่อมกับบัญชีอีเมลเดียวกัน
CREATE TABLE IF NOT EXISTS user_identity (
  provider     VARCHAR(16)  NOT NULL COMMENT 'facebook',
  provider_uid VARCHAR(64)  NOT NULL COMMENT 'id ของผู้ใช้ในระบบนั้น (app-scoped id)',
  user_id      INT          NOT NULL,
  email        VARCHAR(255) NULL COMMENT 'อีเมลที่ผู้ให้บริการส่งมา (ถ้ามี)',
  name         VARCHAR(255) NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_uid),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บัญชี Facebook ที่ไม่ให้อีเมล → รอผู้ใช้ยืนยันอีเมลก่อนเชื่อม
CREATE TABLE IF NOT EXISTS oauth_pending (
  token_hash   CHAR(64)     NOT NULL,
  provider     VARCHAR(16)  NOT NULL,
  provider_uid VARCHAR(64)  NOT NULL,
  name         VARCHAR(255) NULL,
  expires_at   DATETIME     NOT NULL,
  PRIMARY KEY (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE auth_token ADD COLUMN IF NOT EXISTS pending_hash CHAR(64) NULL COMMENT 'oauth_pending ที่จะเชื่อมเมื่อยืนยันอีเมล';
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NULL AFTER email;

-- v13: เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน (แทนลิงก์ทางอีเมล) — ตาราง auth_token เลิกใช้แล้ว
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS password_hash        VARCHAR(255) NULL COMMENT 'scrypt$N$r$p$salt$key',
  ADD COLUMN IF NOT EXISTS password_set_at      DATETIME     NULL,
  ADD COLUMN IF NOT EXISTS failed_logins        INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_login_at DATETIME     NULL;
-- Facebook ส่งอีเมลที่ตรงกับบัญชีที่มีรหัสผ่าน → ต้องกรอกรหัสผ่านก่อนเชื่อม (กันคนสมัครดักอีเมลคนอื่นไว้ก่อน)
ALTER TABLE oauth_pending ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;

-- v14: ค้นหาขั้นสูง — กรอง/เรียงตามทุนจดทะเบียน
ALTER TABLE juristic ADD INDEX IF NOT EXISTS idx_capital (register_capital);

-- v15: ค้นหาสัญญาภาครัฐ (สมาชิก) — เรียงตามวันลงนาม / กรองจังหวัด / วิธีจัดซื้อ
ALTER TABLE procurement_contract
  ADD INDEX IF NOT EXISTS idx_sign (sign_date),
  ADD INDEX IF NOT EXISTS idx_province_sign (province, sign_date),
  ADD INDEX IF NOT EXISTS idx_method_sign (method, sign_date);

-- v16: ติดต่อเรา / คำร้อง (แก้ไขข้อมูล เพิ่มข้อมูลติดต่อ ลบข้อมูลส่วนบุคคล แจ้งปัญหา ร้องเรียน)
CREATE TABLE IF NOT EXISTS support_request (
  id            INT           NOT NULL AUTO_INCREMENT,
  ticket        VARCHAR(20)   NOT NULL COMMENT 'เลขที่คำร้อง เช่น TDC-691003-7K2Q',
  type          VARCHAR(20)   NOT NULL,
  status        VARCHAR(16)   NOT NULL DEFAULT 'new' COMMENT 'new / in_progress / resolved / rejected',
  juristic_id   CHAR(13)      NULL,
  page_url      VARCHAR(500)  NULL,
  name          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  phone         VARCHAR(64)   NULL,
  relation      VARCHAR(32)   NULL COMMENT 'ความเกี่ยวข้องกับนิติบุคคล',
  subject       VARCHAR(255)  NULL,
  message       TEXT          NOT NULL,
  contact_json  TEXT          NULL COMMENT 'ข้อมูลติดต่อที่ขอเพิ่ม (JSON)',
  user_id       INT           NULL,
  ip_hash       CHAR(64)      NULL,
  admin_note    TEXT          NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at   DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ticket (ticket),
  KEY idx_status (status, created_at),
  KEY idx_juristic (juristic_id),
  KEY idx_ip (ip_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ข้อมูลติดต่อที่เจ้าของกิจการแจ้ง (เผยแพร่หลังผู้ดูแลตรวจสอบ)
CREATE TABLE IF NOT EXISTS juristic_contact (
  juristic_id   CHAR(13)      NOT NULL,
  phone         VARCHAR(64)   NULL,
  email         VARCHAR(255)  NULL,
  website       VARCHAR(255)  NULL,
  line_id       VARCHAR(100)  NULL,
  facebook      VARCHAR(255)  NULL,
  source_ticket VARCHAR(20)   NULL,
  verified_at   DATETIME      NOT NULL,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (juristic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v17: สถิติผู้เข้าชม (first-party, ไม่ใช้คุกกี้ — visitor = hash รายวันของ IP+UA ไม่เก็บ IP จริง)
CREATE TABLE IF NOT EXISTS page_view (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  ts          DATETIME      NOT NULL COMMENT 'UTC',
  path        VARCHAR(500)  NOT NULL,
  entity_type VARCHAR(16)   NULL COMMENT 'company / agency / tsic / new / search / procurement',
  entity_id   VARCHAR(255)  NULL,
  query       VARCHAR(255)  NULL COMMENT 'คำค้นหา (หน้า /search)',
  visitor     CHAR(16)      NOT NULL COMMENT 'hash รายวัน — นับผู้เข้าชมไม่ซ้ำได้ แต่ย้อนกลับเป็น IP ไม่ได้',
  referrer    VARCHAR(255)  NULL COMMENT 'โดเมนต้นทาง (null = เข้าตรง/ภายในเว็บ)',
  device      VARCHAR(10)   NULL,
  browser     VARCHAR(20)   NULL,
  os          VARCHAR(20)   NULL,
  member      TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_ts (ts),
  KEY idx_entity (entity_type, entity_id, ts),
  KEY idx_path (path(120), ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v18: เก็บ IP 90 วัน (บันทึกความปลอดภัย) + รหัสผู้เข้าชมจากคุกกี้สถิติ (เฉพาะผู้ที่กดยอมรับ)
ALTER TABLE page_view
  ADD COLUMN IF NOT EXISTS ip  VARCHAR(45) NULL COMMENT 'ลบ (ตั้งเป็น NULL) เมื่อครบ 90 วัน — งาน analytics-cleanup',
  ADD COLUMN IF NOT EXISTS vid CHAR(22)    NULL COMMENT 'คุกกี้ tdc_vid (มีเฉพาะผู้ยอมรับคุกกี้สถิติ)',
  ADD INDEX IF NOT EXISTS idx_ip (ip, ts),
  ADD INDEX IF NOT EXISTS idx_vid (vid, ts);
-- งานล้างข้อมูล: เปิดไว้ตั้งแต่แรก (เป็นข้อผูกพันตามนโยบายความเป็นส่วนตัว)
INSERT IGNORE INTO job_schedule (job_key, enabled, cron, args) VALUES ('analytics-cleanup', 1, '20 3 * * *', NULL);

-- v19: บัญชีบริษัท (ยืนยันด้วยเอกสาร) / โปรไฟล์ / ประกาศงาน / ข่าวสาร
CREATE TABLE IF NOT EXISTS company_claim (
  id            INT           NOT NULL AUTO_INCREMENT,
  juristic_id   CHAR(13)      NOT NULL,
  user_id       INT           NOT NULL,
  status        VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT 'pending / approved / rejected',
  contact_name  VARCHAR(255)  NOT NULL,
  position      VARCHAR(100)  NULL,
  phone         VARCHAR(64)   NOT NULL,
  doc_files     TEXT          NULL COMMENT 'JSON รายชื่อไฟล์เอกสาร (ลบไฟล์ทิ้งเมื่อพิจารณาเสร็จ)',
  docs_deleted_at DATETIME    NULL,
  admin_note    TEXT          NULL,
  reviewed_by   INT           NULL,
  reviewed_at   DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status (status, created_at),
  KEY idx_juristic (juristic_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_member (
  juristic_id   CHAR(13)      NOT NULL,
  user_id       INT           NOT NULL,
  claim_id      INT           NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (juristic_id, user_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_profile (
  juristic_id   CHAR(13)      NOT NULL,
  about         TEXT          NULL,
  services      TEXT          NULL,
  logo          VARCHAR(120)  NULL COMMENT 'ไฟล์ใน storage/public',
  hidden        TINYINT(1)    NOT NULL DEFAULT 0 COMMENT 'ผู้ดูแลซ่อน (ละเมิดนโยบาย)',
  updated_by    INT           NULL,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (juristic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_post (
  id              INT           NOT NULL AUTO_INCREMENT,
  juristic_id     CHAR(13)      NOT NULL,
  title           VARCHAR(200)  NOT NULL,
  employment_type VARCHAR(20)   NOT NULL COMMENT 'FULL_TIME / PART_TIME / CONTRACTOR / TEMPORARY / INTERN',
  province        VARCHAR(64)   NOT NULL,
  location        VARCHAR(255)  NULL,
  salary_min      INT           NULL,
  salary_max      INT           NULL,
  salary_note     VARCHAR(100)  NULL,
  positions       INT           NOT NULL DEFAULT 1,
  description     TEXT          NOT NULL,
  qualifications  TEXT          NULL,
  benefits        TEXT          NULL,
  contact_name    VARCHAR(255)  NULL,
  contact_phone   VARCHAR(64)   NULL,
  contact_email   VARCHAR(255)  NULL,
  contact_line    VARCHAR(100)  NULL,
  status          VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active / closed / hidden',
  valid_through   DATE          NOT NULL,
  created_by      INT           NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_live (status, valid_through),
  KEY idx_company (juristic_id, created_at),
  KEY idx_province (province, status, valid_through)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_post (
  id            INT           NOT NULL AUTO_INCREMENT,
  juristic_id   CHAR(13)      NOT NULL,
  title         VARCHAR(200)  NOT NULL,
  body          TEXT          NOT NULL,
  image         VARCHAR(120)  NULL,
  status        VARCHAR(16)   NOT NULL DEFAULT 'published' COMMENT 'published / hidden',
  created_by    INT           NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_live (status, created_at),
  KEY idx_company (juristic_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v20: สำรองข้อมูลผู้ใช้รายวัน (เปิดไว้ตั้งแต่แรก)
INSERT IGNORE INTO job_schedule (job_key, enabled, cron, args) VALUES ('backup-userdata', 1, '40 2 * * *', NULL);

-- v21: รูปประกอบประกาศงาน (เก็บที่ R2 / storage)
ALTER TABLE job_post ADD COLUMN IF NOT EXISTS image VARCHAR(120) NULL AFTER benefits;

-- v22: ระงับบัญชีสมาชิก (พร้อมเหตุผล)
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS suspended_at     DATETIME     NULL,
  ADD COLUMN IF NOT EXISTS suspended_reason VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS suspended_by     INT          NULL;

-- v23: ทยอยอัปเดตข้อมูลบริษัทจาก DBD Open API (ข้อมูล Open-D เป็นข้อมูล ณ วันจดทะเบียน) — ทุกชั่วโมง รอบละ 1,000 ราย
INSERT IGNORE INTO job_schedule (job_key, enabled, cron, args) VALUES ('refresh-dbd', 1, '5 * * * *', '--limit=1000 --rate=1');

-- v24: ทะเบียนภาษีมูลค่าเพิ่ม (กรมสรรพากร, Open Data Common) — เฉพาะนิติบุคคล แยกสาขา (0 = สำนักงานใหญ่)
--      sync-vat โหลดทั้งชุดลงตารางใหม่แล้วสลับชื่อ (ผู้ที่เลิกจด VAT จะหายไปเอง)
CREATE TABLE IF NOT EXISTS juristic_vat (
  tax_id        CHAR(13)      NOT NULL,
  branch_no     INT           NOT NULL DEFAULT 0,
  name          VARCHAR(255)  NULL COMMENT 'ชื่อผู้ประกอบการ',
  branch_name   VARCHAR(255)  NULL COMMENT 'ชื่อสถานประกอบการ',
  address       VARCHAR(600)  NULL,
  province      VARCHAR(64)   NULL,
  post_code     CHAR(5)       NULL,
  approved_date DATE          NULL COMMENT 'วันที่ได้รับอนุมัติจดทะเบียน VAT (ค.ศ.)',
  PRIMARY KEY (tax_id, branch_no),
  KEY idx_province (province)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO job_schedule (job_key, enabled, cron, args) VALUES ('sync-vat', 1, '30 4 5 * *', NULL);

-- v25: ความเคลื่อนไหวนิติบุคคล — สิ่งที่เปลี่ยนเมื่ออัปเดตกับ DBD Open API (detected_at = วันที่ตรวจพบ ไม่ใช่วันที่จดแก้ไขจริง)
CREATE TABLE IF NOT EXISTS juristic_change (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  juristic_id CHAR(13)      NOT NULL,
  field       VARCHAR(16)   NOT NULL COMMENT 'name / capital / tsic / type / status / address',
  old_value   VARCHAR(600)  NULL,
  new_value   VARCHAR(600)  NULL,
  detected_at DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY idx_detected (detected_at),
  KEY idx_field_detected (field, detected_at),
  KEY idx_juristic (juristic_id, detected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v26: บันทึกการค้นหาขั้นสูงทั้งชุด (Lead Finder) — แจ้งเตือนรายชื่อใหม่ที่ตรงเงื่อนไขทางอีเมล
ALTER TABLE saved_search
  ADD COLUMN IF NOT EXISTS query VARCHAR(1000) NULL COMMENT 'query string ของ /search (ตัวกรองครบชุด)' AFTER province,
  ADD COLUMN IF NOT EXISTS label VARCHAR(255)  NULL AFTER query;

-- v27: สรุปผู้ชนะต่อหน่วยงาน (วิเคราะห์คู่แข่งงานภาครัฐ) — สร้างใหม่ทุกครั้งหลัง sync:egp
CREATE TABLE IF NOT EXISTS procurement_agency_winner (
  agency       VARCHAR(255)  NOT NULL,
  winner_id    CHAR(13)      NOT NULL,
  contracts    INT           NOT NULL,
  total_value  DECIMAL(20,2) NOT NULL,
  avg_discount DECIMAL(7,4)  NULL COMMENT 'ส่วนต่างจากราคากลางเฉลี่ย (0.05 = ต่ำกว่าราคากลาง 5%)',
  PRIMARY KEY (agency, winner_id),
  KEY idx_winner (winner_id, contracts),
  KEY idx_agency_value (agency, total_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v28: รายงานรายเดือนนับผู้จด VAT ใหม่ตามวันที่อนุมัติ (sync-vat สร้างตารางใหม่แบบ LIKE จึงได้ index นี้ด้วย)
ALTER TABLE juristic_vat ADD INDEX IF NOT EXISTS idx_approved (approved_date, branch_no);

-- v29: รายงานรายได้ Google AdSense (ดึงทุกวันด้วยงาน adsense-report) — ad_unit '__total__' = รวมทั้งวัน
CREATE TABLE IF NOT EXISTS adsense_report (
  report_date DATE          NOT NULL,
  ad_unit     VARCHAR(255)  NOT NULL,
  earnings    DECIMAL(14,4) NOT NULL DEFAULT 0 COMMENT 'รายได้ประมาณการ (บาท)',
  page_views  INT           NOT NULL DEFAULT 0,
  impressions INT           NOT NULL DEFAULT 0,
  clicks      INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (report_date, ad_unit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO job_schedule (job_key, enabled, cron, args) VALUES ('adsense-report', 1, '30 6 * * *', NULL);

-- v30: ไม่นับสถิติการเข้าชมของสมาชิกบางคน (เช่น ทีมงานที่ทดสอบเว็บ) — ตั้งที่ /admin/members/[id]
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS no_analytics TINYINT(1) NOT NULL DEFAULT 0 AFTER suspended_by;
