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

  parseStaveOptions: (options) ->
    params = {}
    return params unless options?

    # Keep track of notation visibility
    notation_visibility =
      notation: false
      tablature: true

    notation_option = null

    for option in options
      error = (msg) -> newError(option, msg)
      params[option.key] = option.value
      switch option.key
        when "notation", "tablature"
          throw error("'#{option.key}' must be 'true' or 'false'") if option.value not in ["true", "false"]
          notation_visibility[option.key] = option.value
          notation_option = option
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

    if notation_visibility["notation"] == "false" and notation_visibility["tablature"] == "false"
       throw newError(notation_option, "Both 'notation' and 'tablature' can't be invisible")

    return params

  generate: ->
    for stave in @elements
      if stave.element != "stave"
        throw newError(stave, "Invalid stave")

      @artist.addStave(@parseStaveOptions(stave.options))

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
