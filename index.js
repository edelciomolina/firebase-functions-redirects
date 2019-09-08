void (function(root) {
  const fs = require("fs");
  const util = require("util");
  const nrc = require("node-run-cmd");
  const express = require("express");
  const services = {};

  let serverPort = 3000;
  let serverDone = false;

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
    const message = `Functions Running at ${serverPort}`;
    try {
      await config.hosting.rewrites.forEach(item => {
        item.function && app.get(item.source, services[item.function]);
      });
      app.get("/", (req, res) => res.send(message));
      await app.listen(serverPort);
      console.info(message);
    } catch (error) {}
  };

  const getFirebaseJson = async suffix => {
    const readFile = util.promisify(fs.readFile);
    const contents = await readFile(`firebase.json${suffix || ""}`, "utf8");
    return !!contents ? JSON.parse(contents) : {};
  };

  const saveFirebaseJson = async (config, suffix) => {
    const writeFile = util.promisify(fs.writeFile);
    return await writeFile(
      `firebase.json${suffix || ""}`,
      JSON.stringify(config, null, 2)
    );
  };

  const backupFirebaseJson = async () => {
    let config = await getFirebaseJson();
    if (!config.backup) {
      await recoverFirebaseJson();
      config = await getFirebaseJson();
    }
    config.backup = new Date();
    await saveFirebaseJson(config, ".bkp");
  };

  const replaceFirebaseJson = async () => {
    let config = await getFirebaseJson();
    await config.hosting.rewrites.forEach(item => {
      if (item.function) {
        config.hosting.redirects = config.hosting.redirects || [];
        config.hosting.redirects.push({
          source: item.source,
          destination: `http://localhost:${serverPort}${item.source}`
        });

        const deleteByValue = (obj, val) => {
          for (let index = 0; index < obj.length; index++) {
            const element = obj[index];
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

  const run = async config => {
    services = config.services || {};
    serverPort = config.port || serverPort;

    await runExpress();
    await backupFirebaseJson();
    await replaceFirebaseJson();
    await serveFirebase();
    await recoverFirebaseJson();
  };

  module.exports = {
    run
  };
})(this);
