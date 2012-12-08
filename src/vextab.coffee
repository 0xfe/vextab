class Vex.Flow.VexTab
  constructor: (@artist) ->
    @valid = false
    vextab_parser.parseError = Vex.Flow.VexTab.parseError
    vextab_parser.artist = @artist

  @parseError: (message, hash) ->
    throw new Vex.RERR("ParseError", message)

  parse: (code) ->
    return vextab_parser.parse(code)
