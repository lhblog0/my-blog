const mysql = require("mysql2/promise");

// 数据库连接配置（你的信息已经填好了，不用改！）
const pool = mysql.createPool({
  host: "mysql7.sqlpub.com",
  port: 3312,
  user: "blog_admin11",
  password: "PVnh32UgPzNBtIoM",
  database: "my_blog_db11",
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false },
});

// 导出数据库连接，给博客的其他代码用
module.exports = pool;
