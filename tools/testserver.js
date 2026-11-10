// A server.js of their own for the tests that need the real thing (tests/network.js, tests/netlink.js,
// tests/server.js): on any free port (port 0; the server prints the one it got), never one picked at random from a
// range (that range had the user's own 8080 and 8081 in it: the test then talked to their running server).
//   const { port, srv, stop } = await startServer(['--lag', '120']);
// Rejects when the server doesn't come up (it ended, or said nothing for 15 s): the test must fail then, not pass
// with nothing checked.
const { spawn } = require('child_process');
const path = require('path');

function startServer(args = [], port = 0) {             // (port: only to test what happens when it is taken)
  return new Promise((resolve, reject) => {
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), String(port), ...args], { stdio: ['ignore', 'pipe', port ? 'ignore' : 'inherit'] });
    let out = '', up = false;
    const fail = (why) => { if (up) return; clearTimeout(timer); srv.kill(); reject(new Error(`server.js did not start: ${why}`)); };
    const timer = setTimeout(() => fail('nothing after 15 s'), 15000);
    srv.stdout.on('data', (d) => {
      if (up) return;
      out += d;
      const m = /server on port (\d+)/.exec(out);
      if (m) { up = true; clearTimeout(timer); resolve({ port: +m[1], srv, stop: () => srv.kill() }); }
    });
    srv.on('error', (e) => fail(e.message));
    srv.on('exit', (code) => fail(`it ended (exit code ${code})`));
  });
}
module.exports = { startServer };
