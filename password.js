const bcrypt = require("bcrypt");

bcrypt.hash("Zhians@123", 10).then(hash => {
  console.log(hash);
});
