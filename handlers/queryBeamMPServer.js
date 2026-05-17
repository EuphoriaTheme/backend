import net from "net";

export default function queryBeamMPServer(ip, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let responseData = "";

    client.setTimeout(timeout);

    client.connect(parseInt(port, 10), ip, () => {
      console.log(`Connected to BeamMP server at ${ip}:${port}`);
      const message = Buffer.from("I", "ascii");
      client.write(message);
    });

    client.on("data", (data) => {
      if (responseData === "") {
        const size = data.readInt32LE(0);
        console.log(`Expected response size: ${size}`);
        responseData = data.slice(4).toString("ascii");
      } else {
        responseData += data.toString("ascii");
      }
    });

    client.on("close", () => {
      console.log("Connection to BeamMP server closed.");

      if (responseData) {
        try {
          // Replace backslashes in the response data
          const sanitizedData = responseData.replace(/\\/g, "");

          // Parse the sanitized data as JSON
          const parsedData = JSON.parse(sanitizedData);

          // Format the playerslist if it exists
          if (parsedData.playerslist) {
            parsedData.playerslist = parsedData.playerslist
              .split(";") // Split the string into an array
              .filter((player) => player.trim() !== ""); // Remove empty entries caused by trailing semicolons
          }

          resolve(parsedData); // Resolve with the formatted data
        } catch (error) {
          console.error("Error parsing BeamMP server response:", error.message);
          reject(new Error("Failed to parse server response."));
        }
      } else {
        resolve(null); // No data received
      }
    });

    client.on("error", (error) => {
      console.error(`Error connecting to BeamMP server: ${error.message}`);
      reject(error);
    });

    client.on("timeout", () => {
      console.error("Connection to BeamMP server timed out.");
      client.destroy();
      reject(new Error("Connection timed out."));
    });
  });
}
