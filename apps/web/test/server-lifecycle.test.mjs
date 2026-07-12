import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("importing the server does not bind a listening socket", () => {
  const serverModule = require("../server.js");
  assert.equal(typeof serverModule.createServer, "function");

  const server = serverModule.createServer();
  assert.equal(server.listening, false);
  server.close();
});
