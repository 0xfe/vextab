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

  addTabChord: (chord, decorator) ->
    stave = _.last(@staves)
    if stave.tab?
      positions = []
      for note in chord
          positions.push {fret: note.fret, str: note.string}

      tab_note = new Vex.Flow.TabNote(
        positions: positions
        duration: @current_duration
      )
      stave.tab_notes.push tab_note

    if stave.note?
      specs = []
      accidentals = []
      for note in chord
        spec = @tuning.getNoteForFret(note.fret, note.string)
        spec_props = Vex.Flow.keyProperties(spec)
        selected_note = @key_manager.selectNote(spec_props.key)
        accidental = null

        if selected_note.change
          accidental = unless selected_note.accidental? then "n" else selected_note.accidental

        new_note = selected_note.note
        new_octave = spec_props.octave

        # TODO(0xfe): This logic should probably be in the KeyManager code
        old_root = @music_api.getNoteParts(spec_props.key).root
        new_root = @music_api.getNoteParts(selected_note.note).root

        if new_root == "b" and old_root == "c"
           new_octave--
        else if new_root == "c" and old_root == "b"
           new_octave++

        specs.push "#{new_note}/#{new_octave}"
        accidentals.push accidental


      stave_note = new Vex.Flow.StaveNote({
          keys: specs
          duration: @current_duration
          clef: @current_clef
          auto_stem: true
        })
      stave.note_notes.push stave_note

      _.each(accidentals, (acc, index) ->
        stave_note.addAccidental(index, new Vex.Flow.Accidental(acc)) if acc?)

  addTabNote: (note) ->
    @addTabChord([note])

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