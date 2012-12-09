class Vex.Flow.VexTab
  constructor: (@artist) ->
    @valid = false
    vextab_parser.parseError = Vex.Flow.VexTab.parseError

  @parseError: (message, hash) ->
    throw new Vex.RERR("ParseError", message)

  parse: (code) ->
    console.log("Parsing: #{code}")
    return vextab_parser.parse(code)
