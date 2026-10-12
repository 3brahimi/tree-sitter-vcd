'use strict';

// tree-sitter-vcd (wavedrom, MIT) patched for compact VCD:
// (a) standard gaps: SystemVerilog and VHDL scope and var types, 9-state
//     values, s<string> changes, $attrbegin/$attrend, any timescale number,
//     $comment text up to $end, files without a body;
// (b) compact sections: summary_section, runs_section, run, time_run,
//     value_cycle, value_step, change, derive, order; 'h<hex> vector changes
//     and #=T exact timestamps in the body;
// (c) compact v2: bus_decl, definition ($def, $timebase), copy_item,
//     template_ref, timebase_run (absolute T1=list or start-relative
//     T1@S=list).
// Covers the canonical (tight, packed) form; spaced/lines layouts are
// measurement variants only.

const VALUE_CHARS = /[01xXzZuUwWlLhH-]/;

const rules = {

  source_file: $ => $.value_change_dump_definitions,

  value_change_dump_definitions: $ => seq(
    repeat1($.declaration_command),
    seq('$enddefinitions', '$end'),
    optional($.summary_section),
    repeat(choice($.bus_decl, $.definition)),
    optional($.runs_section),
    repeat($.derive),
    optional($.order),
    repeat($.simulation_command)
  ),

  declaration_command: $ => choice(
    seq('$comment', optional($.text), '$end'),
    seq('$date', optional($.text), '$end'),
    seq('$scope', optional(seq($.scope_type, $.scope_identifier)), '$end'),
    seq('$timescale', optional(seq($.time_number, $.time_unit)), '$end'),
    seq('$upscope', '$end'),
    seq('$var', optional(seq($.var_type, $.size, $.identifier_code, $.reference)), '$end'),
    seq('$version', optional($.text), '$end'),
    $.attribute
  ),

  attribute: $ => choice(
    seq('$attrbegin', optional($.text), '$end'),
    seq('$attrend', optional($.text), '$end')
  ),

  simulation_command: $ => choice(
    seq('$dumpall', repeat($.value_change), '$end'),
    seq('$dumpoff', repeat($.value_change), '$end'),
    seq('$dumpon', repeat($.value_change), '$end'),
    seq('$dumpvars', repeat($.value_change), '$end'),
    seq('$comment', optional($.text), '$end'),
    $.attribute,
    $.simulation_time,
    $.exact_time,
    $.value_change
  ),

  text: $ => /[^$]+/,

  scope_type: $ => choice(
    'begin', 'fork', 'function', 'module', 'task',
    'interface', 'package', 'program', 'class', 'struct', 'union', 'generate',
    'vhdl_architecture', 'vhdl_procedure', 'vhdl_function', 'vhdl_record',
    'vhdl_process', 'vhdl_block', 'vhdl_for_generate', 'vhdl_if_generate',
    'vhdl_generate', 'vhdl_package'
  ),

  time_number: $ => /[0-9]+/,

  time_unit: $ => choice('s', 'ms', 'us', 'ns', 'ps', 'fs'),

  var_type: $ => choice(
    'event', 'integer', 'parameter', 'real', 'realtime', 'reg', 'supply0', 'supply1', 'time',
    'tri', 'triand', 'trior', 'trireg', 'tri0', 'tri1', 'wand', 'wire', 'wor',
    'bit', 'logic', 'int', 'shortint', 'longint', 'byte', 'enum', 'shortreal', 'string',
    'port', 'sparray', 'realtime'
  ),

  simulation_time: $ => seq('#', $.decimal_number),

  exact_time: $ => seq('#=', $.decimal_number),

  value_change: $ => choice(
    $.scalar_value_change,
    $.vector_value_change
  ),

  scalar_value_change: $ => seq($.value, $.identifier_code),

  value: $ => VALUE_CHARS,

  vector_value_change: $ => choice(
    seq(/[bB]/, $.binary_number, $.identifier_code),
    seq(/[rR]/, $.real_number, $.identifier_code),
    seq(/[sS]/, $.string_value, $.identifier_code),
    seq($.hex_number, $.identifier_code)
  ),

  identifier_code: $ => /[!-~]+/,

  size: $ => $.decimal_number,

  reference: $ => seq(
    $.identifier,
    optional(choice(
      seq('[', $._bit_select_index, ']'),
      seq('[', $._msb_index, ':', $._lsb_index, ']')
    ))
  ),

  index: $ => $.decimal_number,

  _bit_select_index: $ => $.index,
  _msb_index: $ => $.index,
  _lsb_index: $ => $.index,

  scope_identifier: $ => /[!-~]+/,

  decimal_number: $ => token(/[0-9]+/),

  binary_number: $ => token.immediate(/[01xXzZuUwWlLhH-]+/),

  hex_number: $ => token(/'h[0-9a-fA-F]+/),

  string_value: $ => token.immediate(/[!-~]+/),

  real_number: $ => token.immediate(/[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?|[-+]?(inf|nan)/),

  identifier: $ => /[!-~]+/,

  // ---- compact VCD ----

  summary_section: $ => seq('$summary', repeat($.summary_line), '$end'),

  summary_line: $ => seq('@', $.signal_ref, repeat($.summary_field)),

  summary_field: $ => /[^\s@$]+/,

  runs_section: $ => seq('$runs', repeat($.runs_flag), repeat($.run), '$end'),

  runs_flag: $ => choice('name', 'id', 'index', 'hex', 'bin', 'abs', 'delta',
    'tight', 'spaced', 'packed', 'lines'),

  run: $ => seq('@', $.signal_ref, repeat1(choice(
    $.change, $.time_run, $.copy_item, $.template_ref, $.timebase_run))),

  signal_ref: $ => token.immediate(/[^\s]+/),

  change: $ => seq(
    field('time', $.decimal_number),
    token.immediate('='),
    field('value', $.run_value)
  ),

  time_run: $ => seq(
    field('start', $.decimal_number),
    token.immediate('+'),
    field('period', $._imm_number),
    repeat(seq(token.immediate(':'), field('offset', $._imm_number))),
    token.immediate('*'),
    field('count', $._imm_number),
    token.immediate('='),
    choice($.value_step, $.value_cycle)
  ),

  value_cycle: $ => seq(
    $.run_value,
    repeat(seq(token.immediate(','), optional($.run_value)))
  ),

  value_step: $ => seq(
    field('base', $.run_value),
    field('op', choice(token.immediate('++'), token.immediate('--'))),
    field('step', $._imm_number)
  ),

  run_value: $ => token.immediate(/[0-9a-zA-Z.]+/),

  _imm_number: $ => alias(token.immediate(/[0-9]+/), $.decimal_number),

  // ---- compact VCD v2 ----

  bus_decl: $ => seq('$bus', field('name', $.signal_name), '=',
    repeat1(field('bit', $.signal_name)), '$end'),

  definition: $ => seq(
    field('kind', choice('$def', '$timebase')),
    field('name', $.def_name),
    '=',
    field('body', $.def_body),
    '$end'
  ),

  def_name: $ => /[A-Z][0-9]+/,

  def_body: $ => /[0-9+][^\s]*/,

  copy_item: $ => seq(
    field('start', $.decimal_number),
    token.immediate('*'),
    field('count', $._imm_number),
    token.immediate('='),
    optional(field('invert', token.immediate('~'))),
    field('source', alias(token.immediate(/[^\s@~][^\s@]*/), $.signal_name)),
    token.immediate('@'),
    field('shift', alias(token.immediate(/-?[0-9]+/), $.shift))
  ),

  template_ref: $ => seq(
    field('template', $.def_name),
    optional(seq(token.immediate('@'), field('start', $._imm_number)))
  ),

  timebase_run: $ => seq(
    field('timebase', $.def_name),
    optional(seq(token.immediate('@'), field('start', $._imm_number))),
    token.immediate('='),
    $.value_cycle
  ),

  derive: $ => seq(
    '$derive',
    field('target', $.signal_name),
    '=',
    optional(field('invert', '~')),
    field('source', $.signal_name),
    optional(seq('delay', field('cycles', $.decimal_number), '@',
      field('clock', $.signal_ref))),
    '$end'
  ),

  signal_name: $ => /[!-}][!-~]*/,

  order: $ => seq('$order', repeat($.signal_name), '$end')
};

module.exports = grammar({
  name: 'vcd',
  rules: rules,
  extras: $ => [/\s/],
  externals: $ => []
});

/* eslint camelcase: 0 */
/* eslint no-undef: 0 */
/* eslint no-unused-vars: 0 */
