import { describe, expect, it } from "vitest";
import { isPhoneRequest } from "../src/lib/workspace-device";

const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const android =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

describe("workspace phone detection", () => {
  it.each([
    ["iPhone Safari", iphone],
    ["Android Chrome", android],
    [
      "Android Firefox",
      "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
    ],
    [
      "iPhone in-app browser",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS]",
    ],
  ])("recognizes %s without client hints", (_name, userAgent) => {
    expect(isPhoneRequest(new Headers({ "user-agent": userAgent }))).toBe(true);
  });

  it("recognizes a mobile client hint even with a reduced user agent", () => {
    expect(
      isPhoneRequest(
        new Headers({
          "user-agent": "Mozilla/5.0",
          "sec-ch-ua-mobile": "?1",
        }),
      ),
    ).toBe(true);
  });

  it.each([iphone, android])(
    "does not let a negative client hint override a phone user agent",
    (userAgent) => {
      expect(
        isPhoneRequest(
          new Headers({
            "user-agent": userAgent,
            "sec-ch-ua-mobile": "?0",
          }),
        ),
      ).toBe(true);
    },
  );

  it.each([
    [
      "Windows desktop",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ],
    [
      "Mac Safari",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    ],
    [
      "Linux desktop",
      "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    ],
    [
      "iPad",
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ],
    [
      "Android tablet",
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ],
    ["unknown browser", "Mozilla/5.0"],
  ])("does not mistake %s for a phone", (_name, userAgent) => {
    expect(isPhoneRequest(new Headers({ "user-agent": userAgent }))).toBe(
      false,
    );
  });

  it("allows requests without device information", () => {
    expect(isPhoneRequest(new Headers())).toBe(false);
  });
});
