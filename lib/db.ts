import mongoose from "mongoose";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mintMongooseCache: MongooseCache | undefined;
}

function getCache(): MongooseCache {
  if (globalThis._mintMongooseCache === undefined) {
    globalThis._mintMongooseCache = { conn: null, promise: null };
  }
  return globalThis._mintMongooseCache;
}

/**
 * Connect to MongoDB once and reuse the connection across
 * hot-reloads (dev) and warm serverless invocations (prod).
 * Same Atlas cluster as the Oblyx allowlist; separate collection.
 */
export async function connectDB(): Promise<typeof mongoose> {
  const cache: MongooseCache = getCache();
  if (cache.conn !== null) return cache.conn;

  const uri: string | undefined = process.env.MONGODB_URI;
  if (uri === undefined || uri === "") {
    throw new Error("MONGODB_URI is not set — add it to .env.local / hosting env vars.");
  }

  if (cache.promise === null) {
    cache.promise = mongoose
      .connect(uri, { dbName: "oblyx" })
      .catch((err: unknown) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
