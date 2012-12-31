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
      font_face: "Arial"
      font_size: 10
      font_style: null
      bottom_spacing: 20
      tab_stave_lower_spacing: 10
      note_stave_lower_spacing: 0
      scale: 1.0
    _.extend(@options, options) if options?
    @reset()

  reset: ->
    @tuning = new Vex.Flow.Tuning()
    @key_manager = new Vex.Flow.KeyManager("C")
    @music_api = new Vex.Flow.Music()

    # User customizations
    @customizations =
      "font-size": @options.font_size
      "font-face": @options.font_face
      "font-style": @options.font_style
      "scale": @options.scale
      "width": @width
      "stave-distance": 0
      "space": 0

    # Generated elements
    @staves = []
    @notes = []
    @tab_articulations = []
    @stave_articulations = []

    # Current state
    @last_y = @y
    @current_duration = "q"
    @current_clef = "treble"
    @current_bends = {}
    @bend_start_index = null
    @bend_start_strings = null

  setOptions: (options) ->
    L "setOptions: ", options
    valid_options = _.keys(@customizations)
    for k, v of options
      if k in valid_options
        @customizations[k] = v
      else
        throw new Vex.RERR("ArtistError", "Invalid option '#{k}'")

    @last_y += parseInt(@customizations.space, 10)

  render: (renderer) ->
    L "Render: ", @options
    @closeBends()
    renderer.resize(@customizations.width * @customizations.scale,
        (@last_y + @options.bottom_spacing) * @customizations.scale)
    ctx = renderer.getContext()
    ctx.scale(@customizations.scale, @customizations.scale)
    ctx.clear()
    ctx.setFont(@options.font_face, @options.font_size, "")

    for stave in @staves
      L "Rendering note stave."
      stave.note?.setContext(ctx).draw()
      L "Rendering tab stave."
      stave.tab?.setContext(ctx).draw()

      if stave.tab? and stave.note?
        Vex.Flow.Formatter.FormatAndDrawTab ctx, stave.tab, stave.note, stave.tab_notes, stave.note_notes, true
      else if stave.tab?
        Vex.Flow.Formatter.FormatAndDraw ctx, stave.tab, stave.tab_notes
      else if stave.note?
        Vex.Flow.Formatter.FormatAndDraw ctx, stave.note, stave.note_notes, true

    L "Rendering tab articulations."
    for articulation in @tab_articulations
      articulation.setContext(ctx).draw()

    L "Rendering note articulations."
    for articulation in @stave_articulations
      articulation.setContext(ctx).draw()

  draw: (renderer) -> @render renderer

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

  addStaveNote: (spec, accidentals, is_rest=false) ->
    stave_notes = _.last(@staves).note_notes
    stave_note = new Vex.Flow.StaveNote({
            keys: spec
            duration: @current_duration + (if is_rest then "r" else "")
            clef: @current_clef
            auto_stem: if is_rest then false else true
          })
    for acc, index in accidentals
      stave_note.addAccidental(index, new Vex.Flow.Accidental(acc)) if acc?

    if @current_duration[@current_duration.length - 1] == "d"
      stave_note.addDotToAll()

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

  addBar: ->
    L "addBar()"
    @closeBends()
    stave = _.last(@staves)
    stave.tab_notes.push(new Vex.Flow.BarNote())
    stave.note_notes.push(new Vex.Flow.BarNote()) if stave.note?

  makeBend = (from_fret, to_fret) ->
    direction = Vex.Flow.Bend.UP
    text = ""

    if from_fret > to_fret
      direction = Vex.Flow.Bend.DOWN
    else
      text = switch Math.abs(to_fret - from_fret)
        when 1 then "1/2"
        when 2 then "Full"
        when 3 then "1 1/2"
        else "Bend to #{to_fret}"

    return {type: direction, text: text}

  openBends: (first_note, last_note, first_indices, last_indices) ->
    L "openBends", first_note, last_note, first_indices, last_indices
    tab_notes = _.last(@staves).tab_notes

    start_note = first_note
    start_indices = first_indices
    if _.isEmpty(@current_bends)
      @bend_start_index = tab_notes.length - 2
      @bend_start_strings = first_indices
    else
      start_note = tab_notes[@bend_start_index]
      start_indices = @bend_start_strings

    first_frets = start_note.getPositions()
    last_frets = last_note.getPositions()
    for index, i in start_indices
      last_index = last_indices[i]
      from_fret = first_note.getPositions()[first_indices[i]]
      to_fret = last_frets[last_index]
      @current_bends[index] ?= []
      @current_bends[index].push makeBend(from_fret.fret, to_fret.fret)

  # Close and apply all the bends to the last N notes.
  closeBends: (offset=1) ->
    return unless @bend_start_index?
    L "closeBends(#{offset})"
    tab_notes = _.last(@staves).tab_notes
    for k, v of @current_bends
      phrase = []
      for bend in v
        phrase.push bend
      tab_notes[@bend_start_index].addModifier(
        new Vex.Flow.Bend(null, null, phrase), k)

    # Replace bent notes with ghosts (make them invisible)
    for tab_note in tab_notes[@bend_start_index+1..((tab_notes.length - 2) + offset)]
      tab_note.setGhost(true)

    @current_bends = {}
    @bend_start_index = null

  makeTuplets: (tuplets, notes) ->
    L "makeTuplets", tuplets, notes
    notes ?= tuplets
    return unless _.last(@staves).note
    stave_notes = _.last(@staves).note_notes
    tab_notes = _.last(@staves).tab_notes

    throw new Vex.RERR("ArtistError", "Not enough notes for tuplet") if stave_notes.length < notes
    modifier = new Vex.Flow.Tuplet(stave_notes[stave_notes.length - notes..])
    @stave_articulations.push modifier
    # Throw away tab tuplet because it can't be rendered
    new Vex.Flow.Tuplet(tab_notes[tab_notes.length - notes..])

  makeAnnotation: (text) ->
    font_face = @customizations["font-face"]
    font_size = @customizations["font-size"]
    font_style = @customizations["font-style"]
    parts = text.match(/^\.([^-]*)-([^-]*)-([^.]*)\.(.*)/)

    if parts?
      font_face = parts[1]
      font_size = parts[2]
      font_style = parts[3]
      text = parts[4]
    else
      parts = text.match(/^\.([^.]*)\.(.*)/)
      if parts?
        text = parts[2]
        switch parts[1]
          when "big"
            font_style = "bold"
            font_size = "14"
          when "italic", "italics"
            font_face = "Times"
            font_style = "italic"
          when "medium"
            font_size = "12"

    annotation = new Vex.Flow.Annotation(text).
      setFont(font_face, font_size, font_style)

  addAnnotations: (annotations) ->
    stave = _.last(@staves)
    stave_notes = stave.note_notes
    tab_notes = stave.tab_notes

    if annotations.length > tab_notes.length
      throw new Vex.RERR("ArtistError", "More annotations than note elements")

    if stave.tab
      for tab_note, i in tab_notes[tab_notes.length - annotations.length..]
        tab_note.addModifier(@makeAnnotation(annotations[i]), 0)
    else
      for note, i in stave_notes[stave_notes.length - annotations.length..]
        note.addAnnotation(0, @makeAnnotation(annotations[i]))

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

    if type == "b"
      @openBends(first_note, last_note, first_indices, last_indices)

    @tab_articulations.push articulation if articulation?

  addStaveArticulation: (type, first_note, last_note, first_indices, last_indices) ->
    L "addStaveArticulations: ", type, first_note, last_note, first_indices, last_indices
    articulation = null
    if type in ["b", "s", "h", "p", "t", "T"]
      articulation = new Vex.Flow.StaveTie({
        first_note: first_note
        last_note: last_note
        first_indices: first_indices
        last_indices: last_indices
        })

    @stave_articulations.push articulation if articulation?

  # This gets the previous (second-to-last) non-bar non-ghost note.
  getPreviousNoteIndex: ->
    tab_notes = _.last(@staves).tab_notes
    index = 2
    while index <= tab_notes.length
      note = tab_notes[tab_notes.length - index]
      return (tab_notes.length - index) if note instanceof Vex.Flow.TabNote
      index++

    return -1

  addDecorator: (decorator) ->
    L "addDecorator: ", decorator
    return unless decorator?

    stave = _.last(@staves)
    tab_notes = stave.tab_notes
    modifier = null

    if decorator == "v"
      modifier = new Vex.Flow.Vibrato()
    if decorator == "V"
      modifier = new Vex.Flow.Vibrato().setHarsh(true)

    _.last(tab_notes).addModifier(modifier, 0) if modifier?

  addArticulations: (articulations) ->
    L "addArticulations: ", articulations
    stave = _.last(@staves)
    tab_notes = stave.tab_notes
    stave_notes = stave.note_notes
    if _.isEmpty(tab_notes) or _.isEmpty(articulations)
      @closeBends(0)
      return

    current_tab_note = _.last(tab_notes)

    has_bends = false
    for valid_articulation in ["b", "s", "h", "p", "t", "T", "v", "V"]
      indices = (i for art, i in articulations when art? and art == valid_articulation)
      if _.isEmpty(indices) then continue

      if valid_articulation is "b" then has_bends = true
      prev_index = @getPreviousNoteIndex()
      L "prev_tab_note: ", prev_tab_note
      if prev_index is -1
        prev_tab_note = null
        prev_indices = null
      else
        prev_tab_note = tab_notes[prev_index]
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
          stave_notes[prev_index], _.last(stave_notes),
          prev_indices, current_indices)

    @closeBends(0) unless has_bends

  addRest: (params) ->
    L "addRest: ", params
    @closeBends()

    if params["position"] == 0
      @addStaveNote ["r/4"], [], true
    else
      position = @tuning.getNoteForFret(parseInt(params["position"] * 2, 10), 4)
      @addStaveNote [position], [], true

    tab_notes = _.last(@staves).tab_notes
    tab_notes.push new Vex.Flow.GhostNote(@current_duration)

  addChord: (chord, chord_articulation, chord_decorator) ->
    return if _.isEmpty(chord)
    L "addTabChord: ", chord
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
      articulations[current_position].push note.articulation if note.articulation?
      durations[current_position] = current_duration
      decorators[current_position] = note.decorator if note.decorator?

      current_position++

    for spec, i in specs
      saved_duration = @current_duration
      @setDuration(durations[i].time, durations[i].dot) if durations[i]?
      @addTabNote tab_specs[i]
      @addStaveNote spec, accidentals[i] if stave.note?
      @addArticulations articulations[i]
      @addDecorator decorators[i] if decorators[i]?


    if chord_articulation?
      art = []
      art.push chord_articulation for num in [1..num_notes]
      @addArticulations art

    @addDecorator chord_decorator if chord_decorator?

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
      note_stave = new Vex.Flow.Stave(@x, @last_y, @customizations.width - 20).
        addClef(opts.clef).addKeySignature(opts.key)
      note_stave.addTimeSignature(opts.time) if opts.time?
      @last_y += note_stave.getHeight() +
                 @options.note_stave_lower_spacing +
                 parseInt(@customizations["stave-distance"], 10)
      tabstave_start_x = note_stave.getNoteStartX()
      @current_clef = opts.clef

    if opts.tablature is "true"
      tab_stave = new Vex.Flow.TabStave(@x, @last_y, @customizations.width - 20).
        addTabGlyph().setNoteStartX(tabstave_start_x)
      @last_y += tab_stave.getHeight() + @options.tab_stave_lower_spacing

    @closeBends()
    @staves.push {
      tab: tab_stave,
      note: note_stave,
      tab_notes: [],
      note_notes: []
    }

    @tuning.setTuning(opts.tuning)
    @key_manager.setKey(opts.key)

    return