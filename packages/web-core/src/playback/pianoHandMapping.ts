import type { PianoHandMappingResult, PlaybackTrack } from "./types";

export function resolvePianoHandMapping(tracks: PlaybackTrack[]): PianoHandMappingResult {
  const candidates = tracks.filter(
    (track) => track.staves?.length === 2 && track.staves.every((staff) => !staff.isPercussion),
  );
  if (candidates.length === 1) {
    const track = candidates[0]!;
    const [right, left] = [...track.staves!].sort((a, b) => a.sourceIndex - b.sourceIndex);
    return {
      availability: "available",
      mapping: {
        trackId: track.id,
        rightStaffId: right!.id,
        leftStaffId: left!.id,
      },
    };
  }

  const pitchedStaves = tracks.flatMap((track) => track.staves?.filter((staff) => !staff.isPercussion) ?? []);
  if (candidates.length > 1 || (tracks.length > 1 && pitchedStaves.length === 2)) {
    return {
      availability: "ambiguous",
      code: "piano-hand-practice-ambiguous",
    };
  }
  return {
    availability: "not-applicable",
    code: "piano-hand-practice-not-applicable",
  };
}
