const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.get("/", (_req,res)=>res.send("Build Battle 3D multiplayer server is online."));
const server = http.createServer(app);
const io = new Server(server,{
  cors:{origin:"*",methods:["GET","POST"]},
  transports:["websocket","polling"]
});
const rooms = new Map();
const PORT = process.env.PORT || 3000;

function cleanCode(value){
  return String(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16);
}
function snapshot(room){
  return {players:[...room.players.values()].map(p=>({id:p.id,x:p.x,z:p.z,yaw:p.yaw}))};
}
function broadcast(room){
  io.to(room.code).emit("state",snapshot(room));
}
io.on("connection",socket=>{
  let currentRoom=null;
  function leave(){
    if(!currentRoom)return;
    const room=rooms.get(currentRoom);
    if(room){room.players.delete(socket.id);socket.to(currentRoom).emit("opponentLeft");if(room.players.size===0)rooms.delete(currentRoom);else broadcast(room);}
    socket.leave(currentRoom);currentRoom=null;
  }
  socket.on("createRoom",(callback)=>{
    leave();
    let code;
    do{code=Math.random().toString(36).slice(2,8).toUpperCase()}while(rooms.has(code));
    const room={code,players:new Map()};
    rooms.set(code,room);currentRoom=code;socket.join(code);
    room.players.set(socket.id,{id:socket.id,x:0,z:8,yaw:0});
    callback?.({ok:true,code,spawn:{x:0,z:8}});
    broadcast(room);
  });
  socket.on("joinRoom",(raw,callback)=>{
    const code=cleanCode(raw),room=rooms.get(code);
    if(!room){callback?.({ok:false,error:"Room not found. Check the code."});return;}
    if(room.players.size>=2){callback?.({ok:false,error:"That room is full."});return;}
    leave();currentRoom=code;socket.join(code);
    room.players.set(socket.id,{id:socket.id,x:0,z:-8,yaw:Math.PI});
    callback?.({ok:true,code,spawn:{x:0,z:-8}});
    socket.to(code).emit("message","Opponent joined!");
    broadcast(room);
  });
  socket.on("move",data=>{
    if(!currentRoom)return;const room=rooms.get(currentRoom),p=room?.players.get(socket.id);if(!p)return;
    p.x=Math.max(-44,Math.min(44,Number(data?.x)||0));
    p.z=Math.max(-44,Math.min(44,Number(data?.z)||0));
    p.yaw=Number(data?.yaw)||0;broadcast(room);
  });
  socket.on("build",data=>{
    if(!currentRoom)return;
    const room=rooms.get(currentRoom);if(!room)return;
    socket.to(currentRoom).emit("message","Opponent placed a "+String(data?.type||"build")+".");
  });
  socket.on("shoot",()=>{if(currentRoom)socket.to(currentRoom).emit("message","Opponent fired!");});
  socket.on("leaveRoom",leave);
  socket.on("disconnect",leave);
});
server.listen(PORT,()=>console.log("Build Battle 3D server listening on "+PORT));
