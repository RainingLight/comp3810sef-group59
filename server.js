require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const bcrypt = require('bcrypt');

// 初始化Express应用
const app = express();

// 设置视图引擎和视图目录
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 设置静态资源目录
app.use(express.static(path.join(__dirname, 'public')));

// 中间件配置
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));

// 会话配置（必须优先初始化）
app.use(session({
  secret: process.env.SESSION_SECRET || 'mySuperSecretKey123!',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/groupApp'
  }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1天有效期
}));

// 数据库连接（必须优先于路由定义）
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/groupApp')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('🚨 MongoDB connection failed:', err.message);
    process.exit(1); // 启动失败时退出进程
  });

// 用户模型（仅保留username和password）
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, // 数据库级别唯一约束
    required: true 
  },
  password: { 
    type: String, 
    required: true 
  }
});
const User = mongoose.model('User', userSchema);

// 数据模型
const itemSchema = new mongoose.Schema({
  title: String,
  description: String,
  createdAt: { type: Date, default: Date.now }
});
const Item = mongoose.model('Item', itemSchema);

// 注册页面
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// 注册逻辑
app.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    // 验证密码一致性
    if (password !== confirmPassword) {
      return res.render('register', { 
        error: 'Passwords do not match' 
      });
    }

    // 检查用户名唯一性
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('register', { 
        error: 'Username already exists' 
      });
    }

    // 密码哈希处理
    const hashedPassword = await bcrypt.hash(password, 12); // 盐值成本提升至12
    
    // 创建并保存用户
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    // 注册成功重定向
    res.redirect('/login');
    
  } catch (error) {
    console.error('🚨 Registration error:', error);
    res.status(500).render('register', { 
      error: 'Registration failed. Please try again later.' 
    });
  }
});

// 登录页面
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// 登录逻辑
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (!user) {
    return res.render('login', { 
      error: 'Invalid credentials' 
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.render('login', { 
      error: 'Invalid credentials' 
    });
  }

  // 设置会话信息
  req.session.userId = user._id;
  req.session.username = user.username;
  res.redirect('/crud');
});

// 注销功能
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// 受保护路由示例
const authMiddleware = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// CRUD功能路由
app.get('/crud', authMiddleware, async (req, res) => {
  const items = await Item.find();
  res.render('crud', { 
    user: { username: req.session.username }, 
    items 
  });
});

// RESTful API端点
app.get('/api/items', authMiddleware, async (req, res) => {
  const items = await Item.find();
  res.json(items);
});

// 启动服务器
const PORT = process.env.PORT || 8099;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
