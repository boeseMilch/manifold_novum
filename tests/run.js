#!/usr/bin/env node
// Runs the test files (every tests/*.js except the harness and this runner), each in its own node process, a few
// at a time. One line per file (ok / FAIL, seconds), then the output of the files that failed; exits non-zero when
// any failed.
//   node tests/run.js                  all of them
//   node tests/run.js dock net         only the files with "dock" or "net" in their name
//   node tests/run.js -j 1             one at a time (default: 4 at once, fewer on a small machine)
//   node tests/run.js -v               every file's output, not just the failing ones'
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const NOT_TESTS = ['harness.js', 'run.js'];
const TIMEOUT = 600;                                   // seconds: a hung test is a failed one

const args = process.argv.slice(2), filters = [];
let jobs = Math.max(1, Math.min(4, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1)), verbose = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-j') jobs = Math.max(1, +args[++i] || 1);
  else if (/^-j\d+$/.test(args[i])) jobs = Math.max(1, +args[i].slice(2));
  else if (args[i] === '-v') verbose = true;
  else if (args[i] === '-h' || args[i] === '--help') { console.log('usage: node tests/run.js [-j N] [-v] [part of a file name ...]'); process.exit(0); }
  else filters.push(path.basename(args[i]));           // ("tests/dock.js" works as well as "dock")
}

const all = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !NOT_TESTS.includes(f)).sort();
const files = filters.length ? all.filter(f => filters.some(p => f.includes(p))) : all;
if (!files.length) { console.error(`no test file matches ${filters.join(', ')}`); process.exit(2); }

function run(file) {
  return new Promise((resolve) => {
    const t0 = Date.now(), out = [];
    const child = spawn(process.execPath, [path.join(__dirname, file)], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => out.push(d)); child.stderr.on('data', d => out.push(d));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, TIMEOUT * 1000);
    child.on('error', (e) => { out.push(Buffer.from(String(e))); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const text = Buffer.concat(out).toString();
      // every check prints "ok  …" or "FAIL  …": a file that exits 0 without one checked nothing
      const n = (text.match(/^(ok {2}|FAIL)/gm) || []).length;
      const why = timedOut ? `no end after ${TIMEOUT} s` : signal ? `killed (${signal})` : code ? `exit ${code}` : !n ? 'exit 0 without a single check' : '';
      resolve({ file, ok: !why, why, secs: (Date.now() - t0) / 1000, n, text });
    });
  });
}

(async () => {
  const t0 = Date.now(), results = [], queue = files.slice();
  const worker = async () => {
    for (let f; (f = queue.shift());) {
      const r = await run(f);
      results.push(r);
      console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.file.padEnd(24)} ${r.secs.toFixed(1).padStart(6)} s  ${String(r.n).padStart(4)} checks${r.why ? '  (' + r.why + ')' : ''}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));

  const bad = results.filter(r => !r.ok).sort((a, b) => a.file.localeCompare(b.file));
  for (const r of verbose ? results.slice().sort((a, b) => a.file.localeCompare(b.file)) : bad) {
    console.log(`\n----- tests/${r.file}${r.ok ? '' : ': ' + r.why} -----`);
    // a failing file: its FAIL lines and whatever isn't a passed check (a stack trace, the summary); -v: all of it
    const lines = r.text.replace(/\n+$/, '').split('\n');
    console.log((verbose ? lines : lines.filter(l => !l.startsWith('ok  '))).join('\n').trim() || '(no output)');
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1), checks = results.reduce((s, r) => s + r.n, 0);
  console.log(bad.length
    ? `\n${bad.length} of ${results.length} test files FAILED (${secs} s): ${bad.map(r => r.file).join(' ')}`
    : `\nall ${results.length} test files passed (${checks} checks, ${secs} s)`);
  process.exit(bad.length ? 1 : 0);
})();
