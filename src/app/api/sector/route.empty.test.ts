import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";

vi.mock("../../../../data/sector-lists.json", () => ({ default: { fetchedAt: null, lists: [] } }));

import { GET } from "./route";

it("says the lists are not available yet when the weekly job has not filled the file", async () => {
  const res = await GET(new NextRequest("http://site.test/api/sector?q=banks", { headers: { "x-forwarded-for": "10.2.0.1" } }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "unavailable", fetchedAt: null, sectors: [] });
});
