import { describe, expect, it } from "vitest";
import { parseLegatoProgressLine } from "../engines/legato-progress";

describe("parseLegatoProgressLine", () => {
  it("parses a well-formed progress line", () => {
    expect(parseLegatoProgressLine('{"type":"progress","completed":2,"total":5}')).toEqual({
      completed: 2,
      total: 5,
    });
  });

  it.each([
    "not json",
    "{}",
    '{"type":"result","ok":true}',
    '{"type":"progress","completed":-1,"total":5}',
    '{"type":"progress","completed":6,"total":5}',
    '{"type":"progress","completed":1.5,"total":5}',
    '{"type":"progress","completed":1,"total":0}',
  ])("rejects %s", (line) => {
    expect(parseLegatoProgressLine(line)).toBeUndefined();
  });
});
