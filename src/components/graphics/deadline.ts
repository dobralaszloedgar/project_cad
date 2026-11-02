// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** Driver promises can stall without rejecting; always bound the wait. */
export function withGraphicsDeadline<T>(
  work: Promise<T>,
  milliseconds: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      complete();
    };
    const abort = () =>
      finish(() =>
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError")),
      );
    const timer = setTimeout(
      () => finish(() => reject(new Error(message))),
      milliseconds,
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    // Retain rejection handling even after a timeout or unmount.
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}
