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

  # Given a fret/string pair, returns a note, octave, and required accidentals
  # based on current guitar tuning and stave key. The accidentals may be different
  # for repeats of the same notes because they get set (or cancelled) by the Key
  # Manager.
  getNoteForFret: (fret, string) ->
    spec = @tuning.getNoteForFret(fret, string)
    spec_props = Vex.Flow.keyProperties(spec)

    selected_note = @key_manager.selectNote(spec_props.key)
    accidental = null

    # Do we need to specify an explicit accidental?
    if selected_note.change
      accidental = unless selected_note.accidental? then "n" else selected_note.accidental

    new_note = selected_note.note
    new_octave = spec_props.octave

    # TODO(0xfe): This logic should probably be in the KeyManager code
    old_root = @music_api.getNoteParts(spec_props.key).root
    new_root = @music_api.getNoteParts(selected_note.note).root

    # Figure out if there's an octave shift based on what the Key
    # Manager just told us about the note.
    if new_root == "b" and old_root == "c"
       new_octave--
    else if new_root == "c" and old_root == "b"
       new_octave++

    return [new_note, new_octave, accidental]

  addStaveNote: (spec, accidentals) ->
    stave_note = new Vex.Flow.StaveNote({
            keys: spec
            duration: @current_duration
            clef: @current_clef
            auto_stem: true
          })
    _.each accidentals, (acc, index) ->
          stave_note.addAccidental(index, new Vex.Flow.Accidental(acc)) if acc?

    _.last(@staves).note_notes.push stave_note

  addTabNote: (spec) ->
    L "addTabNote:", spec
    tab_note = new Vex.Flow.TabNote(
      positions: spec
      duration: @current_duration
    )
    _.last(@staves).tab_notes.push tab_note

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
    return if _.isEmpty(chord)
    L "addTabChord:", chord
    stave = _.last(@staves)

    specs = []          # The stave note specs
    accidentals = []    # The stave accidentals
    tab_specs = []      # The tab notes

    # Chords are complicated, because they can contain little
    # lines one each string. We need to keep track of the motion
    # of each line so we know which tick they belong in.
    current_string = _.first(chord).string
    current_position = 0

    for note in chord
      if note.string != current_string
        current_position = 0
        current_string = note.string

      unless specs[current_position]?
        specs[current_position] = []
        accidentals[current_position] = []
        tab_specs[current_position] = []

      [new_note, new_octave, accidental] = @getNoteForFret(note.fret, note.string)

      specs[current_position].push "#{new_note}/#{new_octave}"
      accidentals[current_position].push accidental
      tab_specs[current_position].push {fret: note.fret, str: note.string}

      current_position++

    _.each specs, (spec, spec_index) =>
      @addStaveNote(spec, accidentals[spec_index]) if stave.note?
      @addTabNote tab_specs[spec_index] if stave.tab?

  addNote: (note) ->
    @addChord([note])

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