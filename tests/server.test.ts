import { test, expect } from "vitest";

test("server responds", async () => {
  const res = await fetch("http://localhost:3000");
  const text = await res.text();
  expect(text).toBe("hello from server");
});
