import fs from "fs/promises";
import net from "net";
import path from "path";
import tls from "tls";
import type { RoomGameSnapshot } from "../game/RoomGame";

export interface PersistedServerState {
  version: 1;
  rooms: Record<string, RoomGameSnapshot>;
  sessionTokens: Record<string, Record<string, string>>;
  updatedAt: string;
}

export interface ServerStateStore {
  readonly description: string;
  load(): Promise<PersistedServerState | null>;
  save(state: PersistedServerState): Promise<void>;
}

export function createServerStateStore(): ServerStateStore {
  if (process.env.REDIS_URL) {
    return new RedisServerStateStore(process.env.REDIS_URL);
  }
  if (process.env.COH_STATE_BACKEND === "memory") {
    return new MemoryServerStateStore();
  }
  return new JsonFileServerStateStore(
    process.env.COH_STATE_FILE ?? path.join(process.cwd(), ".data", "server-state.json")
  );
}

export function emptyPersistedState(): PersistedServerState {
  return {
    version: 1,
    rooms: {},
    sessionTokens: {},
    updatedAt: new Date().toISOString(),
  };
}

class MemoryServerStateStore implements ServerStateStore {
  readonly description = "memory";
  private state: PersistedServerState | null = null;

  async load(): Promise<PersistedServerState | null> {
    return this.state ? cloneJson(this.state) : null;
  }

  async save(state: PersistedServerState): Promise<void> {
    this.state = cloneJson(state);
  }
}

class JsonFileServerStateStore implements ServerStateStore {
  readonly description: string;

  constructor(private readonly filePath: string) {
    this.description = `json:${filePath}`;
  }

  async load(): Promise<PersistedServerState | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return normalizePersistedState(JSON.parse(raw));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async save(state: PersistedServerState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(state)}\n`, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }
}

class RedisServerStateStore implements ServerStateStore {
  readonly description: string;
  private readonly key: string;

  constructor(private readonly redisUrl: string) {
    this.key = process.env.COH_REDIS_STATE_KEY ?? "coh:server-state";
    this.description = `redis:${this.key}`;
  }

  async load(): Promise<PersistedServerState | null> {
    const raw = await this.command(["GET", this.key]);
    if (raw == null) {
      return null;
    }
    if (typeof raw !== "string") {
      throw new Error("Redis state value is not a string");
    }
    return normalizePersistedState(JSON.parse(raw));
  }

  async save(state: PersistedServerState): Promise<void> {
    await this.command(["SET", this.key, JSON.stringify(state)]);
  }

  private async command(args: string[]): Promise<RedisValue> {
    const parsed = new URL(this.redisUrl);
    const port = parsed.port ? Number(parsed.port) : 6379;
    const host = parsed.hostname || "127.0.0.1";
    const useTls = parsed.protocol === "rediss:";
    const dbIndex = parsed.pathname.length > 1 ? parsed.pathname.slice(1) : "";
    const commands: string[][] = [];

    if (parsed.password) {
      commands.push(
        parsed.username
          ? ["AUTH", decodeURIComponent(parsed.username), decodeURIComponent(parsed.password)]
          : ["AUTH", decodeURIComponent(parsed.password)]
      );
    }
    if (dbIndex) {
      commands.push(["SELECT", dbIndex]);
    }
    commands.push(args);

    return new Promise<RedisValue>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = useTls
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });

      socket.once("connect", () => {
        socket.end(commands.map(encodeRedisCommand).join(""));
      });
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.once("error", reject);
      socket.once("end", () => {
        try {
          const parser = new RedisResponseParser(Buffer.concat(chunks));
          let result: RedisValue = null;
          for (let i = 0; i < commands.length; i += 1) {
            result = parser.parse();
          }
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

type RedisValue = string | number | null | RedisValue[];

class RedisResponseParser {
  private offset = 0;
  private readonly delimiter = Buffer.from("\r\n");

  constructor(private readonly input: Buffer) {}

  parse(): RedisValue {
    const type = String.fromCharCode(this.input[this.offset]);
    this.offset += 1;
    if (type === "+") {
      return this.readLine();
    }
    if (type === "-") {
      throw new Error(this.readLine());
    }
    if (type === ":") {
      return Number(this.readLine());
    }
    if (type === "$") {
      const length = Number(this.readLine());
      if (length === -1) {
        return null;
      }
      const value = this.input.toString("utf8", this.offset, this.offset + length);
      this.offset += length + 2;
      return value;
    }
    if (type === "*") {
      const length = Number(this.readLine());
      if (length === -1) {
        return null;
      }
      const values: RedisValue[] = [];
      for (let i = 0; i < length; i += 1) {
        values.push(this.parse());
      }
      return values;
    }
    throw new Error(`Unsupported Redis response type: ${type}`);
  }

  private readLine(): string {
    const end = this.input.indexOf(this.delimiter, this.offset);
    if (end < 0) {
      throw new Error("Invalid Redis response");
    }
    const line = this.input.toString("utf8", this.offset, end);
    this.offset = end + 2;
    return line;
  }
}

function encodeRedisCommand(args: string[]): string {
  return `*${args.length}\r\n${args
    .map((arg) => {
      const value = Buffer.from(arg);
      return `$${value.length}\r\n${arg}\r\n`;
    })
    .join("")}`;
}

function normalizePersistedState(value: unknown): PersistedServerState {
  if (!value || typeof value !== "object") {
    return emptyPersistedState();
  }
  const state = value as Partial<PersistedServerState>;
  return {
    version: 1,
    rooms: state.rooms ?? {},
    sessionTokens: state.sessionTokens ?? {},
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
