import { describe, expect, it } from "vitest";
import { newUnit, type Project } from "../src/domain/schema";
import { editSoundCue } from "../src/lib/audio/edit-sound";
import {
  DEFAULT_SOUND_PREFERENCES,
  parseSoundPreferences,
} from "../src/lib/audio/sound-preferences";

const project: Project = {
  version: 1,
  name: "Sound test",
  units: [newUnit("Feed", "F-1", 0, 0), newUnit("Product", "P-1", 300, 0)],
  edges: [
    {
      id: "stream",
      source: "F-1",
      target: "P-1",
      sourcePort: "out",
      targetPort: "in",
      color: "teal",
    },
  ],
};

describe("accepted canvas edit feedback", () => {
  it("keeps equipment and stream deletion silent", () => {
    expect(
      editSoundCue(project, { ...project, units: [], edges: [] }),
    ).toBeNull();
    expect(editSoundCue(project, { ...project, edges: [] })).toBeNull();
  });
  it("treats pasting connected equipment as one placement", () => {
    expect(editSoundCue({ ...project, units: [], edges: [] }, project)).toBe(
      "place",
    );
    expect(editSoundCue({ ...project, edges: [] }, project)).toBe("connect");
  });
  it("keeps movement, selection, names, and parameters silent", () => {
    expect(editSoundCue(project, structuredClone(project))).toBeNull();
    const next = structuredClone(project);
    next.units[0].name = "Renamed feed";
    next.units[0].params.flow = 10;
    expect(editSoundCue(project, next)).toBeNull();
    next.units[0].position.x += 10;
    next.units[1].position.x += 10;
    expect(editSoundCue(project, next)).toBeNull();
  });
});

describe("sound preferences", () => {
  it.each([
    null,
    "invalid",
    "null",
    "[]",
    '{"version":2,"enabled":true}',
    '{"enabled":true}',
  ])("starts with sound on for missing or unsupported data: %s", (raw) => {
    expect(parseSoundPreferences(raw)).toEqual(DEFAULT_SOUND_PREFERENCES);
    expect(parseSoundPreferences(raw).enabled).toBe(true);
    expect(parseSoundPreferences(raw).volume).toBe(100);
  });
  it("preserves a saved mute and volume instead of overriding the user's choice", () => {
    expect(
      parseSoundPreferences('{"version":1,"enabled":false,"volume":18}'),
    ).toEqual({ version: 1, enabled: false, volume: 18 });
  });
  it("uses the enabled default for missing or malformed toggles and clamps volume", () => {
    expect(
      parseSoundPreferences('{"version":1,"enabled":true,"volume":18}'),
    ).toEqual({ version: 1, enabled: true, volume: 18 });
    expect(
      parseSoundPreferences('{"version":1,"enabled":"true","volume":900}'),
    ).toEqual({ version: 1, enabled: true, volume: 100 });
    expect(parseSoundPreferences('{"version":1,"volume":18}').enabled).toBe(
      true,
    );
    expect(parseSoundPreferences('{"version":1,"volume":-20}').volume).toBe(0);
    expect(parseSoundPreferences('{"version":1,"volume":"loud"}').volume).toBe(
      100,
    );
  });
});
