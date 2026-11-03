// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

export const CHAT_SEND = 0.53;
export const CHAT_PROPOSAL = 0.7;
export const CHAT_REVEALED = 0.875;
export const CHAT_APPLY = 0.95;

/** Deterministic easing lets capture, replay and reverse scrubbing agree. */
export function chatEase(time: number, start: number, end: number) {
  const value = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return value * value * (3 - 2 * value);
}

export function chatTimeline(time: number) {
  const response = "I’ll build the process and connect the recycle loop.";
  return {
    sent: time >= CHAT_SEND,
    proposed: time >= CHAT_PROPOSAL,
    applied: time >= CHAT_APPLY,
    response: response.slice(
      0,
      Math.floor(chatEase(time, 0.56, 0.69) * response.length),
    ),
    reveal: chatEase(time, CHAT_PROPOSAL, CHAT_REVEALED),
    workingOpacity: 1 - chatEase(time, 0.67, CHAT_PROPOSAL),
    actionOpacity: 1 - chatEase(time, 0.935, CHAT_APPLY),
    appliedOpacity: chatEase(time, CHAT_APPLY, 0.985),
    cursorTravel: chatEase(time, CHAT_REVEALED, 0.925),
    cursorOpacity:
      chatEase(time, CHAT_REVEALED, 0.895) *
      (1 - chatEase(time, CHAT_APPLY, 0.975)),
  };
}
