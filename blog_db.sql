-- 创建博客数据库
CREATE DATABASE IF NOT EXISTS blog_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE blog_db;

-- 用户表
CREATE TABLE blog_user (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
  password VARCHAR(100) NOT NULL COMMENT '加密密码',
  nickname VARCHAR(30) DEFAULT '' COMMENT '昵称',
  avatar VARCHAR(255) DEFAULT '' COMMENT '头像地址',
  role ENUM('user','admin') DEFAULT 'user' COMMENT '角色：普通用户/管理员',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 管理员登录锁定表（单独存储管理员错误次数、锁定时间）
CREATE TABLE admin_login_lock (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admin_username VARCHAR(50) NOT NULL UNIQUE COMMENT '管理员用户名',
  error_count INT DEFAULT 0 COMMENT '累计密码错误次数',
  lock_end_time BIGINT DEFAULT 0 COMMENT '锁定结束时间戳(毫秒)，0=未锁定',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 文章表
CREATE TABLE blog_article (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL COMMENT '文章标题',
  content LONGTEXT NOT NULL COMMENT 'Markdown原文',
  summary VARCHAR(255) DEFAULT '' COMMENT '文章摘要',
  category_id INT DEFAULT 0 COMMENT '所属分类ID',
  view_count INT DEFAULT 0 COMMENT '阅读量',
  like_count INT DEFAULT 0 COMMENT '点赞数',
  status TINYINT DEFAULT 0 COMMENT '0=草稿 1=已发布',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 分类表
CREATE TABLE blog_category (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE COMMENT '分类名称',
  sort INT DEFAULT 0 COMMENT '排序权重'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 标签表
CREATE TABLE blog_tag (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE COMMENT '标签名称'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 文章-标签关联表（多对多）
CREATE TABLE blog_article_tag (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL,
  tag_id INT NOT NULL,
  UNIQUE KEY art_tag_unique (article_id, tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 评论表（支持楼中楼回复）
CREATE TABLE blog_comment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL COMMENT '关联文章ID',
  user_id INT DEFAULT 0 COMMENT '评论用户ID',
  content VARCHAR(500) NOT NULL COMMENT '评论内容',
  parent_id INT DEFAULT 0 COMMENT '父评论ID，0=一级评论',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 站点配置表
CREATE TABLE blog_setting (
  id INT PRIMARY KEY AUTO_INCREMENT,
  site_name VARCHAR(50) DEFAULT '个人博客' COMMENT '站点名称',
  site_desc VARCHAR(255) DEFAULT '记录生活与技术' COMMENT '站点简介'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始化站点配置
INSERT INTO blog_setting(site_name, site_desc) VALUES ('个人博客', '高颜值全功能博客系统');

INSERT INTO blog_user(username, password, nickname, role) 
VALUES (
  'cloimaomao?1.33',
  '$2b$10$ZJ9X7s9r0w8e7q6a5s4d3f2g1h0j9k8l7m6n5o4p3q2r1s0t9u8v7w6x5y4z3',
  '超级管理员',
  'admin'
);

-- 初始化管理员登录锁定记录（初始0次错误、未锁定）
INSERT INTO admin_login_lock(admin_username, error_count, lock_end_time)
VALUES ('cloimaomao?1.33', 0, 0);