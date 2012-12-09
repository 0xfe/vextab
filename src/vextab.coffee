class Vex.Flow.VexTab
  @DEBUG = true
  L = (message) -> console.log(message) if Vex.Flow.VexTab.DEBUG

  constructor: (@artist) ->
    @valid = false
    vextab_parser.parseError = Vex.Flow.VexTab.parseError

  @parseError: (message, hash) ->
    L message
    throw new Vex.RERR("ParseError", message)

  parse: (code) ->
    L "Parsing:\n#{code}"
    return vextab_parser.parse(code)
