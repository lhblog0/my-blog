const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const marked = require("marked");
const moment = require("moment");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const pool = require("./db");

const app = express();
const PORT = 3000;

// 管理员账号
const ADMIN_USERNAME = "cloimaomao?1.33";
// 登录锁定时长
const LOCK_RULE = {
  lock1: 60 * 1000,
  lock2: 5 * 60 * 1000,
  lock3: 30 * 60 * 1000,
};

// 会话配置
app.use(
  session({
    secret: "blog-system-2026",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  }),
);

// 后台路由全局拦截：未登录/非管理员跳转登录页
app.use("/admin", (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login.html");
  }
  next();
});

// 解析表单数据
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 托管静态资源
app.use(express.static(path.join(__dirname, "public")));

// Markdown 解析配置
marked.setOptions({
  gfm: true,
  breaks: true,
  sanitize: true,
});

// 图片上传配置
const uploadDir = path.join(__dirname, "public", "upload");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

// 统一返回格式
const resJson = (res, code, msg, data = null) => {
  res.json({ code, msg, data });
};

// 管理员权限中间件
const checkAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return resJson(res, 403, "权限不足，请登录管理员账号");
  }
  next();
};

// 检查账号锁定状态
async function checkAdminLock(username) {
  const nowTime = Date.now();
  const [rows] = await pool.query(
    "SELECT error_count, lock_end_time FROM admin_login_lock WHERE admin_username = ?",
    [username],
  );
  if (rows.length === 0) return { isLock: false, msg: "", count: 0 };

  const { error_count, lock_end_time } = rows[0];
  if (lock_end_time > nowTime) {
    const remainTime = Math.ceil((lock_end_time - nowTime) / 1000);
    return {
      isLock: true,
      msg: `账号已锁定，请等待 ${remainTime} 秒后重试`,
      count: error_count,
    };
  }
  return { isLock: false, msg: "", count: error_count };
}

// 更新锁定次数与时间
async function updateAdminLock(username, newCount) {
  let lockEndTime = 0;
  const nowTime = Date.now();
  if (newCount >= 10) {
    lockEndTime = nowTime + LOCK_RULE.lock3;
  } else if (newCount >= 5) {
    lockEndTime = nowTime + LOCK_RULE.lock2;
  } else if (newCount >= 3) {
    lockEndTime = nowTime + LOCK_RULE.lock1;
  }
  await pool.query(
    "UPDATE admin_login_lock SET error_count = ?, lock_end_time = ? WHERE admin_username = ?",
    [newCount, lockEndTime, username],
  );
}

// 清空锁定记录
async function clearAdminLock(username) {
  await pool.query(
    "UPDATE admin_login_lock SET error_count = 0, lock_end_time = 0 WHERE admin_username = ?",
    [username],
  );
}

// ===================== 用户接口 =====================
// 注册
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    if (!username || !password)
      return resJson(res, 400, "用户名和密码不能为空");

    const sql =
      "INSERT INTO blog_user (username, password, nickname) VALUES (?,?,?)";
    await pool.query(sql, [username, password, nickname]);
    resJson(res, 200, "注册成功，请登录");
  } catch (err) {
    resJson(res, 500, "注册失败，用户名已存在");
  }
});

// 登录（明文密码校验）
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return resJson(res, 400, "用户名和密码不能为空");

    if (username === ADMIN_USERNAME) {
      const lockRes = await checkAdminLock(username);
      if (lockRes.isLock) return resJson(res, 403, lockRes.msg);
    }

    const sql =
      "SELECT id, username, password, nickname, role FROM blog_user WHERE username = ?";
    const [rows] = await pool.query(sql, [username]);
    if (rows.length === 0) return resJson(res, 400, "用户不存在");
    const user = rows[0];

    if (password !== user.password) {
      if (username === ADMIN_USERNAME) {
        const lockRes = await checkAdminLock(username);
        const newCount = lockRes.count + 1;
        await updateAdminLock(username, newCount);
        let tip = `密码错误，累计错误 ${newCount} 次`;
        if (newCount === 3) tip += "，账号锁定1分钟";
        if (newCount === 5) tip += "，账号锁定5分钟";
        if (newCount >= 10) tip += "，账号锁定30分钟";
        return resJson(res, 400, tip);
      }
      return resJson(res, 400, "密码错误");
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
    };
    if (username === ADMIN_USERNAME) await clearAdminLock(username);
    resJson(res, 200, "登录成功", req.session.user);
  } catch (err) {
    resJson(res, 500, "服务器异常");
  }
});

// 退出登录
app.get("/api/logout", (req, res) => {
  req.session.destroy();
  resJson(res, 200, "已退出登录");
});

// 获取当前登录用户
app.get("/api/user/info", (req, res) => {
  resJson(res, 200, "ok", req.session.user || null);
});

// 注销账号
app.post("/api/user/destroy", async (req, res) => {
  try {
    if (!req.session.user) return resJson(res, 401, "请先登录");
    const userId = req.session.user.id;
    const username = req.session.user.username;

    if (username === ADMIN_USERNAME) {
      return resJson(res, 403, "管理员账号禁止注销");
    }

    await pool.query("DELETE FROM blog_comment WHERE user_id = ?", [userId]);
    await pool.query("DELETE FROM blog_user WHERE id = ?", [userId]);
    req.session.destroy();
    resJson(res, 200, "账号已注销");
  } catch (err) {
    resJson(res, 500, "注销失败");
  }
});

// ===================== 图片上传 =====================
app.post("/api/upload", upload.single("img"), (req, res) => {
  if (!req.file) return resJson(res, 400, "请选择图片");
  const url = `/upload/${req.file.filename}`;
  resJson(res, 200, "上传成功", { url });
});

// ===================== 文章接口 =====================
// 获取文章列表
app.get("/api/article/list", async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    if (page < 1) page = 1;
    const offset = (page - 1) * pageSize;

    const sql = `SELECT id,title,summary,view_count,like_count,create_time 
                 FROM blog_article WHERE status = 1 ORDER BY create_time DESC LIMIT ?,?`;
    const [rows] = await pool.query(sql, [offset, pageSize]);
    const list = rows.map((item) => ({
      ...item,
      create_time: moment(item.create_time).format("YYYY-MM-DD HH:mm"),
    }));
    resJson(res, 200, "ok", list);
  } catch (err) {
    resJson(res, 500, "获取文章列表失败");
  }
});

// 获取文章详情
app.get("/api/article/detail", async (req, res) => {
  try {
    const id = parseInt(req.query.id);
    if (!id) return resJson(res, 400, "文章ID错误");

    const sql = "SELECT * FROM blog_article WHERE id = ?";
    const [rows] = await pool.query(sql, [id]);
    if (rows.length === 0) return resJson(res, 404, "文章不存在");

    const art = rows[0];
    if (!req.session.viewedArt) req.session.viewedArt = [];
    if (!req.session.viewedArt.includes(id)) {
      await pool.query(
        "UPDATE blog_article SET view_count = view_count + 1 WHERE id = ?",
        [id],
      );
      req.session.viewedArt.push(id);
      art.view_count += 1;
    }

    art.html_content = marked.parse(art.content);
    art.create_time = moment(art.create_time).format("YYYY-MM-DD HH:mm");
    resJson(res, 200, "ok", art);
  } catch (err) {
    resJson(res, 500, "获取文章详情失败");
  }
});

// 文章点赞
app.post("/api/article/like", async (req, res) => {
  try {
    const { articleId } = req.body;
    if (!articleId) return resJson(res, 400, "参数错误");

    if (!req.session.likedArt) req.session.likedArt = [];
    if (req.session.likedArt.includes(articleId)) {
      return resJson(res, 400, "你已经点过赞了");
    }

    await pool.query(
      "UPDATE blog_article SET like_count = like_count + 1 WHERE id = ?",
      [articleId],
    );
    req.session.likedArt.push(articleId);
    resJson(res, 200, "点赞成功");
  } catch (err) {
    resJson(res, 500, "点赞失败");
  }
});

// 后台发布文章（核心新增接口）
app.post("/api/admin/article/add", checkAdmin, async (req, res) => {
  try {
    const { title, content, categoryId } = req.body;
    if (!title || !content || !categoryId) {
      return resJson(res, 400, "标题、内容、分类不能为空");
    }
    const sql = `INSERT INTO blog_article(title,content,summary,category_id,status,view_count,like_count,create_time)
                 VALUES (?,?,?,?,1,0,0,NOW())`;
    // 摘要默认取内容前50字
    const summary = content.substring(0, 50);
    await pool.query(sql, [title, content, summary, categoryId]);
    resJson(res, 200, "文章发布成功");
  } catch (err) {
    resJson(res, 500, "发布失败，数据库异常");
  }
});

// 编辑文章
app.post("/api/article/save", checkAdmin, async (req, res) => {
  try {
    const { id, title, content, summary, categoryId, status } = req.body;
    if (!title || !content) return resJson(res, 400, "标题和内容不能为空");

    if (id) {
      await pool.query(
        `UPDATE blog_article SET title=?,content=?,summary=?,category_id=?,status=? WHERE id=?`,
        [title, content, summary, categoryId, status, id],
      );
      resJson(res, 200, "文章编辑成功");
    }
  } catch (err) {
    resJson(res, 500, "保存文章失败");
  }
});

// 删除文章
app.post("/api/article/del", checkAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query("DELETE FROM blog_article WHERE id = ?", [id]);
    await pool.query("DELETE FROM blog_comment WHERE article_id = ?", [id]);
    resJson(res, 200, "删除成功");
  } catch (err) {
    resJson(res, 500, "删除失败");
  }
});

// ===================== 分类接口 =====================
app.get("/api/category/list", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM blog_category ORDER BY sort DESC",
    );
    resJson(res, 200, "ok", rows);
  } catch (err) {
    resJson(res, 500, "获取分类失败");
  }
});

app.post("/api/category/save", checkAdmin, async (req, res) => {
  try {
    const { id, name } = req.body;
    if (!name) return resJson(res, 400, "分类名称不能为空");
    if (id) {
      await pool.query("UPDATE blog_category SET name=? WHERE id=?", [
        name,
        id,
      ]);
    } else {
      await pool.query("INSERT INTO blog_category(name) VALUES (?)", [name]);
    }
    resJson(res, 200, "操作成功");
  } catch (err) {
    resJson(res, 500, "操作失败");
  }
});

app.post("/api/category/del", checkAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query("DELETE FROM blog_category WHERE id = ?", [id]);
    resJson(res, 200, "删除成功");
  } catch (err) {
    resJson(res, 500, "删除失败");
  }
});

// ===================== 评论接口 =====================
// 发表评论
app.post("/api/comment/add", async (req, res) => {
  try {
    const { articleId, content, parentId = 0 } = req.body;
    const userId = req.session.user ? req.session.user.id : 0;
    if (!articleId || !content) return resJson(res, 400, "评论内容不能为空");
    if (parentId < 0) return resJson(res, 400, "参数错误");

    await pool.query(
      `INSERT INTO blog_comment(article_id,user_id,content,parent_id,create_time)
                      VALUES (?,?,?,?,NOW())`,
      [articleId, userId, content, parentId],
    );
    resJson(res, 200, "评论发布成功");
  } catch (err) {
    resJson(res, 500, "评论发布失败");
  }
});

// 获取单篇文章评论
app.get("/api/comment/list", async (req, res) => {
  try {
    const articleId = parseInt(req.query.articleId);
    if (!articleId) return resJson(res, 400, "文章ID错误");

    const sql = `SELECT c.*, u.nickname FROM blog_comment c 
                 LEFT JOIN blog_user u ON c.user_id = u.id 
                 WHERE c.article_id = ? ORDER BY c.create_time ASC`;
    const [rows] = await pool.query(sql, [articleId]);
    const list = rows.map((item) => ({
      ...item,
      create_time: moment(item.create_time).format("YYYY-MM-DD HH:mm"),
    }));
    resJson(res, 200, "ok", list);
  } catch (err) {
    resJson(res, 500, "获取评论失败");
  }
});

// 后台获取全部评论
app.get("/api/comment/all", checkAdmin, async (req, res) => {
  try {
    const sql = `SELECT c.*, u.nickname 
                 FROM blog_comment c 
                 LEFT JOIN blog_user u ON c.user_id = u.id 
                 ORDER BY c.create_time DESC`;
    const [rows] = await pool.query(sql);
    resJson(res, 200, "ok", rows);
  } catch (err) {
    resJson(res, 500, "获取评论列表失败");
  }
});

// 删除评论
app.post("/api/comment/del", checkAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query("DELETE FROM blog_comment WHERE id = ?", [id]);
    resJson(res, 200, "评论已删除");
  } catch (err) {
    resJson(res, 500, "删除失败");
  }
});

// ===================== 搜索 & 归档 =====================
app.get("/api/search", async (req, res) => {
  try {
    const kw = req.query.kw || "";
    const sql = `SELECT id,title,summary,create_time FROM blog_article 
                 WHERE status=1 AND (title LIKE ? OR content LIKE ?)`;
    const [rows] = await pool.query(sql, [`%${kw}%`, `%${kw}%`]);
    const list = rows.map((item) => ({
      ...item,
      create_time: moment(item.create_time).format("YYYY-MM-DD"),
    }));
    resJson(res, 200, "ok", list);
  } catch (err) {
    resJson(res, 500, "搜索失败");
  }
});

app.get("/api/archive", async (req, res) => {
  try {
    const sql = `SELECT DATE_FORMAT(create_time,'%Y-%m') as month, COUNT(*) as count, id,title,create_time
                 FROM blog_article WHERE status=1 GROUP BY month ORDER BY month DESC`;
    const [rows] = await pool.query(sql, []);
    resJson(res, 200, "ok", rows);
  } catch (err) {
    resJson(res, 500, "获取归档失败");
  }
});

// ===================== 站点配置 =====================
app.get("/api/setting", async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM blog_setting LIMIT 1");
  resJson(res, 200, "ok", rows[0]);
});

app.post("/api/setting/save", checkAdmin, async (req, res) => {
  const { siteName, siteDesc } = req.body;
  await pool.query(
    "UPDATE blog_setting SET site_name=?, site_desc=? WHERE id=1",
    [siteName, siteDesc],
  );
  resJson(res, 200, "配置保存成功");
});

// 启动服务
app.listen(PORT, () => {
  console.log("=============================================");
  console.log("✅ 博客服务启动成功！");
  console.log(`🌐 前台地址：http://localhost:${PORT}`);
  console.log(`🔧 后台地址：http://localhost:${PORT}/admin/index.html`);
  console.log("=============================================");
});
