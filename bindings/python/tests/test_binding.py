from unittest import TestCase

from tree_sitter import Language, Parser
import tree_sitter_vcd

SAMPLE = b"""$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$upscope $end
$enddefinitions $end
#0
0!
#5
1!
"""


class TestLanguage(TestCase):
    def test_can_load_grammar(self):
        try:
            Parser(Language(tree_sitter_vcd.language()))
        except Exception:
            self.fail("Error loading VCD grammar")

    def test_parses_sample(self):
        parser = Parser(Language(tree_sitter_vcd.language()))
        self.assertFalse(parser.parse(SAMPLE).root_node.has_error)
