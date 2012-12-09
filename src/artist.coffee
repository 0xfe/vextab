class Vex.Flow.Artist
  @DEBUG = true
  L = (message) -> console.log("Vex.Flow.Artist: #{message}") if Vex.Flow.Artist.DEBUG
  LO = (object) -> console.log(object) if Vex.Flow.Artist.DEBUG

  constructor: (@x, @y, @width, options) ->
    @staves = []
    @notes = []

    @current_stave = 0
    @current_note = 0
    @last_y = @y

    @tuning = new Vex.Flow.Tuning()
    @key_manager = new Vex.Flow.KeyManager("C")

    @options =
      tabstave_height: 100
      notestave_height: 100

    _.extend(@options, options)

  addStave: (options) ->
    local_options =
      tuning: "standard"
      key: "C"

    _.extend(local_options, options)
    @tuning.setTuning(local_options.tuning)
    @key_manager.setKey(local_options.key)

    @addTabStave(options)
    @addNoteStave(options) if options["notation"]

  addTabStave: (options) ->
    L "Adding tab stave"
    @last_y += @options.tabstave_height
    stave = new Vex.Flow.TabStave(@x, @last_y, @width)
    @staves.push stave
    return stave

  addNoteStave: (options) ->
    L "Adding note stave"
    @last_y += @options.notestave_height
    stave = new Vex.Flow.Stave(@x, @last_y, @width)

    local_options =
      clef: "treble"
      key: "C"
      time: "4/4"

    _.extend(local_options, options) if options

    stave.addClef(local_options.clef)
    @staves.push stave
    return stave