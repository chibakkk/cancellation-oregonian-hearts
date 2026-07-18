import net from "net";
import tls from "tls";

export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  resetAt: number;
};

export interface RateLimitStore {
  readonly description: string;
  healthCheck(): Promise<void>;
  consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  clear(key: string): Promise<void>;
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export function createRateLimitStore(): RateLimitStore {
  if (process.env.REDIS_URL) {
    return new RedisRateLimitStore(process.env.REDIS_URL);
  }
  return new MemoryRateLimitStore();
}

class MemoryRateLimitStore implements RateLimitStore {
  readonly description = "memory:rate-limit";
  private readonly buckets = new Map<string, RateLimitBucket>();

  async healthCheck(): Promise<void> {
    return;
  }

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + rule.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, count: 1, resetAt };
    }

    bucket.count += 1;
    return {
      allowed: bucket.count <= rule.limit,
      count: bucket.count,
      resetAt: bucket.resetAt,
    };
  }

  async clear(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

class RedisRateLimitStore implements RateLimitStore {
  readonly description: string;
  private readonly keyPrefix: string;

  constructor(private readonly redisUrl: string) {
    this.keyPrefix = process.env.COH_REDIS_KEY_PREFIX ?? "coh";
    this.description = `redis-rate-limit:${this.keyPrefix}:rate:*`;
  }

  async healthCheck(): Promise<void> {
    const result = await this.command(["PING"]);
    if (result !== "PONG") {
      throw new Error("Unexpected Redis PING response");
    }
  }

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const redisKey = this.rateLimitKey(key);
    const result = await this.command([
      "EVAL",
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('PTTL', KEYS[1]); return { count, ttl }",
      "1",
      redisKey,
      String(rule.windowMs),
    ]);

    if (!Array.isArray(result) || typeof result[0] !== "number" || typeof result[1] !== "number") {
      throw new Error("Unexpected Redis rate limit response");
    }

    const [count, ttl] = result;
    return {
      allowed: count <= rule.limit,
      count,
      resetAt: Date.now() + Math.max(ttl, 0),
    };
  }

  async clear(key: string): Promise<void> {
    await this.command(["DEL", this.rateLimitKey(key)]);
  }

  private rateLimitKey(key: string): string {
    return `${this.keyPrefix}:rate:${key}`;
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
