const mysql = require("mysql2/promise");

// 数据库连接配置（用你自己的信息）
const pool = mysql.createPool({
  host: "mysql7.sqlpub.com",
  port: 3312,
  user: "blog_admin11",
  password: "PVnh32UgPzNBtIoM",
  database: "my_blog_db11",
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false },
});

// 自动创建表的函数
async function initDB() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ 表已创建/已存在，初始化完成！");
  } catch (err) {
    console.error("❌ 建表失败:", err);
  } finally {
    connection.release();
  }
}

// 运行初始化
initDB();

module.exports = pool;
