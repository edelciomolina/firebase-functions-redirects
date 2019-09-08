void (function() {
  const ffr = require("../index");
  const services = require("../functions/services");
  const port = 3000;
  ffr.run({ services, port }).then(state => {
    ffr.stop();
  });
})();
