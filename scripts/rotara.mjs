import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const IS_WIN = process.platform === "win32";

const VENV_DIR = path.join(BACKEND_DIR, ".venv");
const VENV_PYTHON = IS_WIN
  ? path.join(VENV_DIR, "Scripts", "python.exe")
  : path.join(VENV_DIR, "bin", "python");

function prefixWrite(prefix, chunk, stream) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0 && i === lines.length - 1) continue;
    stream.write(`[${prefix}] ${line}\n`);
  }
}

function runSyncOrThrow(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: IS_WIN && cmd.toLowerCase().endsWith(".cmd"),
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(" ")}`);
  }
}

function pnpmCommand() {
  return IS_WIN ? "pnpm.cmd" : "pnpm";
}

function findSystemPython() {
  const candidates = IS_WIN
    ? [
        ["py", ["-3.14"]],
        ["py", ["-3.13"]],
        ["py", ["-3.12"]],
        ["py", ["-3"]],
        ["python", []],
      ]
    : [
        ["python3", []],
        ["python", []],
      ];

  for (const [bin, baseArgs] of candidates) {
    const probe = spawnSync(
      bin,
      [
        ...baseArgs,
        "-c",
        "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}'); sys.exit(0 if sys.version_info >= (3, 12) else 1)",
      ],
      { encoding: "utf8" }
    );
    if (probe.status === 0) {
      return { bin, baseArgs };
    }
  }
  throw new Error(
    "Python 3.12 or newer was not found on PATH. Install Python 3.12+ and re-run setup."
  );
}

function setup() {
  console.log("==> Setting up ROTARA backend (Python) and frontend (Node/pnpm)...");
  if (!fs.existsSync(VENV_PYTHON)) {
    const py = findSystemPython();
    console.log(`Creating virtual environment in ${VENV_DIR}...`);
    runSyncOrThrow(py.bin, [...py.baseArgs, "-m", "venv", ".venv"], BACKEND_DIR);
  } else {
    console.log("Using existing backend/.venv");
  }

  console.log("Installing backend Python dependencies...");
  runSyncOrThrow(
    VENV_PYTHON,
    ["-m", "pip", "install", "-r", "requirements.txt"],
    BACKEND_DIR
  );

  const envExample = path.join(BACKEND_DIR, ".env.example");
  const envFile = path.join(BACKEND_DIR, ".env");
  if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
    fs.copyFileSync(envExample, envFile);
    console.log("Created backend/.env from backend/.env.example");
  }

  console.log("Installing frontend dependencies...");
  runSyncOrThrow(pnpmCommand(), ["install"], FRONTEND_DIR);
  console.log("==> Setup complete.");
}

function ensurePrepared() {
  if (!fs.existsSync(VENV_PYTHON)) {
    throw new Error("Missing backend/.venv. Run `pnpm run setup` (or `.\\rotara.ps1 setup`) first.");
  }
  if (!fs.existsSync(path.join(FRONTEND_DIR, "node_modules"))) {
    throw new Error("Missing frontend/node_modules. Run `pnpm run setup` (or `.\\rotara.ps1 setup`) first.");
  }
}

function build() {
  ensurePrepared();
  console.log("==> Compiling backend Python modules...");
  runSyncOrThrow(VENV_PYTHON, ["-m", "compileall", "-q", "app", "tests"], BACKEND_DIR);

  console.log("==> Building Next.js production frontend...");
  const nextDir = path.join(FRONTEND_DIR, ".next");
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
  runSyncOrThrow(pnpmCommand(), ["build"], FRONTEND_DIR);
  console.log("==> Build complete.");
}

function testAll() {
  ensurePrepared();
  console.log("==> Running backend test suite (pytest)...");
  runSyncOrThrow(VENV_PYTHON, ["-m", "pytest", "-v"], BACKEND_DIR);

  console.log("==> Running frontend lint check...");
  runSyncOrThrow(pnpmCommand(), ["lint"], FRONTEND_DIR);
  console.log("==> All checks passed.");
}

function killTree(child) {
  if (!child || child.pid === undefined || child.killed) return;
  if (IS_WIN) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

function runApp(mode) {
  ensurePrepared();
  if (mode === "start" && !fs.existsSync(path.join(FRONTEND_DIR, ".next", "BUILD_ID"))) {
    console.log("No production build found in frontend/.next; running build first...");
    build();
  }

  const backendArgs = [
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
    ...(mode === "dev" ? ["--reload"] : []),
  ];
  const frontendArgs =
    mode === "dev" ? ["dev"] : ["start", "-p", "3000"];

  console.log(`==> Starting ROTARA (${mode} mode)`);
  console.log("    API: http://127.0.0.1:8000");
  console.log("    App: http://localhost:3000");

  const apiProc = spawn(VENV_PYTHON, backendArgs, {
    cwd: BACKEND_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const webProc = spawn(pnpmCommand(), frontendArgs, {
    cwd: FRONTEND_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    shell: IS_WIN,
  });

  apiProc.stdout.on("data", (d) => prefixWrite("api", d, process.stdout));
  apiProc.stderr.on("data", (d) => prefixWrite("api", d, process.stderr));
  webProc.stdout.on("data", (d) => prefixWrite("web", d, process.stdout));
  webProc.stderr.on("data", (d) => prefixWrite("web", d, process.stderr));

  let shuttingDown = false;
  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    killTree(webProc);
    killTree(apiProc);
    process.exit(exitCode);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  apiProc.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[api] exited with code ${code ?? 1}; stopping frontend...`);
      shutdown(code ?? 1);
    }
  });
  webProc.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[web] exited with code ${code ?? 1}; stopping backend...`);
      shutdown(code ?? 1);
    }
  });
}

const cmd = (process.argv[2] || "start").toLowerCase();
try {
  if (cmd === "setup") {
    setup();
  } else if (cmd === "build") {
    build();
  } else if (cmd === "start" || cmd === "dev") {
    runApp(cmd);
  } else if (cmd === "test") {
    testAll();
  } else {
    console.error("Usage: node scripts/rotara.mjs <setup|build|start|dev|test>");
    process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
