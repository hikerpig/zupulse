import type { OmrScoreDraft } from "../../schemas";

export function musicXmlReadyDraft(): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    parts: [
      {
        id: "P1",
        name: "Piano & Keys",
        staves: [
          {
            index: 0,
            measures: [
              {
                index: 0,
                timeSignature: { numerator: 4, denominator: 4 },
                duration: { numerator: 1, denominator: 1 },
                keySignature: { fifths: 0 },
                clef: { sign: "G", line: 2 },
                repeat: { forward: true, backward: true },
                voices: [
                  {
                    index: 1,
                    events: [
                      {
                        type: "note",
                        id: "n1",
                        onset: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 4 },
                        writtenPitch: { step: "C", alter: 0, octave: 4 },
                        soundingMidi: 60,
                        tie: "start",
                        tuplet: { actualNotes: 3, normalNotes: 2 },
                      },
                      {
                        type: "rest",
                        id: "r1",
                        onset: { numerator: 1, denominator: 4 },
                        duration: { numerator: 3, denominator: 4 },
                      },
                    ],
                  },
                ],
              },
              {
                index: 1,
                timeSignature: { numerator: 4, denominator: 4 },
                duration: { numerator: 1, denominator: 1 },
                keySignature: { fifths: 0 },
                clef: { sign: "G", line: 2 },
                voices: [
                  {
                    index: 1,
                    events: [
                      {
                        type: "note",
                        id: "n2",
                        onset: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 4 },
                        writtenPitch: { step: "C", alter: 0, octave: 4 },
                        soundingMidi: 60,
                        tie: "end",
                      },
                      {
                        type: "rest",
                        id: "r2",
                        onset: { numerator: 1, denominator: 4 },
                        duration: { numerator: 3, denominator: 4 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    diagnostics: [],
  };
}
