# Vex.Flow.VexTab
# Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
#
# This class implements the semantic analysis of the Jison
# output, and generates elements that can be used by
# Vex.Flow.Artist to render the notation.
# parsed by Vex.Flow.VexTab.

class Vex.Flow.VexTab
  @DEBUG = false
  L = (args...) -> console?.log("(Vex.Flow.VexTab)", args...) if Vex.Flow.VexTab.DEBUG

  # Private methods
  newError = (object, msg) ->
    new Vex.RERR("ParseError",
                 "#{msg} in line #{object._l} column #{object._c}")

  # Public methods
  constructor: (@artist) ->
    @reset()

  reset: ->
    @valid = false
    @elements = false
    @current_duration = "q"

  parseStaveOptions: (options) ->
    params =
      notation: "false"
      tablature: "true"

    return params unless options?

    notation_option = null
    for option in options
      error = (msg) -> newError(option, msg)
      params[option.key] = option.value
      switch option.key
        when "notation", "tablature"
          notation_option = option
          throw error("'#{option.key}' must be 'true' or 'false'") if option.value not in ["true", "false"]
        when "key"
          throw error("Invalid key signature '#{option.value}'") unless _.has(Vex.Flow.keySignature.keySpecs, option.value)
        when "clef"
          clefs = ["treble", "bass", "tenor", "alto"]
          throw error("'clef' must be one of #{clefs.join(', ')}") if option.value not in clefs
        when "time"
          try
            new Vex.Flow.TimeSignature(option.value)
          catch e
            throw error("Invalid time signature: '#{option.value}'")
        when "tuning"
          try
            new Vex.Flow.Tuning(option.value)
          catch e
            throw error("Invalid tuning: '#{option.value}'")
        else
          throw error("Invalid option '#{option.key}'")

    if params.notation == "false" and params.tablature == "false"
       throw newError(notation_option, "Both 'notation' and 'tablature' can't be invisible")

    return params

  parseCommand: (note) ->
    # Parse commands: open_beam, close_beam, bar

  parseChord: (element) ->
    @artist.addChord(
      _.map(element.chord,
            (note)-> _.pick(note, 'time', 'dot', 'fret', 'string', 'articulation', 'decorator')),
      element.decorator)

  parseFret: (note) ->
    @artist.addNote(_.pick(
      note, 'time', 'dot', 'fret', 'string', 'articulation', 'decorator'))

  parseStaveElements: (notes) ->
    for element in notes
      if element.time
        @artist.setDuration(element.time, element.dot)

      if element.command
        @parseCommand(element)

      if element.chord
        @parseChord(element)

      if element.fret
        @parseFret(element)

  generate: ->
    for stave in @elements
      if stave.element != "stave"
        throw newError(stave, "Invalid stave")
      @artist.addStave(@parseStaveOptions(stave.options))

      if stave.notes?
        @parseStaveElements(stave.notes)

  parse: (code) ->
    vextab_parser.parseError = (message, hash) ->
      L message
      throw new Vex.RERR("ParseError", message)

    throw new Vex.RERR("ParseError", "No code") unless code?

    L "Parsing:\n#{code}"
    @elements = vextab_parser.parse(code)
    if @elements
      @valid = true
      @generate()

    return @elements
