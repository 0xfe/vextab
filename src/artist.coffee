# VexTab Artist
# Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
#
# This class is responsible for rendering the elements
# parsed by Vex.Flow.VexTab.

class Vex.Flow.Artist
  @DEBUG = false
  L = (args...) -> console?.log("(Vex.Flow.Artist)", args...) if Vex.Flow.Artist.DEBUG

  constructor: (@x, @y, @width, options) ->
    @options =
      stave_width: @width - 20
      font_face: "Arial"
      font_size: 10
    _.extend(@options, options)
    @reset()

  reset: ->
    @staves = []
    @notes = []
    @last_y = @y

    @tuning = new Vex.Flow.Tuning()
    @key_manager = new Vex.Flow.KeyManager("C")
    @music_api = new Vex.Flow.Music()
    @current_duration = "q"
    @current_clef = "treble"

  render: (renderer) ->
    renderer.resize(@width, @last_y)
    ctx = renderer.getContext()
    ctx.clear()
    ctx.setFont(@options.font_face, @options.font_size, "")

    for stave in @staves
      stave.note?.setContext(ctx).draw()
      stave.tab?.setContext(ctx).draw()

      if stave.tab? and stave.note?
        Vex.Flow.Formatter.FormatAndDrawTab ctx, stave.tab, stave.note, stave.tab_notes, stave.note_notes
      else if stave.tab?
        Vex.Flow.Formatter.FormatAndDraw ctx, stave.tab, stave.tab_notes
      else if stave.note?
        Vex.Flow.Formatter.FormatAndDraw ctx, stave.note, stave.note_notes

  setDuration: (duration) ->
    @current_duration = duration

  addChord: (chord, decorator) ->
    stave = @staves.last
    # if stave.note?

  addNote: (note) ->
    stave = _.last(@staves)
    if stave.tab?
      tab_note = new Vex.Flow.TabNote(
        positions: [{fret: note.fret, str: note.string}]
        duration: @current_duration
      )
      stave.tab_notes.push tab_note

    if stave.note?
      spec = @tuning.getNoteForFret(note.fret, note.string)
      spec_props = Vex.Flow.keyProperties(spec)
      selected_note = @key_manager.selectNote(spec_props.key)
      accidental = null

      if selected_note.change
        accidental = if selected_note.accidental == null then "n" else selected_note.accidental

      new_note = selected_note.note
      new_octave = spec_props.octave

      if @music_api.getNoteParts(selected_note.note).root == "b" and @music_api.getNoteParts(spec_props.key).root == "c"
         new_octave--

      else if @music_api.getNoteParts(selected_note.note).root == "c" and @music_api.getNoteParts(spec_props.key).root == "b"
         new_octave++

      new_spec = "#{new_note}/#{new_octave}"

      stave_note = new Vex.Flow.StaveNote({
          keys: [new_spec]
          duration: @current_duration
          clef: @current_clef
          auto_stem: true
        })

      stave.note_notes.push stave_note
      if accidental? then stave_note.addAccidental(0, new Vex.Flow.Accidental(accidental))

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
      @current_clef = opts.clef

    if opts.tablature
      tab_stave = new Vex.Flow.TabStave(@x, @last_y, @options.stave_width).
        addTabGlyph().setNoteStartX(tabstave_start_x)
      @last_y += tab_stave.getHeight()

    @staves.push {
      tab: tab_stave,
      note: note_stave,
      tab_notes: [],
      note_notes: []
    }

    @tuning.setTuning(opts.tuning)
    @key_manager.setKey(opts.key)

    return