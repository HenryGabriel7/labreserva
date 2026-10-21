import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
describe("tokens e componentes", () => {
  it("combina variantes sem classes conflitantes", () => {
    expect(cn("p-2", false, "p-4")).toBe("p-4");
  });
});
