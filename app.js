#!/usr/bin/env node
//测试Github Action 打包
require('dotenv').config()
const path = require('path');
const express = require('express');

const compression = require('compression');
const bodyParser = require('body-parser'); // 获取 req.body
const history = require('connect-history-api-fallback');
const http = require('http');
const https = require('https');
const fs = require('fs');

// Crash the process on "unhandled promise rejection" when NODE_ENV=test or CRASH_ON_UNHANDLED exists
if (process.env.NODE_ENV === 'test' || process.env.CRASH_ON_UNHANDLED) {
  process.on('unhandledRejection', (reason, promise) => {
    console.error(new Date().toJSON(), 'Kikoeru log: Unhandled rejection at ', promise, `reason: ${reason}`);
    console.error('Crashing the process because of NODE_ENV or CRASH_ON_UNHANDLED settings');
    process.exit(1)
  })
}

const { initApp }= require('./database/init');
const initSocket = require('./socket');
const { config } = require('./config');
const api = require('./api');
const app = express();

// Initialize database if not exists 
// Init or migrate database and config
// Note: non-blocking
initApp().catch(err => console.error(err));

if (config.behindProxy) {
  // Only useful if you are using a reverse proxy e.g. nginx
  // This is used to detect correct remote IP address which will be used in express-brute and some routes
  // You MUST set a X-Forwarded-For header in your reverse proxy to make it work
  // By default, behindProxy is false
  app.set('trust proxy', 'loopback')
}

if (config.enableGzip) {
  app.use(compression());
}

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
// parse application/json
app.use(bodyParser.json());

// For dev purpose only
if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line node/no-unpublished-require
  app.use('/media/stream/VoiceWork', express.static('VoiceWork'), require('serve-index')('VoiceWork', {'icons': true}));
  // eslint-disable-next-line node/no-unpublished-require
  app.use('/media/download/VoiceWork', express.static('VoiceWork'), require('serve-index')('VoiceWork', {'icons': true}));
}

// connect-history-api-fallback 中间件后所有的 GET 请求都会变成 index (default: './index.html').
app.use(history({
  // 将所有带 api 的 GET 请求都代理到 parsedUrl.path, 其实就是原来的路径
  rewrites: [
    {
      from: /^\/api\/.*$/,
      to: context => context.parsedUrl.path
    }
  ]
}));
// Expose API routes
api(app);

// Serve WebApp routes
app.use(express.static(path.join(__dirname, './dist')));

// 返回错误响应
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') { 
    // 验证错误
    res.set("WWW-Authenticate", "Bearer realm=\"Authorization Required\"");
    res.status(401).send({ error: err.message });
  } else if (err.code === 'SQLITE_ERROR') {
    if (err.message.indexOf('no such table') !== -1) {
      res.status(500).send({ error: '数据库结构尚未建立，请先执行扫描.'});
    }
  } else {
    console.error(new Date().toJSON(), 'Kikoeru log:', err);
    if (process.env.NODE_ENV === 'production' || config.production) {
      // Do not send excess error messages to the client on production mode
      res.status(500).send({ error: '服务器错误' });
    } else {
      res.status(500).send({ error: err.message || err });
    }
  }
});

// Create HTTP and HTTPS server
const server = http.createServer(app);
let httpsServer = null;
let httpsSuccess = false;
if (config.httpsEnabled) {
  try {
    httpsServer = https.createServer({
      key: fs.readFileSync(config.httpsPrivateKey),
      cert: fs.readFileSync(config.httpsCert),
    },app);
    httpsSuccess = true;
  } catch (err) {
    console.error('HTTPS服务器启动失败，请检查证书位置以及是否文件可读')
    console.error(err);
  }
}

// websocket 握手依赖 http 服务
initSocket(server);
if (config.httpsEnabled) {
  initSocket(httpsServer);
}

const listenPort = process.env.PORT || config.listenPort || 8888;
const localOnly = config.blockRemoteConnection;

// Note: for some unknown reasons, :: does not always work 
localOnly ? server.listen(listenPort, 'localhost') : server.listen(listenPort)
if (config.httpsEnabled && httpsSuccess) {
  localOnly ? httpsServer.listen(config.httpsPort, 'localhost') : httpsServer.listen(config.httpsPort)
}

server.on('listening', () => {
  console.log('Express server started on port %s at %s', server.address().port, server.address().address);
})

if (config.httpsEnabled && httpsSuccess) {
  httpsServer.on('listening', () => {
    console.log('Express server started on port %s at %s', httpsServer.address().port, httpsServer.address().address);
  })
}
