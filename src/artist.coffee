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
      bottom_spacing: 20
      tab_stave_lower_spacing: 10
      note_stave_lower_spacing: 0
    _.extend(@options, options)
    @reset()

  reset: ->
    @staves = []
    @notes = []
    @tab_articulations = []
    @stave_articulations = []
    @last_y = @y

    @tuning = new Vex.Flow.Tuning()
    @key_manager = new Vex.Flow.KeyManager("C")
    @music_api = new Vex.Flow.Music()
    @current_duration = "q"
    @current_clef = "treble"

  render: (renderer) ->
    renderer.resize(@width, @last_y + @options.bottom_spacing)
    ctx = renderer.getContext()
    ctx.clear()
    ctx.setFont(@options.font_face, @options.font_size, "")

    for stave in @staves
      stave.note?.setContext(ctx).draw()
      stave.tab?.setContext(ctx).draw()

      if stave.tab? and stave.note?
        Vex.Flow.Formatter.FormatAndDrawTab ctx, stave.tab, stave.note, stave.tab_notes, stave.note_notes, true
      else if stave.tab?
        Vex.Flow.Formatter.FormatAndDraw ctx, stave.tab, stave.tab_notes
      else if stave.note?
        Vex.Flow.Formatter.FormatAndDraw ctx, stave.note, stave.note_notes, true

    for articulation in @tab_articulations
      articulation.setContext(ctx).draw()

    for articulation in @stave_articulations
      articulation.setContext(ctx).draw()

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
    stave_notes = _.last(@staves).note_notes
    stave_note = new Vex.Flow.StaveNote({
            keys: spec
            duration: @current_duration
            clef: @current_clef
            auto_stem: true
          })
    for acc, index in  accidentals
      stave_note.addAccidental(index, new Vex.Flow.Accidental(acc)) if acc?

    stave_notes.push stave_note

  addTabNote: (spec) ->
    tab_notes = _.last(@staves).tab_notes
    new_tab_note = new Vex.Flow.TabNote(
      positions: spec
      duration: @current_duration
    )
    tab_notes.push new_tab_note

  makeDuration = (time, dot) -> time + (if dot then "d" else "")
  setDuration: (time, dot) ->
    @current_duration = makeDuration(time, dot)

  addTabArticulation: (type, first_note, last_note, first_indices, last_indices) ->
    L "addTabArticulations: ", type, first_note, last_note, first_indices, last_indices
    if _.isEmpty(first_indices) and _.isEmpty(last_indices) then return

    articulation = null
    if type == "s"
      articulation = new Vex.Flow.TabSlide({
        first_note: first_note
        last_note: last_note
        first_indices: first_indices
        last_indices: last_indices
        })

    if type in ["h", "p"]
      articulation = new Vex.Flow.TabTie({
        first_note: first_note
        last_note: last_note
        first_indices: first_indices
        last_indices: last_indices
        }, type.toUpperCase())

    if type in ["T", "t"]
      articulation = new Vex.Flow.TabTie({
        first_note: first_note
        last_note: last_note
        first_indices: first_indices
        last_indices: last_indices
        }, " ")

      if type == "t"
        last_note.addModifier(new Vex.Flow.Annotation("T"))

    @tab_articulations.push articulation if articulation?

  addStaveArticulation: (type, first_note, last_note, first_indices, last_indices) ->
    L "addStaveArticulations: ", type, first_note, last_note, first_indices, last_indices
    articulation = null
    if type in ["s", "h", "p", "t", "T"]
      articulation = new Vex.Flow.StaveTie({
        first_note: first_note
        last_note: last_note
        first_indices: first_indices
        last_indices: last_indices
        })

    @stave_articulations.push articulation if articulation?

  addArticulations: (articulations) ->
    L "addArticulations: ", articulations
    stave = _.last(@staves)
    tab_notes = stave.tab_notes
    stave_notes = stave.note_notes
    return if _.isEmpty(tab_notes) or _.isEmpty(articulations)

    current_tab_note = _.last(tab_notes)

    for valid_articulation in ["s", "h", "p", "t", "T"]
      indices = (i for art, i in articulations when art? and art == valid_articulation)
      if _.isEmpty(indices) then continue

      if tab_notes.length < 2
        prev_tab_note = null
        prev_indices = null
      else
        prev_tab_note = tab_notes[tab_notes.length - 2]

        # Figure out which strings the articulations are on
        this_strings = (n.str for n, i in current_tab_note.getPositions() when i in indices)

        # Only allows articulations where both notes are on the same strings
        valid_strings = (pos.str for pos, i in prev_tab_note.getPositions() when pos.str in this_strings)

        # Get indices of articulated notes on previous chord
        prev_indices = (i for n, i in prev_tab_note.getPositions() when n.str in valid_strings)

        # Get indices of articulated notes on current chord
        current_indices = (i for n, i in current_tab_note.getPositions() when n.str in valid_strings)

      if stave.tab?
        @addTabArticulation(valid_articulation,
          prev_tab_note, current_tab_note, prev_indices, current_indices)

      if stave.note?
        @addStaveArticulation(valid_articulation,
          stave_notes[stave_notes.length - 2], _.last(stave_notes),
          prev_indices, current_indices)

  addChord: (chord, chord_articulation, chord_decorator) ->
    return if _.isEmpty(chord)
    L "addTabChord:", chord
    stave = _.last(@staves)

    specs = []          # The stave note specs
    accidentals = []    # The stave accidentals
    articulations = []  # Articulations (ties, bends, taps)
    decorators = []     # Decorators (vibratos, harmonics)
    tab_specs = []      # The tab notes
    durations = []      # The duration of each position
    num_notes = 0

    # Chords are complicated, because they can contain little
    # lines one each string. We need to keep track of the motion
    # of each line so we know which tick they belong in.
    current_string = _.first(chord).string
    current_position = 0

    for note in chord
      num_notes++
      if note.string != current_string
        current_position = 0
        current_string = note.string

      unless specs[current_position]?
        # New position. Create new element arrays for this
        # position.
        specs[current_position] = []
        accidentals[current_position] = []
        tab_specs[current_position] = []
        articulations[current_position] = []
        decorators[current_position] = []

      [new_note, new_octave, accidental] = @getNoteForFret(note.fret, note.string)

      current_duration = if note.time? then {time: note.time, dot: note.dot} else null
      specs[current_position].push "#{new_note}/#{new_octave}"
      accidentals[current_position].push accidental
      tab_specs[current_position].push {fret: note.fret, str: note.string}
      articulations[current_position].push note.articulation
      durations[current_position] = current_duration

      current_position++

    for spec, i in specs
      saved_duration = @current_duration
      @setDuration(durations[i].time, durations[i].dot) if durations[i]?
      @addTabNote tab_specs[i]
      @addStaveNote spec, accidentals[i] if stave.note?
      @addArticulations articulations[i]

    if chord_articulation?
      art = []
      art.push chord_articulation for num in [1..num_notes]
      @addArticulations art

  addNote: (note) ->
    @addChord([note])

  addStave: (options) ->
    opts =
      tuning: "standard"
      clef: "treble"
      key: "C"
      notation: "false"
      tablature: "true"

    _.extend(opts, options)
    L "addTabStave: ", options

    tab_stave = null
    note_stave = null

    # This is used to line up tablature and notation.
    tabstave_start_x = 40

    if opts.notation is "true"
      note_stave = new Vex.Flow.Stave(@x, @last_y, @options.stave_width).
        addClef(opts.clef).addKeySignature(opts.key)
      note_stave.addTimeSignature(opts.time) if opts.time?
      @last_y += note_stave.getHeight() + @options.note_stave_lower_spacing
      tabstave_start_x = note_stave.getNoteStartX()
      @current_clef = opts.clef

    if opts.tablature is "true"
      tab_stave = new Vex.Flow.TabStave(@x, @last_y, @options.stave_width).
        addTabGlyph().setNoteStartX(tabstave_start_x)
      @last_y += tab_stave.getHeight() + @options.tab_stave_lower_spacing

    @staves.push {
      tab: tab_stave,
      note: note_stave,
      tab_notes: [],
      note_notes: []
    }

    @tuning.setTuning(opts.tuning)
    @key_manager.setKey(opts.key)

    return