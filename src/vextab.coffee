# Vex.Flow.VexTab
# Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
#
# This class implements the semantic analysis of the Jison
# output, and generates elements that can be used by
# Vex.Flow.Artist to render the notation.
# parsed by Vex.Flow.VexTab.

import Vex from 'vexflow'
import * as _ from 'lodash'
import * as parser from './vextab.jison'

class VexTab
  @DEBUG = false
  L = (args...) -> console?.log("(Vex.Flow.VexTab)", args...) if VexTab.DEBUG

  # Private methods
  newError = (object, msg) ->
    new Vex.RERR("ParseError",
                 "#{msg} in line #{object._l} column #{object._c}")

  # Public methods
  constructor: (@artist) ->
    @reset()

  reset: ->
    @valid = false
    @elements = false

  isValid: -> @valid

  getArtist: -> return @artist

  parseStaveOptions: (options) ->
    params = {}
    return params unless options?

    notation_option = null
    for option in options
      error = (msg) -> newError(option, msg)
      params[option.key] = option.value
      switch option.key
        when "notation", "tablature"
          notation_option = option
          throw error("'#{option.key}' must be 'true' or 'false'") if option.value not in ["true", "false"]
        when "key"
          throw error("Invalid key signature '#{option.value}'") unless _.has(Vex.Flow.keySignature.keySpecs, option.value)
        when "clef"
          clefs = ["treble", "bass", "tenor", "alto", "percussion", "none"]
          throw error("'clef' must be one of #{clefs.join(', ')}") if option.value not in clefs
        when "voice"
          voices = ["top", "bottom", "new"]
          throw error("'voice' must be one of #{voices.join(', ')}") if option.value not in voices
        when "time"
          try
            new Vex.Flow.TimeSignature(option.value)
          catch e
            throw error("Invalid time signature: '#{option.value}'")
        when "tuning"
          try
            new Vex.Flow.Tuning(option.value)
          catch e
            throw error("Invalid tuning: '#{option.value}'")
        when "strings"
          num_strings = parseInt(option.value)
          throw error("Invalid number of strings: #{num_strings}") if (num_strings < 4 or num_strings > 8)
        else
          throw error("Invalid option '#{option.key}'")

    if params.notation == "false" and params.tablature == "false"
      throw newError(notation_option, "Both 'notation' and 'tablature' can't be invisible")

    return params

  parseCommand: (element) ->
    if element.command is "bar"
      @artist.addBar(element.type)

    if element.command is "tuplet"
      @artist.makeTuplets(element.params.tuplet, element.params.notes)

    if element.command is "annotations"
      @artist.addAnnotations(element.params)

    if element.command is "rest"
      @artist.addRest(element.params)

    if element.command is "command"
      @artist.runCommand(element.params, element._l, element._c)

  parseChord: (element) ->
    L "parseChord:", element
    @artist.addChord(
      _.map(element.chord,
            (note)-> _.pick(note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator')),
      element.articulation, element.decorator)

  parseFret: (note) ->
    @artist.addNote(_.pick(
      note, 'time', 'dot', 'fret', 'string', 'articulation', 'decorator'))

  parseABC: (note) ->
    @artist.addNote(_.pick(
      note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator'))

  parseStaveElements: (notes) ->
    L "parseStaveElements:", notes
    for element in notes
      if element.time
        @artist.setDuration(element.time, element.dot)

      if element.command
        @parseCommand(element)

      if element.chord
        @parseChord(element)

      if element.abc
        @parseABC(element)
      else if element.fret
        @parseFret(element)

  parseStaveText: (text_line) ->
    @artist.addTextVoice() unless _.isEmpty(text_line)

    position = 0
    justification = "center"
    smooth = true
    font = null

    bartext = => @artist.addTextNote("", 0, justification, false, true)
    createNote = (text) =>
      ignore_ticks = false
      if text[0] == "|"
        ignore_ticks = true
        text = text[1..]

      try
        @artist.addTextNote(text, position, justification, smooth, ignore_ticks)
      catch e
        throw newError(str, "Bad text or duration. Did you forget a comma?" + e)

    for str in text_line
      text = str.text.trim()
      if text.match(/\.font=.*/)
        font = text[6..]
        @artist.setTextFont(font)
      else if text[0] == ":"
        @artist.setDuration(text)
      else if text[0] == "."
        command = text[1..]
        switch command
          when "center", "left", "right"
            justification = command
          when "strict"
            smooth = false
          when "smooth"
            smooth = true
          when "bar", "|"
            bartext()
          else
            position = parseInt(text[1..], 10)
      else if text == "|"
        bartext()
      else if text[0..1] == "++"
        @artist.addTextVoice()
      else
        createNote(text)

  generate: ->
    for stave in @elements
      switch stave.element
        when "stave", "tabstave"
          @artist.addStave(stave.element, @parseStaveOptions(stave.options))
          @parseStaveElements(stave.notes) if stave.notes?
          @parseStaveText(stave.text) if stave.text?
        when "voice"
          @artist.addVoice(@parseStaveOptions(stave.options))
          @parseStaveElements(stave.notes) if stave.notes?
          @parseStaveText(stave.text) if stave.text?
        when "options"
          options = {}
          for option in stave.params
            options[option.key] = option.value
          try
            @artist.setOptions(options)
          catch e
            throw newError(stave, e.message)
        else
          throw newError(stave, "Invalid keyword '#{stave.element}'")

  parse: (code) ->
    parser.parseError = (message, hash) ->
      L "VexTab parse error: ", message, hash
      message = "Unexpected text '#{hash.text}' at line #{hash.loc.first_line} column #{hash.loc.first_column}."
      throw new Vex.RERR("ParseError", message)

    throw new Vex.RERR("ParseError", "No code") unless code?

    L "Parsing:\n#{code}"

    # Strip lines
    stripped_code = (line.trim() for line in code.split(/\r\n|\r|\n/))
    @elements = parser.parse(stripped_code.join("\n"))
    if @elements
      @generate()
      @valid = true

    return @elements

export default VexTab
