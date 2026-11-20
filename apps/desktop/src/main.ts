/**
 * Electron main process = sim host.
 * Cold launch: start local Postgres → migrate → boot session → open renderer.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { ClientToHost, HostToClient } from "@boing-pets/contract";
import {
  createFileHostMetaStore,
  createHostRuntime,
  createMintEdgeFromEnv,
  createRepositoryNftLinkStore,
  PrismaWorldRepository,
  type HostRuntime,
} from "@boing-pets/sim-host";
import { IPC_FROM_HOST, IPC_QUERY, IPC_TO_HOST } from "./ipc-channels";
import { migrateDeploy } from "./migrate";
import { resolveDesktopPaths } from "./paths";
import { startLocalPostgres, type LocalPostgres } from "./postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CLIENT_DIST_INDEX = path.resolve(
  REPO_ROOT,
  "apps/client/dist/index.html",
);

const PG_PASSWORD = "living-pets-local";
const PG_PORT = Number(process.env.LIVING_PETS_PG_PORT ?? "55432");
const WORLD_SEED = Number(process.env.LIVING_PETS_SEED ?? "1");

let mainWindow: BrowserWindow | null = null;
let postgres: LocalPostgres | null = null;
let repository: PrismaWorldRepository | null = null;
let runtime: HostRuntime | null = null;

function emitToRenderer(message: HostToClient): void {
  if (mainWindow != null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_FROM_HOST, message);
  }
}

async function bootHost(): Promise<void> {
  const paths = resolveDesktopPaths({
    userDataRoot: path.join(app.getPath("userData"), "living-pets"),
    repoRoot: REPO_ROOT,
    clientDistIndex: CLIENT_DIST_INDEX,
  });

  postgres = await startLocalPostgres({
    databaseDir: paths.postgresDir,
    port: PG_PORT,
    password: PG_PASSWORD,
  });

  process.env.DATABASE_URL = postgres.databaseUrl;
  migrateDeploy({
    repoRoot: paths.repoRoot,
    schemaPath: paths.schemaPath,
    databaseUrl: postgres.databaseUrl,
  });

  repository = new PrismaWorldRepository({
    hostMeta: createFileHostMetaStore(paths.hostMetaPath),
  });

  // Mint edge defaults off (LIVING_PETS_BOING_MINTING unset).
  // When enabled, founders and live births queue NFT mints after history commit.
  runtime = createHostRuntime({
    repository,
    seed: WORLD_SEED,
    emit: emitToRenderer,
    mintEdge: createMintEdgeFromEnv(
      process.env,
      createRepositoryNftLinkStore(repository),
    ),
  });

  ipcMain.on(IPC_TO_HOST, (_event, message: ClientToHost) => {
    void runtime?.handleCommand(message).catch((error) => {
      console.error("host command failed", error);
    });
  });

  ipcMain.handle(
    IPC_QUERY,
    async (_event: IpcMainInvokeEvent, message: ClientToHost) => {
      if (runtime == null) throw new Error("host not ready");
      return runtime.handleQuery(message);
    },
  );

  await runtime.start();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.LIVING_PETS_DEV_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(CLIENT_DIST_INDEX);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function shutdown(): Promise<void> {
  try {
    await runtime?.quit();
  } catch (error) {
    console.error("quit failed", error);
  }
  try {
    await repository?.dispose();
  } catch (error) {
    console.error("repository dispose failed", error);
  }
  try {
    await postgres?.stop();
  } catch (error) {
    console.error("postgres stop failed", error);
  }
}

app.whenReady().then(async () => {
  await bootHost();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (runtime == null && postgres == null) return;
  event.preventDefault();
  void shutdown().finally(() => {
    runtime = null;
    repository = null;
    postgres = null;
    app.exit(0);
  });
});
