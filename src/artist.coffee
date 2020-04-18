# VexTab Artist
# Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
#
# This class is responsible for rendering the elements
# parsed by Vex.Flow.VexTab.


import Vex from 'vexflow'
import * as _ from 'lodash'

class Artist
  @DEBUG = false
  L = (args...) -> console?.log("(Vex.Flow.Artist)", args...) if Artist.DEBUG

  @NOLOGO = false

  constructor: (@x, @y, @width, options) ->
    @options =
      font_face: "Arial"
      font_size: 10
      font_style: null
      bottom_spacing: 20 + (if Artist.NOLOGO then 0 else 10)
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
      "annotation-position": "bottom"
      "scale": @options.scale
      "width": @width
      "stave-distance": 0
      "space": 0
      "player": "false"
      "tempo": 120
      "instrument": "acoustic_grand_piano"
      "accidentals": "standard"  # standard / cautionary
      "tab-stems": "false"
      "tab-stem-direction": "up"
      "beam-rests": "true"
      "beam-stemlets": "true"
      "beam-middle-only": "false"
      "connector-space": 5

    # Generated elements
    @staves = []
    @tab_articulations = []
    @stave_articulations = []

    # Voices for player
    @player_voices = []

    # Current state
    @last_y = @y
    @current_duration = "q"
    @current_clef = "treble"
    @current_bends = {}
    @current_octave_shift = 0
    @bend_start_index = null
    @bend_start_strings = null
    @rendered = false
    @renderer_context = null

  attachPlayer: (player) ->
    @player = player

  setOptions: (options) ->
    L "setOptions: ", options
    # Set @customizations
    valid_options = _.keys(@customizations)
    for k, v of options
      if k in valid_options
        @customizations[k] = v
      else
        throw new Vex.RERR("ArtistError", "Invalid option '#{k}'")

    @last_y += parseInt(@customizations.space, 10)
    @last_y += 15 if @customizations.player is "true"

  getPlayerData: ->
    voices: @player_voices
    context: @renderer_context
    scale: @customizations.scale

  parseBool = (str) ->
    return (str == "true")

  formatAndRender = (ctx, tab, score, text_notes, customizations, options) ->
    tab_stave = tab.stave if tab?
    score_stave = score.stave if score?

    tab_voices = []
    score_voices = []
    text_voices = []
    beams = []
    format_stave = null
    text_stave = null

    beam_config =
      beam_rests: parseBool(customizations["beam-rests"])
      show_stemlets: parseBool(customizations["beam-stemlets"])
      beam_middle_only: parseBool(customizations["beam-middle-only"])
      groups: options.beam_groups

    if tab?
      multi_voice = if (tab.voices.length > 1) then true else false
      for notes, i in tab.voices
        continue if _.isEmpty(notes)
        _.each(notes, (note) -> note.setStave(tab_stave))
        voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4).
          setMode(Vex.Flow.Voice.Mode.SOFT)
        voice.addTickables notes
        tab_voices.push voice

        if customizations["tab-stems"] == "true"
          if multi_voice
            beam_config.stem_direction = if i == 0 then 1 else -1
          else
            beam_config.stem_direction = if customizations["tab-stem-direction"] == "down" then -1 else 1

          beam_config.beam_rests = false
          beams = beams.concat(Vex.Flow.Beam.generateBeams(voice.getTickables(), beam_config))

      format_stave = tab_stave
      text_stave = tab_stave

    beam_config.beam_rests = parseBool(customizations["beam-rests"])

    if score?
      multi_voice = if (score.voices.length > 1) then true else false
      for notes, i in score.voices
        continue if _.isEmpty(notes)
        stem_direction = if i == 0 then 1 else -1
        _.each(notes, (note) -> note.setStave(score_stave))

        voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4).
          setMode(Vex.Flow.Voice.Mode.SOFT)
        voice.addTickables notes
        score_voices.push voice
        if multi_voice
          beam_config.stem_direction = stem_direction
          beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config))
        else
          beam_config.stem_direction = null
          beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config))

      format_stave = score_stave
      text_stave = score_stave

    for notes in text_notes
      continue if _.isEmpty(notes)
      _.each(notes, (voice) -> voice.setStave(text_stave))
      voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4).
          setMode(Vex.Flow.Voice.Mode.SOFT)
      voice.addTickables notes
      text_voices.push voice

    if format_stave?
      format_voices = []
      formatter = new Vex.Flow.Formatter()
      align_rests = false

      if tab?
        formatter.joinVoices(tab_voices) unless _.isEmpty(tab_voices)
        format_voices = tab_voices

      if score?
        formatter.joinVoices(score_voices) unless _.isEmpty(score_voices)
        format_voices = format_voices.concat(score_voices)
        align_rests = true if score_voices.length > 1

      if not _.isEmpty(text_notes) and not _.isEmpty(text_voices)
        formatter.joinVoices(text_voices)
        format_voices = format_voices.concat(text_voices)

      formatter.formatToStave(format_voices, format_stave, {align_rests: align_rests}) unless _.isEmpty(format_voices)

      _.each(tab_voices, (voice) -> voice.draw(ctx, tab_stave)) if tab?
      _.each(score_voices, (voice) -> voice.draw(ctx, score_stave)) if score?
      _.each(beams, (beam) -> beam.setContext(ctx).draw())
      _.each(text_voices, (voice) -> voice.draw(ctx, text_stave)) if not _.isEmpty(text_notes)

      if tab? and score?
        (new Vex.Flow.StaveConnector(score.stave, tab.stave))
          .setType(Vex.Flow.StaveConnector.type.BRACKET)
          .setContext(ctx).draw()

      if score? then score_voices else tab_voices

  render: (renderer) ->
    L "Render: ", @options
    @closeBends()
    renderer.resize(@customizations.width * @customizations.scale,
        (@last_y + @options.bottom_spacing) * @customizations.scale)
    ctx = renderer.getContext()
    ctx.scale(@customizations.scale, @customizations.scale)
    ctx.clear()
    ctx.setFont(@options.font_face, @options.font_size, "")

    @renderer_context = ctx

    setBar = (stave, notes) ->
      last_note = _.last(notes)
      if last_note instanceof Vex.Flow.BarNote
        notes.pop()
        stave.setEndBarType(last_note.getType())

    for stave in @staves
      L "Rendering staves."
      # If the last note is a bar, then remove it and render it as a stave modifier.
      setBar(stave.tab, stave.tab_notes) if stave.tab?
      setBar(stave.note, stave.note_notes) if stave.note?

      stave.tab.setContext(ctx).draw() if stave.tab?
      stave.note.setContext(ctx).draw() if stave.note?

      stave.tab_voices.push(stave.tab_notes)
      stave.note_voices.push(stave.note_notes)

      voices = formatAndRender(ctx,
                      if stave.tab? then {stave: stave.tab, voices: stave.tab_voices} else null,
                      if stave.note? then {stave: stave.note, voices: stave.note_voices} else null,
                      stave.text_voices,
                      @customizations,
                      {beam_groups: stave.beam_groups})

      @player_voices.push(voices)

    L "Rendering tab articulations."
    for articulation in @tab_articulations
      articulation.setContext(ctx).draw()

    L "Rendering note articulations."
    for articulation in @stave_articulations
      articulation.setContext(ctx).draw()

    if @player?
      if @customizations.player is "true"
        @player.setTempo(parseInt(@customizations.tempo, 10))
        @player.setInstrument(@customizations.instrument)
        @player.render()
      else
        @player.removeControls()
    @rendered = true

    unless Artist.NOLOGO
      LOGO = "vexflow.com"
      width = ctx.measureText(LOGO).width
      ctx.save()
      ctx.setFont("Times", 10, "italic")
      ctx.fillText(LOGO, (@customizations.width - width) / 2, @last_y + 25)
      ctx.restore()

  isRendered: -> @rendered

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
    switch @customizations.accidentals
      when "standard"
        if selected_note.change
          accidental = if selected_note.accidental? then selected_note.accidental else "n"
      when "cautionary"
        if selected_note.change
          accidental = if selected_note.accidental? then selected_note.accidental else "n"
        else
          accidental = if selected_note.accidental? then selected_note.accidental + "_c"
      else
        throw new Vex.RERR("ArtistError", "Invalid value for option 'accidentals': #{@customizations.accidentals}")

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

  getNoteForABC: (abc, string) ->
    key = abc.key
    octave = string
    accidental = abc.accidental
    accidental += "_#{abc.accidental_type}" if abc.accidental_type?
    return [key, octave, accidental]

  addStaveNote: (note_params) ->
    params =
      is_rest: false
      play_note: null

    _.extend(params, note_params)
    stave_notes = _.last(@staves).note_notes
    stave_note = new Vex.Flow.StaveNote({
      keys: params.spec
      duration: @current_duration + (if params.is_rest then "r" else "")
      clef: if params.is_rest then "treble" else @current_clef
      auto_stem: if params.is_rest then false else true
    })
    for acc, index in params.accidentals
      if acc?
        parts = acc.split("_")
        new_accidental = new Vex.Flow.Accidental(parts[0])

        if parts.length > 1 and parts[1] == "c"
          new_accidental.setAsCautionary()

        stave_note.addAccidental(index, new_accidental)

    if @current_duration[@current_duration.length - 1] == "d"
      stave_note.addDotToAll()

    stave_note.setPlayNote(params.play_note) if params.play_note?
    stave_notes.push stave_note

  addTabNote: (spec, play_note=null) ->
    tab_notes = _.last(@staves).tab_notes
    new_tab_note = new Vex.Flow.TabNote({
      positions: spec,
      duration: @current_duration
      }, (@customizations["tab-stems"] == "true")
    )
    new_tab_note.setPlayNote(play_note) if play_note?
    tab_notes.push new_tab_note

    if @current_duration[@current_duration.length - 1] == "d"
      new_tab_note.addDot()

  makeDuration = (time, dot) -> time + (if dot then "d" else "")
  setDuration: (time, dot=false) ->
    t = time.split(/\s+/)
    L "setDuration: ", t[0], dot
    @current_duration = makeDuration(t[0], dot)

  addBar: (type) ->
    L "addBar: ", type
    @closeBends()
    @key_manager.reset()
    stave = _.last(@staves)

    TYPE = Vex.Flow.Barline.type
    type = switch type
      when "single"
        TYPE.SINGLE
      when "double"
        TYPE.DOUBLE
      when "end"
        TYPE.END
      when "repeat-begin"
        TYPE.REPEAT_BEGIN
      when "repeat-end"
        TYPE.REPEAT_END
      when "repeat-both"
        TYPE.REPEAT_BOTH
      else
        TYPE.SINGLE

    bar_note = new Vex.Flow.BarNote().setType(type)
    stave.tab_notes.push(bar_note)
    stave.note_notes.push(bar_note) if stave.note?

  makeBend = (from_fret, to_fret) ->
    direction = Vex.Flow.Bend.UP
    text = ""

    if parseInt(from_fret, 10) > parseInt(to_fret, 10)
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
    modifier = new Vex.Flow.Tuplet(stave_notes[stave_notes.length - notes..], {num_notes: tuplets})
    @stave_articulations.push modifier

    # Creating a Vex.Flow.Tuplet corrects the ticks for the notes, so it needs to
    # be created whether or not it gets rendered. Below, if tab stems are not required
    # the created tuplet is simply thrown away.
    tab_modifier = new Vex.Flow.Tuplet(tab_notes[tab_notes.length - notes..], {num_notes: tuplets})
    if @customizations["tab-stems"] == "true"
      @tab_articulations.push tab_modifier

  getFingering = (text) -> text.match(/^\.fingering\/([^.]+)\./)
  makeFingering: (text) ->
    parts = getFingering(text)
    POS = Vex.Flow.Modifier.Position
    fingers = []
    fingering = []

    if parts?
      fingers = (p.trim() for p in parts[1].split(/-/))
    else
      return null

    badFingering = -> new Vex.RERR("ArtistError", "Bad fingering: #{parts[1]}")

    for finger in fingers
      pieces = finger.match(/(\d+):([ablr]):([fs]):([^-.]+)/)
      throw badFingering() unless pieces?

      note_number = parseInt(pieces[1], 10) - 1
      position = POS.RIGHT
      switch pieces[2]
        when "l"
          position = POS.LEFT
        when "r"
          position = POS.RIGHT
        when "a"
          position = POS.ABOVE
        when "b"
          position = POS.BELOW

      modifier = null
      number = pieces[4]
      switch pieces[3]
        when "s"
          modifier = new Vex.Flow.StringNumber(number).setPosition(position)
        when "f"
          modifier = new Vex.Flow.FretHandFinger(number).setPosition(position)

      fingering.push({num: note_number, modifier: modifier})

    return fingering

  getStrokeParts = (text) -> text.match(/^\.stroke\/([^.]+)\./)
  makeStroke: (text) ->
    parts = getStrokeParts(text)
    TYPE = Vex.Flow.Stroke.Type
    type = null

    if parts?
      switch parts[1]
        when "bu"
          type = TYPE.BRUSH_UP
        when "bd"
          type = TYPE.BRUSH_DOWN
        when "ru"
          type = TYPE.ROLL_UP
        when "rd"
          type = TYPE.ROLL_DOWN
        when "qu"
          type = TYPE.RASQUEDO_UP
        when "qd"
          type = TYPE.RASQUEDO_DOWN
        else
          throw new Vex.RERR("ArtistError", "Invalid stroke type: #{parts[1]}")
      return new Vex.Flow.Stroke(type)
    else
      return null

  getScoreArticulationParts = (text) -> text.match(/^\.(a[^\/]*)\/(t|b)[^.]*\./)
  makeScoreArticulation: (text) ->
    parts = getScoreArticulationParts(text)
    if parts?
      type = parts[1]
      position = parts[2]

      POSTYPE = Vex.Flow.Modifier.Position
      pos = if position is "t" then POSTYPE.ABOVE else POSTYPE.BELOW
      return new Vex.Flow.Articulation(type).setPosition(pos)
    else return null

  makeAnnotation: (text) ->
    font_face = @customizations["font-face"]
    font_size = @customizations["font-size"]
    font_style = @customizations["font-style"]
    aposition = @customizations["annotation-position"]

    VJUST = Vex.Flow.Annotation.VerticalJustify
    default_vjust = if aposition is "top" then VJUST.TOP else VJUST.BOTTOM

    makeIt = (text, just=default_vjust) ->
      new Vex.Flow.Annotation(text).
        setFont(font_face, font_size, font_style).
        setVerticalJustification(just)

    parts = text.match(/^\.([^-]*)-([^-]*)-([^.]*)\.(.*)/)
    if parts?
      font_face = parts[1]
      font_size = parts[2]
      font_style = parts[3]
      text = parts[4]
      return if text then makeIt(text) else null

    parts = text.match(/^\.([^.]*)\.(.*)/)
    if parts?
      just = default_vjust
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
        when "top"
          just = VJUST.TOP
          @customizations["annotation-position"] = "top"
        when "bottom"
          just = VJUST.BOTTOM
          @customizations["annotation-position"] = "bottom"
      return if text then makeIt(text, just) else null

    return makeIt(text)

  addAnnotations: (annotations) ->
    stave = _.last(@staves)
    stave_notes = stave.note_notes
    tab_notes = stave.tab_notes

    if annotations.length > tab_notes.length
      throw new Vex.RERR("ArtistError", "More annotations than note elements")

    # Add text annotations
    if stave.tab
      for tab_note, i in tab_notes[tab_notes.length - annotations.length..]
        if getScoreArticulationParts(annotations[i])
          score_articulation = @makeScoreArticulation(annotations[i])
          tab_note.addModifier(score_articulation, 0)
        else if getStrokeParts(annotations[i])
          stroke = @makeStroke(annotations[i])
          tab_note.addModifier(stroke, 0)
        else
          annotation = @makeAnnotation(annotations[i])
          tab_note.addModifier(@makeAnnotation(annotations[i]), 0) if annotation
    else
      for note, i in stave_notes[stave_notes.length - annotations.length..]
        unless getScoreArticulationParts(annotations[i])
          annotation = @makeAnnotation(annotations[i])
          note.addAnnotation(0, @makeAnnotation(annotations[i])) if annotation

    # Add glyph articulations, strokes, or fingerings on score
    if stave.note
      for note, i in stave_notes[stave_notes.length - annotations.length..]
        score_articulation = @makeScoreArticulation(annotations[i])
        note.addArticulation(0, score_articulation) if score_articulation?

        stroke = @makeStroke(annotations[i])
        note.addStroke(0, stroke) if stroke?

        fingerings = @makeFingering(annotations[i])
        if fingerings?
          try
            (note.addModifier(fingering.num, fingering.modifier) for fingering in fingerings)
          catch e
            throw new Vex.RERR("ArtistError", "Bad note number in fingering: #{annotations[i]}")

  addTabArticulation: (type, first_note, last_note, first_indices, last_indices) ->
    L "addTabArticulations: ", type, first_note, last_note, first_indices, last_indices

    if type == "t"
      last_note.addModifier(
        new Vex.Flow.Annotation("T").
          setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.BOTTOM))

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
    score_notes = stave.note_notes
    modifier = null
    score_modifier = null

    if decorator == "v"
      modifier = new Vex.Flow.Vibrato()
    if decorator == "V"
      modifier = new Vex.Flow.Vibrato().setHarsh(true)
    if decorator == "u"
      modifier = new Vex.Flow.Articulation("a|").setPosition(Vex.Flow.Modifier.Position.BELOW)
      score_modifier = new Vex.Flow.Articulation("a|").setPosition(Vex.Flow.Modifier.Position.BELOW)
    if decorator == "d"
      modifier = new Vex.Flow.Articulation("am").setPosition(Vex.Flow.Modifier.Position.BELOW)
      score_modifier = new Vex.Flow.Articulation("am").setPosition(Vex.Flow.Modifier.Position.BELOW)

    _.last(tab_notes).addModifier(modifier, 0) if modifier?
    _.last(score_notes)?.addArticulation(0, score_modifier) if score_modifier?


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
      @addStaveNote
        spec: ["r/4"]
        accidentals: []
        is_rest: true
    else
      position = @tuning.getNoteForFret((parseInt(params["position"], 10) + 5) * 2, 6)
      @addStaveNote
        spec: [position]
        accidentals: []
        is_rest: true

    tab_notes = _.last(@staves).tab_notes
    if @customizations["tab-stems"] == "true"
      tab_note = new Vex.Flow.StaveNote({
        keys: [position || "r/4"]
        duration: @current_duration + "r"
        clef: "treble"
        auto_stem: false
      })
      if @current_duration[@current_duration.length - 1] == "d"
        tab_note.addDot(0)
      tab_notes.push tab_note
    else
      tab_notes.push new Vex.Flow.GhostNote(@current_duration)

  addChord: (chord, chord_articulation, chord_decorator) ->
    return if _.isEmpty(chord)
    L "addChord: ", chord
    stave = _.last(@staves)

    specs = []          # The stave note specs
    play_notes = []     # Notes to be played by audio players
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
      if note.abc? or note.string != current_string
        current_position = 0
        current_string = note.string

      unless specs[current_position]?
        # New position. Create new element arrays for this
        # position.
        specs[current_position] = []
        play_notes[current_position] = []
        accidentals[current_position] = []
        tab_specs[current_position] = []
        articulations[current_position] = []
        decorators[current_position] = []

      [new_note, new_octave, accidental] = [null, null, null]

      play_note = null

      if note.abc?
        octave = if note.octave? then note.octave else note.string
        [new_note, new_octave, accidental] = @getNoteForABC(note.abc, octave)
        if accidental?
          acc = accidental.split("_")[0]
        else
          acc = ""

        play_note = "#{new_note}#{acc}"
        note.fret = 'X' unless note.fret?
      else if note.fret?
        [new_note, new_octave, accidental] = @getNoteForFret(note.fret, note.string)
        play_note = @tuning.getNoteForFret(note.fret, note.string).split("/")[0]
      else
        throw new Vex.RERR("ArtistError", "No note specified")

      play_octave = parseInt(new_octave, 10) + @current_octave_shift

      current_duration = if note.time? then {time: note.time, dot: note.dot} else null
      specs[current_position].push "#{new_note}/#{new_octave}"
      play_notes[current_position].push "#{play_note}/#{play_octave}"
      accidentals[current_position].push accidental
      tab_specs[current_position].push {fret: note.fret, str: note.string}
      articulations[current_position].push note.articulation if note.articulation?
      durations[current_position] = current_duration
      decorators[current_position] = note.decorator if note.decorator?

      current_position++

    for spec, i in specs
      saved_duration = @current_duration
      @setDuration(durations[i].time, durations[i].dot) if durations[i]?
      @addTabNote tab_specs[i], play_notes[i]
      @addStaveNote {spec: spec, accidentals: accidentals[i], play_note: play_notes[i]} if stave.note?
      @addArticulations articulations[i]
      @addDecorator decorators[i] if decorators[i]?

    if chord_articulation?
      art = []
      art.push chord_articulation for num in [1..num_notes]
      @addArticulations art

    @addDecorator chord_decorator if chord_decorator?

  addNote: (note) ->
    @addChord([note])

  addTextVoice: ->
    _.last(@staves).text_voices.push []

  setTextFont: (font) ->
    if font?
      parts = font.match(/([^-]*)-([^-]*)-([^.]*)/)
      if parts?
        @customizations["font-face"] = parts[1]
        @customizations["font-size"] = parseInt(parts[2], 10)
        @customizations["font-style"] = parts[3]

  addTextNote: (text, position=0, justification="center", smooth=true, ignore_ticks=false) ->
    voices = _.last(@staves).text_voices
    throw new Vex.RERR("ArtistError", "Can't add text note without text voice") if _.isEmpty(voices)

    font_face = @customizations["font-face"]
    font_size = @customizations["font-size"]
    font_style = @customizations["font-style"]

    just = switch justification
      when "center"
        Vex.Flow.TextNote.Justification.CENTER
      when "left"
        Vex.Flow.TextNote.Justification.LEFT
      when "right"
        Vex.Flow.TextNote.Justification.RIGHT
      else
        Vex.Flow.TextNote.Justification.CENTER

    duration = if ignore_ticks then "b" else @current_duration

    struct =
      text: text
      duration: duration
      smooth: smooth
      ignore_ticks: ignore_ticks
      font:
        family: font_face
        size: font_size
        weight: font_style

    if text[0] == "#"
      struct.glyph = text[1..]

    note = new Vex.Flow.TextNote(struct).
      setLine(position).setJustification(just)

    _.last(voices).push(note)

  addVoice: (options) ->
    @closeBends()
    stave = _.last(@staves)
    return @addStave(options) unless stave?

    unless _.isEmpty(stave.tab_notes)
      stave.tab_voices.push(stave.tab_notes)
      stave.tab_notes = []

    unless _.isEmpty(stave.note_notes)
      stave.note_voices.push(stave.note_notes)
      stave.note_notes = []

  addStave: (element, options) ->
    opts =
      tuning: "standard"
      clef: "treble"
      key: "C"
      notation: if element == "tabstave" then "false" else "true"
      tablature: if element == "stave" then "false" else "true"
      strings: 6

    _.extend(opts, options)
    L "addStave: ", element, opts

    tab_stave = null
    note_stave = null

    # This is used to line up tablature and notation.
    start_x = @x + @customizations["connector-space"]
    tabstave_start_x = 40

    if opts.notation is "true"
      note_stave = new Vex.Flow.Stave(start_x, @last_y, @customizations.width - 20,
        {left_bar: false})
      note_stave.addClef(opts.clef) if opts.clef isnt "none"
      note_stave.addKeySignature(opts.key)
      note_stave.addTimeSignature(opts.time) if opts.time?

      @last_y += note_stave.getHeight() +
                 @options.note_stave_lower_spacing +
                 parseInt(@customizations["stave-distance"], 10)
      tabstave_start_x = note_stave.getNoteStartX()
      @current_clef = if opts.clef is "none" then "treble" else opts.clef

    if opts.tablature is "true"
      tab_stave = new Vex.Flow.TabStave(start_x, @last_y, @customizations.width - 20,
        {left_bar: false}).setNumLines(opts.strings)
      tab_stave.addTabGlyph() if opts.clef isnt "none"
      tab_stave.setNoteStartX(tabstave_start_x)
      @last_y += tab_stave.getHeight() + @options.tab_stave_lower_spacing

    @closeBends()
    beam_groups = Vex.Flow.Beam.getDefaultBeamGroups(opts.time)
    @staves.push {
      tab: tab_stave,
      note: note_stave,
      tab_voices: [],
      note_voices: [],
      tab_notes: [],
      note_notes: [],
      text_voices: [],
      beam_groups: beam_groups
    }

    @tuning.setTuning(opts.tuning)
    @key_manager.setKey(opts.key)

    return

  runCommand: (line, _l=0, _c=0) ->
    L "runCommand: ", line
    words = line.split(/\s+/)
    switch words[0]
      when "octave-shift"
        @current_octave_shift = parseInt(words[1], 10)
        L "Octave shift: ", @current_octave_shift
      else
        throw new Vex.RERR("ArtistError", "Invalid command '#{words[0]}' at line #{_l} column #{_c}")

export default Artist
