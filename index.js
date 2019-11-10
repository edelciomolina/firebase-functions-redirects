const fs = require("fs");
const util = require("util");
const nrc = require("node-run-cmd");
const express = require("express");

let services = {};
let serverPort = 3000;
let serverDone = false;
let httpServer = null;

const serveFirebase = async () => {
  let timer = setTimeout(() => {});
  nrc.run("cmd.exe /c firebase serve", {
    onData: data => {
      console.log(data);
      if (!serverDone) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          serverDone = true;
          return;
        }, 2000);
      }
    },
    onError: data => {
      if (!!data.trim()) {
        console.log(data);
        serverDone = true;
        return;
      }
    }
  });

  const resolveAfterDone = () => {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (serverDone) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  };
  await resolveAfterDone();
};

const runExpress = async () => {
  const app = express();
  const config = await getFirebaseJson();
  const message = `---------------------------------\n>>> Functions Running at ${serverPort} <<<\n---------------------------------`;
  try {
    await config.hosting.rewrites.forEach(item => {
      item.function && app.get(item.source, services[item.function]);
    });
    app.get("/", (req, res) => res.send(message));
    httpServer = await app.listen(serverPort);
    console.info(message);
  } catch (error) {}
};

const getFirebaseJson = async suffix => {
  try {
    const readFile = util.promisify(fs.readFile);
    const contents = await readFile(
      `${process.cwd()}\\firebase.json${suffix || ""}`,
      "utf8"
    );
    return !!contents ? JSON.parse(contents) : {};
  } catch (error) {
    return {};
  }
};

const saveFirebaseJson = async (config, suffix) => {
  const writeFile = util.promisify(fs.writeFile);
  return await writeFile(
    `${process.cwd()}\\firebase.json${suffix || ""}`,
    JSON.stringify(config, null, 2)
  );
};

const deleteFirebaseJsonBackup = async () => {
  const unlink = util.promisify(fs.unlink);
  return await unlink(`${process.cwd()}\\firebase.json.bkp`);
};

const backupFirebaseJson = async () => {
  let config = await getFirebaseJson();
  if (config.backup) {
    await recoverFirebaseJson();
    config = await getFirebaseJson();
  }
  config.backup = new Date();
  await saveFirebaseJson(config, ".bkp");
};

const replaceFirebaseJson = async () => {
  let config = await getFirebaseJson();
  await config.hosting.rewrites.forEach(item => {
    if (item && item.function) {
      config.hosting.redirects = config.hosting.redirects || [];
      config.hosting.redirects.push({
        source: item.source,
        destination: `http://localhost:${serverPort}${item.source}`
      });

      const deleteByValue = (obj, val) => {
        for (let index = 0; index < obj.length; index++) {
          const element = obj[index] || {};
          if (element.source == val) {
            delete obj[index];
          }
        }
      };

      deleteByValue(config.hosting.rewrites, item.source);
    }
  });
  await saveFirebaseJson(config);
};

const recoverFirebaseJson = async () => {
  let config = await getFirebaseJson(".bkp");
  delete config.backup;
  await saveFirebaseJson(config);
};

const stop = async () => {
  httpServer.getConnections(() => {});
  httpServer.close();
};

const run = async config => {
  services = config.services || {};
  serverPort = config.port || serverPort;

  await backupFirebaseJson();
  await replaceFirebaseJson();
  await serveFirebase();
  await recoverFirebaseJson();
  await deleteFirebaseJsonBackup();
  await runExpress();
  return { running: true };
};

module.exports = {
  run,
  stop
};
