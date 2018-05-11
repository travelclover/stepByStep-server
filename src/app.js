const Koa = require('koa')
const cors = require('koa2-cors')
const app = new Koa()
// const response = require('./middlewares/response')
const bodyParser = require('koa-bodyparser')
const config = require('./config')
const log4js = require('log4js');
const logger = log4js.getLogger('app.js');

const http = require('http');
const server = http.createServer();
const io = require('socket.io')(server);
server.listen(config.ioPort, function () {
  logger.info('webSocket server is running on localhost:', config.ioPort);
})

// 跨域
app.use(cors({
  origin: '*'
}));

// 使用响应处理中间件
// app.use(response)

// 解析请求体
app.use(bodyParser())

// 引入路由分发
// const router = require('./routes')
// app.use(router.routes())

// 启动程序，监听端口
app.listen(config.port, () => logger.info(`listening on port ${config.port}`))

io.on('connection', function (socket) {
  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});

// stepByStep房间信息
let stepByStepRooms = [];
let roomCount = 0;
let stepByStepRoom = {
  players: [],
  time: 0, // 游戏时间
}

let stepByStep = io.of('/stepByStep');
stepByStep.on('connection', function (socket) {
  socket.emit('news', { hello: 'stepByStep' });
  socket.on('my other event', function (data) {
    console.log(data);
  });

  socket.emit('room info', { hello: 'stepByStep' });

  // 玩家准备
  socket.on('ready', async function (data) {
    // 获取最近房间客户端数量
    let room = stepByStepRooms.length > 0 ? stepByStepRooms[stepByStepRooms.length - 1] : null;
    if (room) {
      let clients = await getRoomClients(stepByStep, room.roomName);
      if (clients.length < 2) {
        await joinRoom(stepByStep, socket, room.roomName, data);
        // 判断人数是否已满，已满则开始游戏
        if (clients.length + 1 == 2) {
          beginGame(); // 开始游戏
        }
      } else { // 人数已满
        // 生成一个新房间
        room = createNewRoom();
        stepByStepRooms.push(room);
        // 加入房间
        await joinRoom(stepByStep, socket, room.roomName, data);
      }
    } else {
      // 生成一个新房间
      room = createNewRoom();
      stepByStepRooms.push(room);
      // 加入房间
      await joinRoom(stepByStep, socket, room.roomName, data);
    }
    logger.info(stepByStepRooms)
  });

  // 断开链接
  socket.on('disconnect', function (data) {
    logger.info('断开链接，' + 'socketId:' + socket.id);
  });
});

/**
 * 获取命名空间里特定房间名的客户端列表
 * @param  {object}   server     命名空间服务
 * @param  {string}   roomName   房间名称
 * @return {array}               返回数组
 */
async function getRoomClients(server, roomName) {
  let list;
  await server.in(roomName).clients((error, clients) => {
    if (error) throw error;
    list = clients;
  });
  return list;
}

/**
 * 开始游戏
 */
function beginGame(server, roomName) {
  // server.to(roomName).emit('begin')
  console.log('begin')
}

/**
 * 生成新房间
 */
function createNewRoom() {
  roomCount++;
  let room = {
    roomName: roomCount,
    createTime: new Date().getTime(),
    players: [], // 玩家列表
  }
  return room;
}

/**
 * 加入房间
 * @param  {object}   server     命名空间服务
 * @param  {object}   socket     socket
 * @param  {string}   roomName   房间名称
 * @param  {object}   data       数据
 */
async function joinRoom(server, socket, roomName, data) {
  await socket.join(roomName, async () => {
    let room = stepByStepRooms.find(item => item.roomName == roomName);
    room.players.push(data.socketId);
    server.to(roomName).emit('message', 'a new user has joined the room');
  });
}