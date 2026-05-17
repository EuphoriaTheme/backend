import queryOtherServers from "./queryOtherServers.js";

export default async function handleDefaultGame(game, ip, port) {
  return await queryOtherServers(game, ip, port);
}
