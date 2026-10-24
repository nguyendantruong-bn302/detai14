
const express = require("express");
const client = require("prom-client");
const { Pool } = require("pg");
const fs = require("fs");

const app = express();
const PORT = 3000;
const appLog = fs.createWriteStream("/var/log/project-management/app.log", { flags: "a" });

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  process.stdout.write(line);
  appLog.write(line);
}

client.collectDefaultMetrics();

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "project_management",
  user: process.env.DB_USER || "project_app",
  password: process.env.DB_PASSWORD
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  log(JSON.stringify({ level: "info", method: req.method, path: req.path }));
  next();
});

const projectSelect = `
  SELECT p.id, p.name, p.start_date AS start, p.end_date AS "end",
         p.budget, p.progress, p.status, p.created_at,
         m.id AS "memberId", m.name AS leader
  FROM projects p
  LEFT JOIN members m ON m.id = p.owner_id`;

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      role VARCHAR(80) NOT NULL DEFAULT 'Thành viên',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      budget NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (budget >= 0),
      progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      status VARCHAR(30) NOT NULL DEFAULT 'Mới',
      owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_date >= start_date)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'Mới'
        CHECK (status IN ('Mới', 'Đang thực hiện', 'Hoàn thành')),
      progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON tasks(assignee_id);
  `);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM members");
  if (rows[0].count === 0) {
    await pool.query(`
      INSERT INTO members (name, email, role) VALUES
        ('Nguyễn Văn An', 'an@example.local', 'Trưởng nhóm'),
        ('Trần Minh Anh', 'anh@example.local', 'Lập trình viên'),
        ('Lê Hoàng Nam', 'nam@example.local', 'Thiết kế');

      INSERT INTO projects (name, start_date, end_date, budget, progress, status, owner_id)
      SELECT 'Xây dựng website bán hàng', CURRENT_DATE - 5, CURRENT_DATE + 60,
             50000000, 35, 'Đang thực hiện', id
      FROM members WHERE email = 'an@example.local';

      INSERT INTO projects (name, start_date, end_date, budget, progress, status, owner_id)
      SELECT 'Phát triển ứng dụng quản lý', CURRENT_DATE - 12, CURRENT_DATE + 35,
             35000000, 20, 'Đang thực hiện', id
      FROM members WHERE email = 'anh@example.local';

      INSERT INTO projects (name, start_date, end_date, budget, progress, status, owner_id)
      SELECT 'Nâng cấp hệ thống nội bộ', CURRENT_DATE - 30, CURRENT_DATE - 4,
             20000000, 30, 'Chậm tiến độ', id
      FROM members WHERE email = 'nam@example.local';

      INSERT INTO projects (name, start_date, end_date, budget, progress, status, owner_id)
      SELECT 'Thiết kế cơ sở dữ liệu', CURRENT_DATE - 90, CURRENT_DATE - 20,
             15000000, 100, 'Hoàn thành', id
      FROM members WHERE email = 'nam@example.local';

      INSERT INTO tasks (project_id, assignee_id, title, description, due_date, status, progress)
      SELECT p.id, m.id, 'Thiết kế giao diện', 'Hoàn thiện bản thiết kế các màn hình chính.',
             CURRENT_DATE + 7, 'Đang thực hiện', 60
      FROM projects p, members m
      WHERE p.name = 'Xây dựng website bán hàng' AND m.email = 'nam@example.local';

      INSERT INTO tasks (project_id, assignee_id, title, description, due_date, status, progress)
      SELECT p.id, m.id, 'Khởi tạo cơ sở dữ liệu', 'Tạo schema và các quan hệ dữ liệu.',
             CURRENT_DATE + 3, 'Mới', 0
      FROM projects p, members m
      WHERE p.name = 'Xây dựng website bán hàng' AND m.email = 'anh@example.local';

      INSERT INTO tasks (project_id, assignee_id, title, description, due_date, status, progress)
      SELECT p.id, m.id, 'Xây dựng API', 'Triển khai các API nghiệp vụ đầu tiên.',
             CURRENT_DATE + 14, 'Đang thực hiện', 40
      FROM projects p, members m
      WHERE p.name = 'Phát triển ứng dụng quản lý' AND m.email = 'anh@example.local';

      INSERT INTO tasks (project_id, assignee_id, title, description, due_date, status, progress)
      SELECT p.id, m.id, 'Kiểm thử bản nâng cấp', 'Kiểm tra các luồng nghiệp vụ sau nâng cấp.',
             CURRENT_DATE - 1, 'Đang thực hiện', 30
      FROM projects p, members m
      WHERE p.name = 'Nâng cấp hệ thống nội bộ' AND m.email = 'nam@example.local';

      INSERT INTO tasks (project_id, assignee_id, title, description, due_date, status, progress)
      SELECT p.id, m.id, 'Thiết kế schema', 'Hoàn thiện mô hình dữ liệu và khóa ngoại.',
             CURRENT_DATE - 20, 'Hoàn thành', 100
      FROM projects p, members m
      WHERE p.name = 'Thiết kế cơ sở dữ liệu' AND m.email = 'nam@example.local';
    `);
  }
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validId(value) {
  return value === null || value === undefined || value === "" ||
    (Number.isInteger(Number(value)) && Number(value) > 0);
}

async function withTransaction(action) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const result = await action(connection);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch (rollbackError) {
      log(`Database transaction rollback failed: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function refreshProjectProgress(connection, projectId) {
  await connection.query(`
    UPDATE projects p SET progress = summary.progress,
      status = CASE WHEN summary.progress = 100 THEN 'Hoàn thành'
        WHEN p.status = 'Hoàn thành' THEN 'Đang thực hiện' ELSE p.status END
    FROM (
      SELECT $1::int AS project_id,
             COALESCE(ROUND(AVG(progress)), 0)::int AS progress
      FROM tasks WHERE project_id = $1
    ) summary
    WHERE p.id = summary.project_id`,
  [projectId]);
}

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/health", (req, res) => {
  pool.query("SELECT 1")
    .then(() => res.json({ status: "ok", application: "Project Management", database: "ok" }))
    .catch(error => {
      log(`Database health check failed: ${error.message}`);
      res.status(503).json({ status: "error", application: "Project Management", database: "unavailable" });
    });
});

app.get("/api/projects", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${projectSelect} ORDER BY p.created_at DESC`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (req, res, next) => {
  const { name, memberId, start, end, budget } = req.body;

  if (typeof name !== "string" || !name.trim() || !validDate(start) ||
      !validDate(end) || !validId(memberId)) {
    return res.status(400).json({
      message: "Vui lòng nhập đầy đủ thông tin dự án."
    });
  }

  if (end < start || !Number.isFinite(Number(budget || 0)) || Number(budget || 0) < 0) {
    return res.status(400).json({
      message: "Ngày kết thúc phải sau ngày bắt đầu và ngân sách không được âm."
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (name, owner_id, start_date, end_date, budget)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, start_date AS start, end_date AS "end", budget,
                 progress, status, owner_id AS "memberId"`,
      [name.trim(), memberId ? Number(memberId) : null, start, end, Number(budget || 0)]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/projects/:id", async (req, res, next) => {
  const progress = Number(req.body.progress);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return res.status(400).json({ message: "Tiến độ phải từ 0 đến 100." });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE projects
       SET progress = $1::smallint, status = CASE WHEN $1::smallint = 100 THEN 'Hoàn thành'
         WHEN status = 'Hoàn thành' THEN 'Đang thực hiện' ELSE status END
       WHERE id = $2
       RETURNING id, name, progress, status`,
      [progress, Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ message: "Không tìm thấy dự án." });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:id", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM projects WHERE id = $1", [Number(req.params.id)]);
    if (!result.rowCount) return res.status(404).json({ message: "Không tìm thấy dự án." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/members", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.name, m.email, m.role, m.created_at,
             COUNT(DISTINCT p.id)::int AS "projectCount",
             COUNT(DISTINCT t.id)::int AS "taskCount"
      FROM members m
      LEFT JOIN projects p ON p.owner_id = m.id
      LEFT JOIN tasks t ON t.assignee_id = m.id
      GROUP BY m.id
      ORDER BY m.name`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/members", async (req, res, next) => {
  const { name, email, role } = req.body;
  if (typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof role !== "string" || !role.trim()) {
    return res.status(400).json({ message: "Vui lòng nhập tên, email hợp lệ và vai trò." });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO members (name, email, role) VALUES ($1, $2, $3)
       RETURNING id, name, email, role`,
      [name.trim(), email.trim().toLowerCase(), role.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/members/:id", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM members WHERE id = $1", [Number(req.params.id)]);
    if (!result.rowCount) return res.status(404).json({ message: "Không tìm thấy thành viên." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.title, t.description, t.due_date AS "dueDate", t.status,
             t.progress, t.project_id AS "projectId", p.name AS "projectName",
             t.assignee_id AS "memberId", m.name AS assignee
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN members m ON m.id = t.assignee_id
      ORDER BY t.due_date NULLS LAST, t.created_at DESC`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", async (req, res, next) => {
  const { title, description, projectId, memberId, dueDate } = req.body;
  if (typeof title !== "string" || !title.trim() || !validId(projectId) || !Number(projectId) ||
      !validId(memberId) || (dueDate && !validDate(dueDate))) {
    return res.status(400).json({ message: "Tên công việc, dự án và ngày đến hạn không hợp lệ." });
  }
  try {
    const task = await withTransaction(async connection => {
      const project = await connection.query(
        "SELECT id FROM projects WHERE id = $1 FOR UPDATE",
        [Number(projectId)]
      );
      if (!project.rows[0]) return null;

      const { rows } = await connection.query(`
        INSERT INTO tasks (title, description, project_id, assignee_id, due_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, description, project_id AS "projectId",
                  assignee_id AS "memberId", due_date AS "dueDate", status, progress`,
      [title.trim(), typeof description === "string" ? description.trim() : "",
        Number(projectId), memberId ? Number(memberId) : null, dueDate || null]);
      await refreshProjectProgress(connection, rows[0].projectId);
      return rows[0];
    });
    if (!task) return res.status(404).json({ message: "Không tìm thấy dự án." });
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:id", async (req, res, next) => {
  const { status, progress } = req.body;
  const allowedStatuses = ["Mới", "Đang thực hiện", "Hoàn thành"];
  if (!allowedStatuses.includes(status) ||
      (progress !== undefined && (!Number.isInteger(Number(progress)) ||
        Number(progress) < 0 || Number(progress) > 100))) {
    return res.status(400).json({ message: "Trạng thái hoặc tiến độ công việc không hợp lệ." });
  }
  const taskProgress = progress === undefined
    ? (status === "Hoàn thành" ? 100 : status === "Mới" ? 0 : null)
    : Number(progress);
  try {
    const task = await withTransaction(async connection => {
      const existing = await connection.query(`
        SELECT p.id FROM projects p
        JOIN tasks t ON t.project_id = p.id
        WHERE t.id = $1
        FOR UPDATE OF p`,
      [Number(req.params.id)]);
      if (!existing.rows[0]) return null;

      const { rows } = await connection.query(`
        UPDATE tasks SET status = $1::varchar,
          progress = CASE WHEN $2::smallint IS NOT NULL THEN $2::smallint
            WHEN status = 'Hoàn thành' AND $1::varchar = 'Đang thực hiện' THEN 0
            ELSE progress END
        WHERE id = $3
        RETURNING id, title, status, progress, project_id AS "projectId"`,
      [status, taskProgress, Number(req.params.id)]);
      await refreshProjectProgress(connection, rows[0].projectId);
      return rows[0];
    });
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc." });
    res.json(task);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:id", async (req, res, next) => {
  try {
    const deleted = await withTransaction(async connection => {
      const existing = await connection.query(`
        SELECT p.id FROM projects p
        JOIN tasks t ON t.project_id = p.id
        WHERE t.id = $1
        FOR UPDATE OF p`,
      [Number(req.params.id)]);
      if (!existing.rows[0]) return false;

      const result = await connection.query(
        "DELETE FROM tasks WHERE id = $1",
        [Number(req.params.id)]
      );
      if (!result.rowCount) return false;
      await refreshProjectProgress(connection, existing.rows[0].id);
      return true;
    });
    if (!deleted) return res.status(404).json({ message: "Không tìm thấy công việc." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/", (req, res) => {
  log("Trang dashboard được truy cập.");

  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quản lý dự án | Dashboard</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:#f3f7fd;color:#1e293b}
.layout{display:flex;min-height:100vh}
.sidebar{width:245px;flex-shrink:0;background:#172957;color:white;padding:25px 17px;display:flex;flex-direction:column}
.brand{font-size:20px;font-weight:bold;margin:10px 0 5px}
.subbrand{font-size:11px;color:#c4d2f1;margin-bottom:38px}
.section{font-size:12px;font-weight:bold;color:#a9bbdf;margin:0 10px 12px}
.menu{border:0;background:transparent;color:#d9e4fa;text-align:left;padding:14px 12px;border-radius:9px;font-size:14px;cursor:pointer;margin-bottom:5px;width:100%}
.menu:hover,.menu.active{background:#304879;color:white}
.sidebar-note{margin-top:auto;border:1px solid #405584;border-radius:12px;padding:14px;font-size:12px;line-height:1.7;color:#d2def4}
main{flex:1;min-width:0;padding:35px}
.top{display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap}
.eyebrow{font-size:12px;color:#7c8ba5}
h1{font-size:32px;margin:10px 0}
.subtitle{color:#8491a5;font-size:14px}
.date{background:white;padding:13px 17px;border-radius:12px;border:1px solid #e5ebf5}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:35px}
.card,.panel{background:white;border:1px solid #e9eef6;border-radius:16px;padding:22px;box-shadow:0 3px 12px #17315c0b}
.card-label{color:#7d8ba0;font-size:13px}
.card-number{font-size:32px;font-weight:bold;margin:20px 0 10px}
.card-desc{font-size:12px;color:#8794a7}
.symbol{float:right;background:#edf4ff;padding:10px;border-radius:10px;color:#4276c6}
.panel{margin-top:25px}
.panel h2{font-size:19px;margin-top:0}
.primary{background:#2e5db4;color:white;border:0;border-radius:8px;padding:11px 16px;cursor:pointer}
.primary:hover{background:#21488f}
input,select{padding:11px;border:1px solid #d7e0ee;border-radius:8px;font-size:14px;width:100%;max-width:100%}
textarea{padding:11px;border:1px solid #d7e0ee;border-radius:8px;font:14px Arial,sans-serif;width:100%;resize:vertical}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
table{width:100%;border-collapse:collapse;min-width:760px}
th,td{text-align:left;padding:14px 12px;border-bottom:1px solid #edf1f7;font-size:13px}
th{background:#f8faff;color:#72819a}
.table-wrap{overflow-x:auto}
.status{padding:6px 9px;border-radius:20px;font-size:12px;white-space:nowrap}
.ready{background:#e1f7e9;color:#168044}
.working{background:#e3edff;color:#275bc0}
.late{background:#fff0d8;color:#a76509}
.new{background:#edf0f5;color:#475569}
.progress{height:7px;background:#e9eef6;border-radius:8px;overflow:hidden;min-width:65px;margin-top:7px}
.progress span{display:block;height:100%;background:#3974d4;border-radius:8px}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.field{display:flex;flex-direction:column;gap:8px}
.field label{font-size:13px;color:#56657c}
.hidden{display:none}
.notice{margin-top:15px;color:#168044;font-size:13px}
.error{color:#b91c1c}
.small{font-size:12px;padding:7px;border:1px solid #d8e2f0;background:white;border-radius:7px;cursor:pointer}
.danger{color:#b91c1c;border-color:#fecaca}
.empty{color:#8491a5;text-align:center;padding:24px}
@media(max-width:1050px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:22px}}
@media(max-width:600px){.layout{display:block}.sidebar{width:100%;padding:15px}.subbrand{margin-bottom:15px}.sidebar-note{display:none}main{padding:18px}.cards{grid-template-columns:1fr 1fr}.card{padding:14px}.card-number{font-size:25px}.form-grid{grid-template-columns:1fr}h1{font-size:27px}}
</style>
</head>
<body>
<div class="layout">
<aside class="sidebar">
  <div class="brand">▦ QUẢN LÝ DỰ ÁN</div>
  <div class="subbrand">QUẢN TRỊ HỆ THỐNG</div>
  <div class="section">MENU CHÍNH</div>
  <button class="menu active" data-page="dashboard">▦ &nbsp; Tổng quan</button>
  <button class="menu" data-page="add">＋ &nbsp; Thêm dự án</button>
  <button class="menu" data-page="list">▤ &nbsp; Danh sách dự án</button>
  <button class="menu" data-page="tasks">☑ &nbsp; Công việc</button>
  <button class="menu" data-page="members">♙ &nbsp; Thành viên</button>
  <button class="menu" data-page="reports">◷ &nbsp; Báo cáo tiến độ</button>
  <div class="sidebar-note"><b>Hệ thống quản lý dự án</b><br>Theo dõi tiến độ, ngân sách, thời hạn và người phụ trách dự án.</div>
</aside>

<main>
<section id="dashboard">
  <div class="top">
    <div><div class="eyebrow">QUẢN LÝ DỰ ÁN</div><h1>Tổng quan</h1><div class="subtitle">Xin chào! Theo dõi tình hình các dự án của bạn tại đây.</div></div>
    <div class="date" id="today"></div>
  </div>
  <div class="cards">
    <div class="card"><span class="symbol">▦</span><div class="card-label">Tổng dự án</div><div class="card-number" id="total">0</div><div class="card-desc">Tất cả dự án trong hệ thống</div></div>
    <div class="card"><span class="symbol">↗</span><div class="card-label">Đang thực hiện</div><div class="card-number" id="active">0</div><div class="card-desc">Dự án đang triển khai</div></div>
    <div class="card"><span class="symbol">✓</span><div class="card-label">Hoàn thành</div><div class="card-number" id="done">0</div><div class="card-desc">Dự án đã hoàn tất</div></div>
    <div class="card"><span class="symbol">!</span><div class="card-label">Chậm tiến độ</div><div class="card-number" id="late">0</div><div class="card-desc">Dự án cần theo dõi</div></div>
  </div>
  <div class="panel">
    <h2>Dự án gần đây</h2>
    <p class="subtitle">Tổng hợp tiến độ các dự án đang được quản lý.</p>
    <div class="table-wrap"><table><thead><tr><th>Tên dự án</th><th>Người phụ trách</th><th>Thời hạn</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead><tbody id="recentRows"></tbody></table></div>
  </div>
</section>

<section id="add" class="hidden">
  <div class="eyebrow">QUẢN LÝ DỰ ÁN</div><h1>Thêm dự án</h1><p class="subtitle">Nhập thông tin để tạo dự án mới.</p>
  <div class="panel">
  <form id="projectForm">
    <div class="form-grid">
      <div class="field"><label for="name">Tên dự án *</label><input id="name" required placeholder="Nhập tên dự án"></div>
      <div class="field"><label for="leader">Người phụ trách</label><select id="leader"><option value="">Chưa phân công</option></select></div>
      <div class="field"><label for="start">Ngày bắt đầu *</label><input id="start" type="date" required></div>
      <div class="field"><label for="end">Ngày kết thúc *</label><input id="end" type="date" required></div>
      <div class="field"><label for="budget">Ngân sách (VNĐ)</label><input id="budget" type="number" min="0" value="0"></div>
    </div>
    <div class="toolbar"><button class="primary" type="submit">Lưu dự án</button><button class="small" type="reset">Nhập lại</button></div>
    <div id="formNotice" class="notice"></div>
  </form></div>
</section>

<section id="list" class="hidden">
  <div class="eyebrow">QUẢN LÝ DỰ ÁN</div><h1>Danh sách dự án</h1><p class="subtitle">Tìm kiếm và cập nhật tiến độ dự án.</p>
  <div class="panel">
    <div class="toolbar"><input id="search" placeholder="Tìm tên dự án hoặc người phụ trách..." style="flex:1;min-width:200px"><button class="primary" id="goAdd">＋ Thêm dự án</button></div>
    <div class="table-wrap"><table><thead><tr><th>Tên dự án</th><th>Người phụ trách</th><th>Ngày kết thúc</th><th>Ngân sách</th><th>Tiến độ</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead><tbody id="projectRows"></tbody></table></div>
  </div>
</section>

<section id="tasks" class="hidden">
  <div class="eyebrow">QUẢN LÝ CÔNG VIỆC</div><h1>Công việc</h1><p class="subtitle">Tạo công việc trong dự án, giao cho thành viên và theo dõi trạng thái.</p>
  <div class="panel">
    <h2>Tạo công việc</h2>
    <form id="taskForm">
      <div class="form-grid">
        <div class="field"><label for="taskTitle">Tên công việc *</label><input id="taskTitle" required maxlength="180" placeholder="Nhập tên công việc"></div>
        <div class="field"><label for="taskProject">Dự án *</label><select id="taskProject" required></select></div>
        <div class="field"><label for="taskMember">Người thực hiện</label><select id="taskMember"><option value="">Chưa phân công</option></select></div>
        <div class="field"><label for="taskDueDate">Ngày đến hạn</label><input id="taskDueDate" type="date"></div>
        <div class="field" style="grid-column:1/-1"><label for="taskDescription">Mô tả</label><textarea id="taskDescription" rows="2" placeholder="Mô tả công việc"></textarea></div>
      </div>
      <div class="toolbar"><button class="primary" type="submit">Tạo công việc</button></div>
      <div id="taskNotice" class="notice"></div>
    </form>
  </div>
  <div class="panel">
    <h2>Danh sách công việc</h2>
    <div class="table-wrap"><table><thead><tr><th>Công việc</th><th>Dự án</th><th>Người thực hiện</th><th>Đến hạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="taskRows"></tbody></table></div>
  </div>
</section>

<section id="members" class="hidden">
  <div class="eyebrow">QUẢN LÝ NHÂN SỰ</div><h1>Thành viên</h1><p class="subtitle">Quản lý thành viên và sử dụng họ làm người phụ trách dự án/công việc.</p>
  <div class="panel">
    <h2>Thêm thành viên</h2>
    <form id="memberForm">
      <div class="form-grid">
        <div class="field"><label for="memberName">Họ và tên *</label><input id="memberName" required maxlength="120"></div>
        <div class="field"><label for="memberEmail">Email *</label><input id="memberEmail" type="email" required maxlength="254"></div>
        <div class="field"><label for="memberRole">Vai trò *</label><input id="memberRole" required maxlength="80" value="Thành viên"></div>
      </div>
      <div class="toolbar"><button class="primary" type="submit">Thêm thành viên</button></div>
      <div id="memberNotice" class="notice"></div>
    </form>
  </div>
  <div class="panel">
    <h2>Danh sách thành viên</h2>
    <div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Dự án</th><th>Công việc</th><th>Thao tác</th></tr></thead><tbody id="memberRows"></tbody></table></div>
  </div>
</section>

<section id="reports" class="hidden">
  <div class="eyebrow">QUẢN LÝ DỰ ÁN</div><h1>Báo cáo tiến độ</h1><p class="subtitle">Thống kê tình trạng triển khai dự án.</p>
  <div class="cards">
    <div class="card"><div class="card-label">Tổng ngân sách</div><div class="card-number" id="budgetTotal" style="font-size:22px">0 ₫</div></div>
    <div class="card"><div class="card-label">Tiến độ trung bình</div><div class="card-number" id="average">0%</div></div>
  </div>
  <div class="panel"><h2>Chi tiết tiến độ</h2><div id="reportRows"></div></div>
</section>
</main>
</div>

<script>
let projects = [];
let members = [];
let tasks = [];

const money = n => Number(n).toLocaleString("vi-VN") + " ₫";
const dateFormat = s => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("vi-VN") : "-";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const statusClass = s => s === "Hoàn thành" ? "ready" : s === "Chậm tiến độ" ? "late" : s === "Mới" ? "new" : "working";

async function apiRequest(url, options) {
  const response = await fetch(url, options);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.message || "Yêu cầu không thành công.");
  return data;
}

async function loadData() {
  [projects, members, tasks] = await Promise.all([
    apiRequest("/api/projects"),
    apiRequest("/api/members"),
    apiRequest("/api/tasks")
  ]);
  render();
}

function setNotice(elementId, message, isError) {
  const element = document.getElementById(elementId);
  element.className = isError ? "notice error" : "notice";
  element.textContent = message;
}

function showPage(page) {
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  document.getElementById(page).classList.remove("hidden");
  document.querySelectorAll(".menu").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  render();
}

document.querySelectorAll(".menu").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
document.getElementById("today").textContent = new Date().toLocaleDateString("vi-VN");
document.getElementById("goAdd").addEventListener("click", () => showPage("add"));
document.getElementById("search").addEventListener("input", render);

function render() {
  const active = projects.filter(p => p.status === "Đang thực hiện" || p.status === "Mới").length;
  const done = projects.filter(p => p.status === "Hoàn thành").length;
  const late = projects.filter(p => p.status === "Chậm tiến độ").length;

  document.getElementById("total").textContent = projects.length;
  document.getElementById("active").textContent = active;
  document.getElementById("done").textContent = done;
  document.getElementById("late").textContent = late;

  document.getElementById("recentRows").innerHTML = projects.slice(0, 5).map(p =>
    "<tr><td>"+esc(p.name)+"</td><td>"+esc(p.leader || "Chưa phân công")+"</td><td>"+dateFormat(p.end)+"</td><td>"+p.progress+"%<div class='progress'><span style='width:"+p.progress+"%'></span></div></td><td><span class='status "+statusClass(p.status)+"'>"+esc(p.status)+"</span></td></tr>"
  ).join("");

  const q = document.getElementById("search").value.toLowerCase();
  document.getElementById("projectRows").innerHTML = projects.filter(p => (p.name+" "+(p.leader || "")).toLowerCase().includes(q)).map(p =>
    "<tr><td>"+esc(p.name)+"</td><td>"+esc(p.leader || "Chưa phân công")+"</td><td>"+dateFormat(p.end)+"</td><td>"+money(p.budget)+"</td><td><select data-progress='"+p.id+"' aria-label='Tiến độ'>"+[...new Set([0,10,20,30,40,50,60,70,80,90,100,Number(p.progress)])].sort((a,b)=>a-b).map(n=>"<option value='"+n+"' "+(n===Number(p.progress)?"selected":"")+">"+n+"%</option>").join("")+"</select></td><td><span class='status "+statusClass(p.status)+"'>"+esc(p.status)+"</span></td><td><button class='small' data-save='"+p.id+"'>Lưu</button> <button class='small danger' data-delete-project='"+p.id+"'>Xóa</button></td></tr>"
  ).join("");

  document.querySelectorAll("[data-save]").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.dataset.save;
    const progress = Number(document.querySelector("[data-progress='"+id+"']").value);
    try {
      await apiRequest("/api/projects/"+id, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({progress})
      });
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  }));

  document.querySelectorAll("[data-delete-project]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Xóa dự án này và toàn bộ công việc liên quan?")) return;
    try {
      await apiRequest("/api/projects/"+btn.dataset.deleteProject, {method:"DELETE"});
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  }));

  const memberOptions = members.map(m => "<option value='"+m.id+"'>"+esc(m.name)+"</option>").join("");
  document.getElementById("leader").innerHTML = "<option value=''>Chưa phân công</option>" + memberOptions;
  document.getElementById("taskMember").innerHTML = "<option value=''>Chưa phân công</option>" + memberOptions;
  document.getElementById("taskProject").innerHTML = projects.length
    ? projects.map(p => "<option value='"+p.id+"'>"+esc(p.name)+"</option>").join("")
    : "<option value=''>Hãy tạo dự án trước</option>";

  document.getElementById("taskRows").innerHTML = tasks.map(t =>
    "<tr><td><b>"+esc(t.title)+"</b><br><span class='subtitle'>"+esc(t.description || "")+"</span></td><td>"+esc(t.projectName)+"</td><td>"+esc(t.assignee || "Chưa phân công")+"</td><td>"+dateFormat(t.dueDate)+"</td><td><select data-task-status='"+t.id+"'>"+["Mới","Đang thực hiện","Hoàn thành"].map(s=>"<option "+(s===t.status?"selected":"")+">"+s+"</option>").join("")+"</select></td><td><button class='small' data-save-task='"+t.id+"'>Lưu</button> <button class='small danger' data-delete-task='"+t.id+"'>Xóa</button></td></tr>"
  ).join("") || "<tr><td colspan='6' class='empty'>Chưa có công việc.</td></tr>";

  document.querySelectorAll("[data-save-task]").forEach(btn => btn.addEventListener("click", async () => {
    const status = document.querySelector("[data-task-status='"+btn.dataset.saveTask+"']").value;
    try {
      await apiRequest("/api/tasks/"+btn.dataset.saveTask, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status})
      });
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  }));

  document.querySelectorAll("[data-delete-task]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Xóa công việc này?")) return;
    try {
      await apiRequest("/api/tasks/"+btn.dataset.deleteTask, {method:"DELETE"});
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  }));

  document.getElementById("memberRows").innerHTML = members.map(m =>
    "<tr><td>"+esc(m.name)+"</td><td>"+esc(m.email)+"</td><td>"+esc(m.role)+"</td><td>"+m.projectCount+"</td><td>"+m.taskCount+"</td><td><button class='small danger' data-delete-member='"+m.id+"'>Xóa</button></td></tr>"
  ).join("") || "<tr><td colspan='6' class='empty'>Chưa có thành viên.</td></tr>";

  document.querySelectorAll("[data-delete-member]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Xóa thành viên? Dự án và công việc vẫn được giữ lại nhưng sẽ bỏ phân công.")) return;
    try {
      await apiRequest("/api/members/"+btn.dataset.deleteMember, {method:"DELETE"});
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  }));

  document.getElementById("budgetTotal").textContent = money(projects.reduce((sum,p)=>sum+Number(p.budget||0),0));
  document.getElementById("average").textContent = projects.length ? Math.round(projects.reduce((sum,p)=>sum+p.progress,0)/projects.length)+"%" : "0%";
  document.getElementById("reportRows").innerHTML = projects.map(p =>
    "<p><b>"+esc(p.name)+"</b> — "+p.progress+"%<div class='progress'><span style='width:"+p.progress+"%'></span></div></p>"
  ).join("") || "<p class='empty'>Chưa có dự án.</p>";
}

document.getElementById("projectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const notice = document.getElementById("formNotice");
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;

  if(end < start) {
    notice.className = "notice error";
    notice.textContent = "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.";
    return;
  }

  const response = await fetch("/api/projects", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      name:document.getElementById("name").value.trim(),
      memberId:document.getElementById("leader").value || null,
      start,
      end,
      budget:document.getElementById("budget").value
    })
  });

  const data = await response.json();

  if(!response.ok) {
    notice.className = "notice error";
    notice.textContent = data.message || "Không thể tạo dự án.";
    return;
  }

  e.target.reset();
  notice.className = "notice";
  notice.textContent = "Thêm dự án thành công!";
  await loadData();
});

document.getElementById("memberForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await apiRequest("/api/members", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        name:document.getElementById("memberName").value.trim(),
        email:document.getElementById("memberEmail").value.trim(),
        role:document.getElementById("memberRole").value.trim()
      })
    });
    e.target.reset();
    document.getElementById("memberRole").value = "Thành viên";
    setNotice("memberNotice", "Thêm thành viên thành công.", false);
    await loadData();
  } catch (error) {
    setNotice("memberNotice", error.message, true);
  }
});

document.getElementById("taskForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await apiRequest("/api/tasks", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        title:document.getElementById("taskTitle").value.trim(),
        description:document.getElementById("taskDescription").value.trim(),
        projectId:document.getElementById("taskProject").value,
        memberId:document.getElementById("taskMember").value || null,
        dueDate:document.getElementById("taskDueDate").value || null
      })
    });
    e.target.reset();
    setNotice("taskNotice", "Tạo công việc thành công.", false);
    await loadData();
  } catch (error) {
    setNotice("taskNotice", error.message, true);
  }
});

loadData().catch(error => {
  console.error("Không thể tải dữ liệu:", error.message);
  alert("Không thể tải dữ liệu từ máy chủ. Hãy kiểm tra trạng thái PostgreSQL.");
});
</script>
</body>
</html>`);
});

app.use((error, req, res, next) => {
  log(JSON.stringify({
    level: "error",
    method: req.method,
    path: req.path,
    code: error.code || "INTERNAL_ERROR",
    message: error.message
  }));
  if (res.headersSent) return next(error);
  if (error.code === "23505") {
    return res.status(409).json({ message: "Email này đã được sử dụng." });
  }
  if (error.code === "23503" || error.code === "22P02") {
    return res.status(400).json({ message: "Dữ liệu liên kết không hợp lệ." });
  }
  res.status(500).json({ message: "Lỗi máy chủ. Vui lòng thử lại sau." });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      log("Hệ thống quản lý dự án đang chạy tại cổng " + PORT);
    });
  })
  .catch(error => {
    log("Database initialization failed: " + error.message);
    process.exit(1);
  });
