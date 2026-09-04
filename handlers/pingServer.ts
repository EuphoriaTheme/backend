import net from "net";

export default function pingServer(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();
    socket.setTimeout(2000);
    socket.once("connect", () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve(latency);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(-1);
    });
    socket.once("error", () => {
      resolve(-1);
    });
    socket.connect(port, ip);
  });
}
