const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'mysql7.sqlpub.com',
  port: 3312,
  user: 'blog_admin11',
  password: 'PVnh32UgPzNBtIoM',
  database: 'my_blog_db11'
};

async function test() {
  try {
    console.log('正在连接SQLPub...');
    const conn = await mysql.createConnection(dbConfig);
    console.log('✅ 数据库连接成功！');
    
    const [rows] = await conn.execute('SELECT 1 as test;');
    console.log('✅ 测试查询结果：', rows[0].test);
    console.log('🎉 本地数据库连通性测试通过！');
    
    await conn.end();
  } catch (err) {
    console.error('❌ 连接失败：', err.message);
  }
}

test();