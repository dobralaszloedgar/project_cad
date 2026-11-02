// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** Device headers stay the same when a desktop window is resized or zoomed. */
export function isPhoneRequest(headers: Pick<Headers, "get">): boolean {
  const userAgent = headers.get("user-agent") ?? "";

  // Use positive phone signals. Touch support and Android alone also describe
  // laptops/tablets, and a false/missing client hint must not hide an iPhone UA.
  return (
    headers.get("sec-ch-ua-mobile") === "?1" ||
    /iPhone|iPod|Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|KaiOS/i.test(
      userAgent,
    ) ||
    (/Android/i.test(userAgent) && /Mobile/i.test(userAgent))
  );
}
