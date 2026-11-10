/*
 * BOSS 工作台 · 本地 AI 中转
 * ------------------------------------------------------------
 * 有些 AI 服务商不允许网页直接调用（浏览器会报「跨域」错误），
 * 在自己电脑上运行这个小程序，让请求从本机转一下就能用了。
 *
 * 用法：
 *   1. 电脑安装 Node.js（18 或更新版本）：https://nodejs.org
 *   2. 在这个文件所在的文件夹打开终端，运行：  node ai-proxy.js
 *   3. 回到 BOSS 工作台「设置 → AI 接口」，把「接口地址」改成：
 *        http://127.0.0.1:8787/ + 原来的地址
 *      例如： http://127.0.0.1:8787/https://api.deepseek.com
 *   4. 用完关掉终端窗口即可。
 *
 * 说明：
 *   - 只监听本机 127.0.0.1，局域网里的其他电脑访问不到。
 *   - 不保存、不记录任何内容，API Key 只是原样转给你填的服务商。
 *   - 想换端口：  PORT=9000 node ai-proxy.js
 *
 * Developed by @赛博老爸 · 仅限个人非商业使用，详见 LICENSE
 */
'use strict';

var http = require('http');
var https = require('https');

var PORT = parseInt(process.env.PORT, 10) || 8787;
var HOST = '127.0.0.1';

// 这些请求头不往外转：浏览器自带的来源信息、连接相关的头
var DROP = ['host', 'origin', 'referer', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer'];

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || 'authorization, content-type, x-api-key, anthropic-version, anthropic-beta',
    'Access-Control-Max-Age': '86400'
  };
}

function send(res, code, headers, text) {
  headers['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(code, headers);
  res.end(JSON.stringify({ error: { message: text } }));
}

var server = http.createServer(function (req, res) {
  var cors = corsHeaders(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  var raw = req.url.replace(/^\/+/, '');
  if (/^https?%3A/i.test(raw)) raw = decodeURIComponent(raw);
  if (!/^https?:\/\//i.test(raw)) {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, cors));
    res.end('BOSS 工作台 AI 中转已运行。\n在工作台里把接口地址写成： http://127.0.0.1:' + PORT + '/https://api.deepseek.com\n');
    return;
  }

  var target;
  try { target = new URL(raw); } catch (e) { send(res, 400, cors, '接口地址不对：' + raw); return; }

  var headers = {};
  Object.keys(req.headers).forEach(function (k) {
    if (DROP.indexOf(k) >= 0 || k.indexOf('sec-') === 0) return;
    headers[k] = req.headers[k];
  });

  var lib = target.protocol === 'https:' ? https : http;
  var up = lib.request(target, { method: req.method, headers: headers }, function (r) {
    var h = {};
    Object.keys(r.headers).forEach(function (k) {
      if (k.indexOf('access-control-') === 0 || k === 'connection' || k === 'transfer-encoding') return;
      h[k] = r.headers[k];
    });
    res.writeHead(r.statusCode || 502, Object.assign(h, cors));
    r.pipe(res); // 流式输出原样转回，打字机效果不受影响
  });
  up.setTimeout(180000, function () { up.destroy(new Error('等了 3 分钟还没有响应')); });
  up.on('error', function (e) {
    if (res.headersSent) { res.end(); return; }
    send(res, 502, cors, '中转失败：' + e.message + '（检查网络，或者服务商地址是否正确）');
  });
  req.pipe(up);
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') console.error('端口 ' + PORT + ' 被占用了，可以换一个：PORT=9000 node ai-proxy.js');
  else console.error(e.message);
  process.exit(1);
});

server.listen(PORT, HOST, function () {
  console.log('');
  console.log('  BOSS 工作台 · AI 中转已启动');
  console.log('  把工作台里的接口地址改成： http://' + HOST + ':' + PORT + '/ + 原地址');
  console.log('  例如： http://' + HOST + ':' + PORT + '/https://api.deepseek.com');
  console.log('  用完关掉这个窗口即可（Ctrl + C）');
  console.log('');
});
