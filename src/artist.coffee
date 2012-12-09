class Vex.Flow.Artist
  @DEBUG = false
  L = (args...) -> console?.log("(Vex.Flow.Artist)", args...) if Vex.Flow.Artist.DEBUG

  constructor: (@x, @y, @width, options) ->
   @options =
      stave_width: @width - 20
    _.extend(@options, options)
    @reset()

  reset: ->
    @staves = []
    @notes = []
    @last_y = @y

    @tuning = new Vex.Flow.Tuning()
    @key_manager = new Vex.Flow.KeyManager("C")

  render: (renderer) ->
    renderer.resize(@width, @last_y)
    ctx = renderer.getContext()
    ctx.clear()
    ctx.setFont("Arial", 10, "")

    for stave in @staves
      stave.tab?.setContext(ctx).draw()
      stave.note?.setContext(ctx).draw()

  addStave: (options) ->
    opts =
      tuning: "standard"
      clef: "treble"
      key: "C"
      notation: false
      tablature: true

    _.extend(opts, options)

    tab_stave = null
    note_stave = null

    # This is used to line up tablature and notation.
    tabstave_start_x = 20

    if opts.notation
      note_stave = new Vex.Flow.Stave(@x, @last_y, @options.stave_width).
        addClef(opts.clef).addKeySignature(opts.key)
      note_stave.addTimeSignature(opts.time) if opts.time?
      @last_y += note_stave.getHeight()
      tabstave_start_x = note_stave.getNoteStartX()

    if opts.tablature
      tab_stave = new Vex.Flow.TabStave(@x, @last_y, @options.stave_width).
        addTabGlyph().setNoteStartX(tabstave_start_x)
      @last_y += tab_stave.getHeight()


    @staves.push {tab: tab_stave, note: note_stave}
    @tuning.setTuning(opts.tuning)
    @key_manager.setKey(opts.key)

    return