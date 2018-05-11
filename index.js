// index.js
// 用于引入babel，并且启动app.js

const log4js = require('log4js');
log4js.configure({
  appenders: {
    out: { type: 'console' },
    app: {
      type: 'dateFile',
      filename: 'logs/application.log',
      pattern: 'yyyy-MM-dd'
    }
  },
  categories: {
    default: { appenders: ['out', 'app'], level: 'debug' }
  }
})
const logger = log4js.getLogger('index.js');
logger.info('===================================');
logger.info('app start');
require("babel-core/register");
require("babel-polyfill");  // 解决async
require("./src/app.js");