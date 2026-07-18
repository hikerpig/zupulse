import { describe, expect, it } from "vitest";

import { createCssGeneratorOptions } from "../rspack.mjs";

describe("createCssGeneratorOptions", () => {
  it("uses a short readable CSS Module class name in development", () => {
    expect(createCssGeneratorOptions("development")).toEqual({
      localIdentName: "[name]__[local]--[hash:base64:5]",
    });
  });

  it("keeps production CSS Module class names compact", () => {
    expect(createCssGeneratorOptions("production")).toEqual({});
  });
});
