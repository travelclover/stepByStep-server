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
io.set('origins', '*:*');
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
    // 判断玩家是否已经加入房间
    if (isJoinRoom(socket)) {
      return
    }
    // 获取未满的房间
    let room = getEmptyRoom();
    if (!room) { // 没有空房间
      // 生成一个新房间
      room = createNewRoom();
      stepByStepRooms.push(room);
    }
    // 加入房间
    await joinRoom(stepByStep, socket, room.roomName, data);
    let clients = await getRoomClients(stepByStep, room.roomName);
    if (clients.length == 2) {
      beginGame(stepByStep, room.roomName); // 开始游戏
    }
    logger.info(stepByStepRooms)
  });

  // 切换行动玩家
  socket.on('changeActionPlayer', function (data) {
    let point = transformPoint(data.x, data.y);
    let room = getRoomBySocketid(socket.id);
    let plankIndex = data.plankIndex.map(item => {
      return 360 - item;
    });
    let newData = {
      x: point.x,
      y: point.y,
      plankCount: data.plankCount,
      socketId: socket.id, // 刚行动完的玩家sockey.id
      plankIndex: plankIndex, //
    }
    stepByStep.to(room.roomName).emit('changeActionPlayer', newData);
  })

  // 结束游戏
  socket.on('gameover', function (data) {
    let room = getRoomBySocketid(socket.id);
    let newData = Object.assign({}, data, {
      roomName: room.roomName,
    })
    stepByStep.to(room.roomName).emit('gameover', newData);
    // 清理房间
    clearRoomByRoomName(room.roomName);
  })

  // 离开房间
  socket.on('leaveRoom', function (data) {
    socket.leave(data.roomName, () => {
      logger.info(socket.id + ' 离开 “' + data.roomName + '”房间');
    });
  })

  // 断开链接
  socket.on('disconnect', async function (data) {
    logger.info('断开链接，' + 'socketId:' + socket.id);
    // 将房间里的socket.id清除
    await clearRoomClient(stepByStep, socket);
  });
});

/**
 * 获取命名空间里的客户端列表
 * @param  {object}   server     命名空间服务
 * @return {array}               返回数组
 */
async function getServerClients(server) {
  let list;
  await server.clients((error, clients) => {
    if (error) throw error;
    list = clients;
  });
  return list;
}

/**
 * 获取命名空间里特定房间名的客户端列表
 * @param  {object}   server     命名空间服务
 * @param  {string}   roomName   房间名称
 * @return {array}               返回数组
 */
function getRoomClients(server, roomName) {
  return new Promise(function (resolve, reject) {
    server.in(roomName).clients((error, clients) => {
      if (error) throw error;
      resolve(clients);
    });
  })
}

/**
 * 开始游戏
 */
function beginGame(server, roomName) {
  // server.to(roomName).emit('begin')
  let room = getRoomByName(roomName);
  server.to(roomName).emit('start-game', room);
}

/**
 * 生成新房间
 */
function createNewRoom() {
  roomCount++;
  let room = {
    roomName: 'stepByStep room ' + roomCount,
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
    server.to(roomName).emit('ready', '');
  });
}

/**
 * 清除stepByStepRooms已经离开的人
 */
async function clearRoomClient(server, socket) {
  let clients = await getServerClients(server);
  let rooms = [];
  stepByStepRooms.forEach((item) => {
    let needClear = true; // 是否需要清除房间的标记
    let playerIndex = []; // 已经离开房间的玩家位置索引
    for (let i = 0; i < item.players.length; i++) {
      let socketId = clients.find(client => client == item.players[i]);
      if (socketId) {
        needClear = false;
      } else {
        playerIndex.push(i);
      }
    }
    if (playerIndex.length == 1) {
      item.players.splice(playerIndex[0], 1);
    }
    if (!needClear) {
      rooms.push(item);
    }
  })
  stepByStepRooms = rooms;
}

/**
 * 获取人数未满的房间
 */
function getEmptyRoom() {
  let room = stepByStepRooms.find(item => item.players.length < 2);
  return room;
}

// 根据房间名获取房间
function getRoomByName(roomName) {
  let room = stepByStepRooms.find(item => item.roomName == roomName);
  return room;
}

// 根据socket.id获取房间
function getRoomBySocketid(socketid) {
  let room = stepByStepRooms.find(item => {
    let tag = false;
    for (let i = 0; i < item.players.length; i++) {
      if (item.players[i] == socketid) {
        tag = true;
      }
    }
    return tag;
  });
  return room;
}

// 根据房间名清除房间
function clearRoomByRoomName(roomName) {
  let rooms = [];
  stepByStepRooms.forEach((item) => {
    if (item.roomName != roomName) {
      rooms.push(item);
    }
  })
  stepByStepRooms = rooms;
}

// 判断是否已经加入房间
function isJoinRoom(socket) {
  let room = stepByStepRooms.find(item => {
    for (let i = 0; i < item.players.length; i++) {
      if (socket.id == item.players[i]) {
        return true;
      }
    }
    return false;
  })
  return Boolean(room);
}

// 坐标转换
function transformPoint(x, y) {
  let point = {
    x: 18 - x,
    y: 18 - y,
  }
  return point;
}