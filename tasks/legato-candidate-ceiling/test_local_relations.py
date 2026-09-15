import unittest
from copy import deepcopy

from local_relations import dot_relations, dotted_duration, select_duration


class DotRelationsTest(unittest.TestCase):
    def setUp(self):
        self.head = dict(x=10, y=20, gap=5, valid=True, glyph="0xe0a3", pitch=30)
        self.glyphs = [("MScore", "\ue0a3", 10, 20), ("MScore", "\ue1e7", 18, 20)]
        self.stems = [dict(x=10, y=20, stemIndex=0, direction="up")]

    def relation(self, heads=None, glyphs=None, stems=None):
        return dot_relations(self.glyphs if glyphs is None else glyphs,
                             [self.head] if heads is None else heads,
                             self.stems if stems is None else stems)[0]

    def test_unique_dot_and_stem(self):
        result = self.relation()
        self.assertEqual(result["status"], "supported")
        self.assertEqual(result["head"], self.head)
        self.assertNotIn("duration", result)

    def test_distant_unknown_does_not_block(self):
        self.assertEqual(self.relation(glyphs=self.glyphs + [("Unknown", "?", 90, 20)])["status"], "supported")

    def test_local_unknown_blocks(self):
        self.assertEqual(self.relation(glyphs=self.glyphs + [("Unknown", "?", 17, 21)])["reason"], "local-glyph")

    def test_equally_close_heads_abstain(self):
        heads = [dict(self.head, y=17.5), dict(self.head, y=22.5)]
        self.assertEqual(self.relation(heads=heads)["reason"], "dot-owner")

    def test_invalid_competing_head_is_not_discarded(self):
        self.assertEqual(self.relation(heads=[self.head, dict(self.head, y=22, valid=False)])["reason"], "dot-owner")

    def test_line_displaced_dot_is_admitted(self):
        glyphs = [self.glyphs[0], ("MScore", "\ue1e7", 18, 17.5)]
        self.assertEqual(self.relation(glyphs=glyphs)["status"], "supported")

    def test_duplicate_dots_are_not_single_dots(self):
        self.assertEqual(self.relation(glyphs=self.glyphs + [("MScore", "\ue1e7", 21, 20)])["reason"], "multiple-dots")

    def test_ambiguous_stem_abstains(self):
        self.assertEqual(self.relation(stems=self.stems * 2)["reason"], "stem")

    def test_missing_head_inventory_abstains(self):
        self.assertEqual(self.relation(glyphs=self.glyphs[1:])["reason"], "head-inventory")

    def test_timing_requires_complete_paths_and_no_tuplet(self):
        relation = self.relation()
        self.assertEqual(dotted_duration(relation, None, True, False), (3, 4))
        self.assertIsNone(dotted_duration(relation, None, False, False))
        self.assertIsNone(dotted_duration(relation, None, True, True))

    def test_black_without_positive_beam_is_unknown(self):
        relation = self.relation()
        relation["head"] = dict(self.head, glyph="0xe0a4")
        self.assertIsNone(dotted_duration(relation, None, True, False))
        self.assertEqual(dotted_duration(relation, [12], True, False), (3, 16))

    def test_hollow_with_beam_is_not_standard_half_note(self):
        self.assertIsNone(dotted_duration(self.relation(), [12], True, False))


class CandidateSelectionTest(unittest.TestCase):
    def setUp(self):
        self.event = dict(id="a", type="note", onset=dict(numerator=0, denominator=1),
                          duration=dict(numerator=1, denominator=2),
                          writtenPitch=dict(step="C", octave=4, alter=0))
        self.measure = dict(duration=dict(numerator=1, denominator=1), voices=[dict(index=1, events=[self.event])])
        self.alternative = deepcopy(self.measure)
        self.alternative["voices"][0]["events"][0]["duration"] = dict(numerator=3, denominator=4)
        self.evidence = dict(status="supported", duration=(3, 4), head=dict(pitch=28))
        self.heads = [dict(pitch=28)]

    def select(self, alternatives=None):
        return select_duration(self.measure, [self.alternative] if alternatives is None else alternatives,
                               self.evidence, self.heads)

    def test_selects_existing_source_supported_duration_without_mutation(self):
        before = deepcopy((self.measure, self.alternative))
        self.assertEqual(self.select()["duration"], dict(numerator=3, denominator=4))
        self.assertEqual(before, (self.measure, self.alternative))

    def test_no_alternative_does_not_invent_a_duration(self):
        self.assertEqual(self.select([])["reason"], "no-existing-candidate")

    def test_repeated_source_pitch_abstains(self):
        self.heads *= 2
        self.assertEqual(self.select()["reason"], "source-correspondence")

    def test_repeated_candidate_pitch_abstains(self):
        self.measure["voices"][0]["events"].append(deepcopy(self.event))
        self.assertEqual(self.select()["reason"], "candidate-correspondence")

    def test_tie_and_tuplet_are_protected(self):
        for key, value in [("tie", "start"), ("tuplet", dict(actualNotes=3, normalNotes=2))]:
            self.event[key] = value
            self.assertEqual(self.select()["reason"], "protected-event")
            self.event.pop(key)

    def test_alternative_onset_must_agree(self):
        self.alternative["voices"][0]["events"][0]["onset"]["numerator"] = 1
        self.assertEqual(self.select()["reason"], "no-existing-candidate")

    def test_duration_extension_cannot_overlap_next_event(self):
        following = deepcopy(self.event)
        following.update(id="b", onset=dict(numerator=1, denominator=2), writtenPitch=dict(step="D", octave=4))
        self.measure["voices"][0]["events"].append(following)
        self.assertEqual(self.select()["reason"], "timing-conflict")

    def test_already_correct_is_not_a_gain(self):
        self.event["duration"] = dict(numerator=3, denominator=4)
        self.assertEqual(self.select()["reason"], "already-supported")


if __name__ == "__main__":
    unittest.main()
