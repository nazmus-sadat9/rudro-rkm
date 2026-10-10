import mongoose from "mongoose";

const uri = process.env.MONGODB_URI as string;
const g = globalThis as unknown as {
  _mongoose?: { conn: typeof mongoose | null; p: Promise<typeof mongoose> | null };
};
const cache = (g._mongoose ??= { conn: null, p: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  cache.p ??= mongoose.connect(uri);
  cache.conn = await cache.p;
  return cache.conn;
}
