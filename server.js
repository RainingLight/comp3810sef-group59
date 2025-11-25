require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

dotenv.config();

const app = express();

// 设置视图引擎和视图目录
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 设置静态资源目录
app.use(express.static(path.join(__dirname, 'public')));

// 中间件配置
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // 让 RESTful API 能解析 JSON
app.use(methodOverride('_method'));

// 会话配置
app.use(session({
  secret: process.env.SESSION_SECRET || 'mySuperSecretKey123!',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/groupApp'
  }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// 用户模型
const userSchema = new mongoose.Schema({
  username: String,
  password: String
});
const User = mongoose.model('User', userSchema);

// 数据模型 (CRUD 对象，例如 Todo 项目)
const itemSchema = new mongoose.Schema({
  title: String,
  description: String,
  createdAt: { type: Date, default: Date.now }
});
const Item = mongoose.model('Item', itemSchema);

// 数据库连接
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/groupApp')
  .then(() => console.log(' MongoDB connected'))
  .catch(err => console.error(' MongoDB connection error:', err));

// 登录页面
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// 注册页面
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// 注册逻辑
app.post('/register', async (req, res) => {
  const { username, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.render('register', { error: 'The passwords you entered do not match, please try again.' });
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.render('register', { error: 'The username already exists, please choose a different username.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, password: hashedPassword });
  await newUser.save();

  res.redirect('/login');
});

// 登录逻辑
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (!user) {
    return res.render('login', { error: 'The username does not exist.' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.render('login', { error: 'Incorrect password, please try again.' });
  }

  req.session.userId = user._id;
  req.session.username = user.username;
  res.redirect('/crud'); // 登录成功后跳转到首页
});

// 注销
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// 首页 
app.get('/crud', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const items = await Item.find();
  res.render('crud', { user: { username: req.session.username }, items });
});

// 根路径跳转
app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.redirect('/crud');
});

// Create 页面
app.get('/create', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('create');
});

app.post('/create', async (req, res) => {
  const { title, description } = req.body;
  const newItem = new Item({ title, description });
  await newItem.save();
  res.redirect('/crud');
});

// Update 页面
app.get('/update/:id', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const item = await Item.findById(req.params.id);
  res.render('update', { item });
});

app.post('/update/:id', async (req, res) => {
  const { title, description } = req.body;
  await Item.findByIdAndUpdate(req.params.id, { title, description });
  res.redirect('/crud');
});

// Delete 操作
app.post('/delete/:id', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  await Item.findByIdAndDelete(req.params.id);
  res.redirect('/crud');
});

/* ----------------- RESTful API ----------------- */

// Create (POST)
app.post('/api/items', async (req, res) => {
  const { title, description } = req.body;
  const newItem = new Item({ title, description });
  await newItem.save();
  res.json({ message: 'Item created successfully', item: newItem });
});

// Read (GET)
app.get('/api/items', async (req, res) => {
  const items = await Item.find();
  res.json(items);
});

// Update (PUT)
app.put('/api/items/:id', async (req, res) => {
  const { title, description } = req.body;
  const updatedItem = await Item.findByIdAndUpdate(
    req.params.id,
    { title, description },
    { new: true }
  );
  res.json({ message: 'Item updated successfully', item: updatedItem });
});

// Delete (DELETE)
app.delete('/api/items/:id', async (req, res) => {
  await Item.findByIdAndDelete(req.params.id);
  res.json({ message: 'Item deleted successfully' });
});

/* ----------------- 启动服务器 ----------------- */
const PORT = process.env.PORT || 8099;
app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
});
