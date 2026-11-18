import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { createRequire } from "node:module";
import { app } from "electron";
import { EventEmitter } from "node:events";

export function codexExecutable(): string {
  const override = process.env.DAO_CODEX_PATH;
  if (override) {
    if (!isAbsolute(override) || !existsSync(override))
      throw new Error("DAO_CODEX_PATH must point to an installed standalone Codex executable.");
    return override;
  }
  const cpu = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : undefined;
  const target = { win32: "pc-windows-msvc", darwin: "apple-darwin", linux: "unknown-linux-musl" }[process.platform as string];
  if (!cpu || !target) throw new Error(`Unsupported Codex platform: ${process.platform}/${process.arch}`);
  const resolve = createRequire(join(app.getAppPath(), "package.json"));
  const packageRoot = dirname(resolve.resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`));
  const executable = join(packageRoot, "vendor", `${cpu}-${target}`, "bin", process.platform === "win32" ? "codex.exe" : "codex");
  if (!existsSync(executable)) throw new Error("Standalone Codex runtime is missing. Reinstall CODET-ADE dependencies including optional packages.");
  return executable;
}
/** JSONL transport only. Lifecycle and UI ownership live above this adapter. */
export class CodexClient extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private sequence = 0;
  private connecting?: Promise<void>;
  private ready = false;
  constructor(
    private executable?: string,
    private args = ["app-server"],
  ) {
    super();
  }
  async connect(): Promise<void> {
    if (this.ready) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.start().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
  private async start() {
    // A packaged desktop Core context cannot be transferred to an unpackaged
    // app. Fail closed; never disable its identity checks or change sandbox mode.
    if (process.platform === "win32" && process.env.CODEX_WINDOWS_REGISTERED_CORE === "1") {
      throw new Error("CODET-ADE inherited Codex Desktop's packaged runtime context. Close CODET-ADE and launch it from Windows Explorer or its shortcut to use the standalone runtime. Permission settings have not been changed.");
    }
    const executable = this.executable ?? codexExecutable();
    const child = spawn(executable, this.args, {
      stdio: "pipe",
      windowsHide: true,
      env: process.env,
    });
    this.child = child;
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-2000);
    });
    const fail = (error: Error) => {
      if (this.child !== child) return;
      this.ready = false;
      this.child = undefined;
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(error);
      }
      this.pending.clear();
      this.emit("disconnect", error.message);
    };
    child.on("error", (error) => fail(error));
    child.on("exit", (code) =>
      fail(
        new Error(`Codex disconnected (${code ?? "signal"}). ${stderr.trim()}`),
      ),
    );
    child.stdin.on("error", (error) => fail(error));
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.method) {
        this.emit(
          message.id !== undefined ? "request" : "notification",
          message,
        );
        return;
      }
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(message.id);
      if (message.error)
        request.reject(
          new Error(message.error.message ?? "Codex request failed"),
        );
      else request.resolve(message.result);
    });
    try {
      await this.request("initialize", {
        clientInfo: { name: "dao_ade", title: "CODET-ADE", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      this.write({ method: "initialized" });
      this.ready = true;
    } catch (error) {
      child.kill();
      throw error;
    }
  }
  request(method: string, params: unknown = {}): Promise<any> {
    if (!this.child) return Promise.reject(new Error("Codex is not connected"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `Codex ${method} timed out; reconnect before retrying an uncertain operation.`,
          ),
        );
      }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  respond(id: string | number, result: unknown) {
    this.write({ id, result });
  }
  reject(id: string | number, message: string) {
    this.write({ id, error: { code: -32601, message } });
  }
  private write(message: unknown) {
    if (!this.child?.stdin.writable)
      throw new Error("Codex transport is unavailable");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  dispose() {
    this.child?.kill();
  }
}
