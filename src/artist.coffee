class Vex.Flow.Artist
  constructor: (@x, @y, @width, options) ->
    @staves = []
    @notes = []

    @current_stave = 0
    @current_note = 0
    @last_y = @y

    @tuning = new Vex.Flow.Tuning()

    @options =
      tabstave_height: 100
      notestave_height: 100

    _.extend(@options, options)


  addTabStave: (options) ->
    Vex.L("Adding tab stave")
    @last_y += @options.tabstave_height
    stave = new Vex.Flow.TabStave(@x, @last_y, @width)

    local_options =
      tuning: "standard"

    _.extend(local_options, options) if options

    @tuning.setTuning(local_options.tuning)
    @staves.push stave
    return stave

  addNoteStave: (options) ->
    Vex.L("Adding note stave")
    @last_y += @options.notestave_height
    stave = new Vex.Flow.Stave(@x, @last_y, @width)

    local_options =
      clef: "treble"
      key: "C"
      time: "4/4"

    _.extend(local_options, options) if options

    Vex.L("Adding clef")
    stave.addClef(local_options.clef)

    @staves.push stave
    return stave